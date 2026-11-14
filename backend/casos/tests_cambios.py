"""
Cambios con acuse de lectura (S7). Escritos antes que el código, porque es la regla que
justifica el sistema: "mejor A3" no se puede perder.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import Evento
from catalogo.models import ItemCatalogo
from conftest import PASSWORD, aprobar_revision
from cuentas.models import Rol

pytestmark = pytest.mark.django_db

CORONA = {'36': {'toothSelection': 'tooth-base', 'toothSubstrate': 'crownprep', 'restorationType': 'crown'}}


@pytest.fixture
def equipo(laboratorio, crear_persona):
    """Un cliente HTTP con sesión por persona."""

    def con_sesion(email, roles):
        crear_persona(laboratorio, email, roles)
        cliente = APIClient()
        r = cliente.post('/api/auth/ingresar', {'email': email, 'password': PASSWORD}, format='json')
        assert r.status_code == 200
        return cliente

    return {
        'recepcion': con_sesion('rita@lab-a.test', [Rol.RECEPCION]),
        'cad': con_sesion('carla@lab-a.test', [Rol.CAD]),
        'supervision': con_sesion('sole@lab-a.test', [Rol.SUPERVISION]),
    }


@pytest.fixture
def caso(equipo, catalogo, cliente_y_profesional):
    """Una corona A2 que ya está en Diseño (etapa 3, la tiene CAD)."""
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    datos = {
        'cliente': str(clinica.id),
        'profesional': str(profesional.id),
        'paciente': 'JP',
        'fecha_prometida': str(timezone.localdate() + timedelta(days=7)),
        'trabajos': [{'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'A2'}],
    }
    caso = equipo['recepcion'].post('/api/casos', datos, format='json').json()
    equipo['supervision'].post(f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/avanzar')
    assert aprobar_revision(equipo['supervision'], caso['id']).status_code == 201
    return equipo['supervision'].get(f'/api/casos/{caso["id"]}').json()


def _cambiar(cliente, caso, cambios, motivo='El odontólogo pidió otro color por WhatsApp'):
    datos = {'trabajo': caso['trabajos'][0]['id'], 'cambios': cambios, 'motivo': motivo}
    return cliente.post(f'/api/casos/{caso["id"]}/cambios', datos, format='json')


def _avanzar(cliente, caso):
    return cliente.post(f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/avanzar')


def _confirmar(cliente, caso, **datos):
    return cliente.post(f'/api/casos/{caso["id"]}/cambios/confirmar', datos, format='json')


def test_el_caso_nace_con_la_version_1_y_sin_nada_pendiente(caso):
    assert caso['version_ficha'] == 1
    assert caso['cambio_pendiente'] is None


def test_un_cambio_crea_la_version_2_y_bloquea(equipo, caso):
    r = _cambiar(equipo['recepcion'], caso, {'color': 'a3'})
    assert r.status_code == 201, r.content
    datos = r.json()
    assert datos['version_ficha'] == 2
    assert datos['trabajos'][0]['color'] == 'A3'
    pendiente = datos['cambio_pendiente']
    assert pendiente['version'] == 2
    assert pendiente['cambios'] == [
        {'trabajo': caso['trabajos'][0]['id'], 'campo': 'color', 'antes': 'A2', 'despues': 'A3'}
    ]
    assert pendiente['confirma'] == ['cad']
    assert Evento.objects.filter(accion='cambio_registrado').exists()


def test_el_historial_guarda_las_dos_versiones(equipo, caso):
    _cambiar(equipo['recepcion'], caso, {'color': 'A3'})
    fichas = equipo['cad'].get(f'/api/casos/{caso["id"]}/fichas').json()
    assert [f['version'] for f in fichas] == [2, 1]
    assert fichas[1]['trabajos'][0]['color'] == 'A2'
    assert fichas[0]['trabajos'][0]['color'] == 'A3'


def test_un_cambio_sin_diferencias_no_se_registra(equipo, caso):
    assert _cambiar(equipo['recepcion'], caso, {'color': 'A2'}).status_code == 400


def test_el_cambio_pasa_por_las_mismas_reglas_fijas(equipo, caso):
    r = _cambiar(equipo['recepcion'], caso, {'color': 'Z9'})
    assert r.status_code == 400
    assert 'color' in r.json()


def test_el_motivo_es_obligatorio(equipo, caso):
    assert _cambiar(equipo['recepcion'], caso, {'color': 'A3'}, motivo=' ').status_code == 400


def test_cad_no_registra_cambios(equipo, caso):
    assert _cambiar(equipo['cad'], caso, {'color': 'A3'}).status_code == 403


def test_con_un_cambio_sin_confirmar_nadie_avanza(equipo, caso):
    _cambiar(equipo['recepcion'], caso, {'color': 'A3'})
    for quien in ('cad', 'supervision'):
        r = _avanzar(equipo[quien], caso)
        assert r.status_code == 409
        assert 'cambio' in r.json()['detail']


def test_confirma_quien_tiene_la_etapa_actual(equipo, caso):
    _cambiar(equipo['recepcion'], caso, {'color': 'A3'})
    assert _confirmar(equipo['recepcion'], caso).status_code == 403
    r = _confirmar(equipo['cad'], caso)
    assert r.status_code == 200, r.content
    assert r.json()['cambio_pendiente'] is None
    assert _avanzar(equipo['cad'], caso).status_code == 200
    assert Evento.objects.filter(accion='cambio_confirmado').exists()


def test_dos_cambios_seguidos_se_confirman_juntos(equipo, caso):
    _cambiar(equipo['recepcion'], caso, {'color': 'A3'})
    datos = _cambiar(equipo['recepcion'], caso, {'material': 'Disilicato'}).json()
    # Disilicato no es material de la zirconia: el catálogo lo rechaza.
    assert 'material' in datos
    datos = _cambiar(equipo['recepcion'], caso, {'observaciones': 'Borde incisal translúcido'}).json()
    assert datos['version_ficha'] == 3
    assert {c['campo'] for c in datos['cambio_pendiente']['cambios']} == {'color', 'observaciones'}
    _confirmar(equipo['cad'], caso)
    assert _avanzar(equipo['cad'], caso).status_code == 200


def test_confirmar_y_rehacer_vuelve_a_una_etapa_anterior(equipo, caso):
    _cambiar(equipo['recepcion'], caso, {'color': 'A3'})
    r = _confirmar(equipo['cad'], caso, rehacer=True, volver_a=2, comentario='Hay que revisar de nuevo el color')
    assert r.status_code == 200, r.content
    trabajo = r.json()['trabajos'][0]
    assert trabajo['etapa_actual']['nombre'] == 'Revisión técnica'
    assert [e['estado'] for e in trabajo['etapas']][:4] == ['hecha', 'en_curso', 'pendiente', 'pendiente']


def test_no_se_puede_volver_a_una_etapa_que_no_paso(equipo, caso):
    _cambiar(equipo['recepcion'], caso, {'color': 'A3'})
    assert _confirmar(equipo['cad'], caso, rehacer=True, volver_a=5).status_code == 400


def test_confirmar_sin_nada_pendiente(equipo, caso):
    assert _confirmar(equipo['cad'], caso).status_code == 400


def test_un_caso_cerrado_no_acepta_cambios(equipo, caso):
    equipo['supervision'].post(f'/api/casos/{caso["id"]}/cancelar', {'motivo': 'No se hace'}, format='json')
    assert _cambiar(equipo['recepcion'], caso, {'color': 'A3'}).status_code == 400


def test_un_trabajo_terminado_lo_confirma_recepcion(equipo, caso):
    for _ in range(6):
        _avanzar(equipo['supervision'], caso)
    _cambiar(equipo['recepcion'], caso, {'observaciones': 'Entregar en caja chica'})
    assert _confirmar(equipo['recepcion'], caso).status_code == 200
