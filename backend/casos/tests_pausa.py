"""
Pausa manual del caso: Recepción o Supervisión lo frenan con un motivo, nadie avanza hasta
reanudarlo, y queda en la conversación y en la auditoría.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import Evento
from catalogo.models import ItemCatalogo
from conftest import PASSWORD
from cuentas.models import Rol
from hilo.models import Mensaje

pytestmark = pytest.mark.django_db

CORONA = {'36': {'toothSelection': 'tooth-base', 'toothSubstrate': 'crownprep', 'restorationType': 'crown'}}


@pytest.fixture
def equipo(laboratorio, crear_persona):
    def con_sesion(email, roles):
        crear_persona(laboratorio, email, roles)
        cliente = APIClient()
        r = cliente.post('/api/auth/ingresar', {'email': email, 'password': PASSWORD}, format='json')
        assert r.status_code == 200
        return cliente

    return {
        'recepcion': con_sesion('rita@lab-a.test', [Rol.RECEPCION]),
        'supervision': con_sesion('sara@lab-a.test', [Rol.SUPERVISION]),
        'produccion': con_sesion('pablo@lab-a.test', [Rol.PRODUCCION]),
    }


@pytest.fixture
def caso(equipo, catalogo, cliente_y_profesional):
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    datos = {
        'cliente': str(clinica.id),
        'profesional': str(profesional.id),
        'paciente': 'JP',
        'fecha_prometida': str(timezone.localdate() + timedelta(days=7)),
        'trabajos': [{'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'A2'}],
    }
    r = equipo['recepcion'].post('/api/casos', datos, format='json')
    assert r.status_code == 201, r.content
    return r.json()


def _pausar(cliente, caso, motivo='Falta definir el color con el odontólogo'):
    return cliente.post(f'/api/casos/{caso["id"]}/pausar', {'motivo': motivo}, format='json')


def test_recepcion_pausa_con_motivo_y_queda_registrado(equipo, caso):
    r = _pausar(equipo['recepcion'], caso)
    assert r.status_code == 200, r.content
    c = r.json()
    assert c['pausado'] is True
    assert c['pausa_motivo'] == 'Falta definir el color con el odontólogo'
    assert c['pausa_desde'] is not None
    assert Mensaje.objects.filter(caso_id=caso['id'], tipo='sistema', texto__contains='pausó el caso').exists()
    assert Evento.objects.filter(accion='caso_pausado').exists()


def test_pausar_pide_motivo(equipo, caso):
    r = _pausar(equipo['recepcion'], caso, motivo='   ')
    assert r.status_code == 400
    assert equipo['recepcion'].get(f'/api/casos/{caso["id"]}').json()['pausado'] is False


def test_no_se_pausa_dos_veces(equipo, caso):
    assert _pausar(equipo['recepcion'], caso).status_code == 200
    assert _pausar(equipo['supervision'], caso).status_code == 400


def test_produccion_no_puede_pausar(equipo, caso):
    assert _pausar(equipo['produccion'], caso).status_code == 403


def test_pausado_no_avanza_hasta_reanudar(equipo, caso):
    trabajo = caso['trabajos'][0]['id']
    url = f'/api/casos/{caso["id"]}/trabajos/{trabajo}/avanzar'
    _pausar(equipo['recepcion'], caso)
    r = equipo['recepcion'].post(url)
    assert r.status_code == 409
    assert 'pausado' in r.json()['detail']

    r = equipo['supervision'].post(f'/api/casos/{caso["id"]}/reanudar')
    assert r.status_code == 200
    assert r.json()['pausado'] is False
    assert r.json()['pausa_motivo'] == ''
    assert equipo['recepcion'].post(url).status_code == 200
    assert Evento.objects.filter(accion='caso_reanudado').exists()


def test_reanudar_un_caso_que_no_esta_pausado_es_un_error(equipo, caso):
    assert equipo['recepcion'].post(f'/api/casos/{caso["id"]}/reanudar').status_code == 400
