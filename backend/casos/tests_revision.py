"""
Revisión técnica (S12): el checklist sale de la plantilla del ítem, "Falta" no deja aprobar
y "pedir" deja el caso en espera del odontólogo hasta que llegue lo que falta.
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
        'revision': con_sesion('laura@lab-a.test', [Rol.REVISION]),
        'cad': con_sesion('carla@lab-a.test', [Rol.CAD]),
    }


@pytest.fixture
def caso(equipo, catalogo, cliente_y_profesional):
    """Una corona que ya pasó Recepción: está en Revisión técnica."""
    clinica, profesional = cliente_y_profesional
    profesional.whatsapp = '+54 9 11 5555-0000'
    profesional.save()
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    datos = {
        'cliente': str(clinica.id),
        'profesional': str(profesional.id),
        'paciente': 'JP',
        'fecha_prometida': str(timezone.localdate() + timedelta(days=7)),
        'pasar_a_revision': True,
        'trabajos': [{'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'A2'}],
    }
    r = equipo['recepcion'].post('/api/casos', datos, format='json')
    assert r.status_code == 201, r.content
    return r.json()


def _estado(cliente, caso):
    return cliente.get(f'/api/casos/{caso["id"]}/revision').json()


def _revisar(cliente, caso, marcas, decision, mensaje=''):
    datos = {'marcas': marcas, 'decision': decision, 'mensaje': mensaje}
    return cliente.post(f'/api/casos/{caso["id"]}/revision', datos, format='json')


def _etapa(cliente, caso):
    return cliente.get(f'/api/casos/{caso["id"]}').json()['trabajos'][0]['etapa_actual']['nombre']


def test_el_checklist_sale_de_la_plantilla_del_item(equipo, caso):
    estado = _estado(equipo['revision'], caso)
    assert estado['en_revision'] is True
    assert len(estado['checklist']) == 7
    assert estado['whatsapp'] == '+54 9 11 5555-0000'
    assert estado['revisiones'] == []


def test_aprobar_con_todo_bien_pasa_a_diseno(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    r = _revisar(equipo['revision'], caso, ['ok'] * n, 'aprobar')
    assert r.status_code == 201, r.content
    assert r.json()['revisiones'][0]['decision'] == 'aprobar'
    assert r.json()['revisiones'][0]['por'] == 'laura@lab-a.test'
    assert _etapa(equipo['revision'], caso) == 'Diseño exocad'
    assert Evento.objects.filter(accion='revision_tecnica').exists()
    sistema = Mensaje.objects.get(caso_id=caso['id'], tipo='sistema')
    assert sistema.etapa == 'Revisión técnica'


def test_falta_no_deja_aprobar(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    marcas = ['ok'] * n
    marcas[2] = 'falta'
    r = _revisar(equipo['revision'], caso, marcas, 'aprobar')
    assert r.status_code == 400
    assert 'Falta' in r.json()['decision'][0]
    assert _etapa(equipo['revision'], caso) == 'Revisión técnica'


def test_con_falta_se_puede_aprobar_con_nota_tecnica(equipo, caso):
    checklist = _estado(equipo['revision'], caso)['checklist']
    marcas = ['ok'] * len(checklist)
    marcas[3] = 'duda'
    r = _revisar(equipo['revision'], caso, marcas, 'consulta')
    assert r.status_code == 201, r.content
    assert _etapa(equipo['revision'], caso) == 'Diseño exocad'
    sistema = Mensaje.objects.get(caso_id=caso['id'], tipo='sistema')
    assert checklist[3].lower() in sistema.texto


def test_hay_que_marcar_todos_los_puntos(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    marcas = ['ok'] * n
    marcas[0] = ''
    r = _revisar(equipo['revision'], caso, marcas, 'consulta')
    assert r.status_code == 400
    assert 'Marcá todos' in r.json()['marcas'][0]
    assert _revisar(equipo['revision'], caso, ['ok'], 'aprobar').status_code == 400


def test_pedir_deja_en_espera_y_no_avanza(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    marcas = ['ok'] * n
    marcas[2] = 'falta'
    assert _revisar(equipo['revision'], caso, marcas, 'pedir').status_code == 400  # sin mensaje
    r = _revisar(equipo['revision'], caso, marcas, 'pedir', 'Nos falta el registro de mordida.')
    assert r.status_code == 201, r.content
    assert r.json()['en_espera'] is True
    pedido = Mensaje.objects.get(caso_id=caso['id'], tipo='odontologo')
    assert pedido.texto == 'Nos falta el registro de mordida.'
    # En espera no avanza nadie, ni con una nueva revisión aprobada.
    trabajo = caso['trabajos'][0]['id']
    assert equipo['revision'].post(f'/api/casos/{caso["id"]}/trabajos/{trabajo}/avanzar').status_code == 409
    assert _revisar(equipo['revision'], caso, ['ok'] * n, 'aprobar').status_code == 409


def test_llego_lo_pedido_vuelve_a_revision(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    _revisar(equipo['revision'], caso, ['falta'] * n, 'pedir', 'Falta todo.')
    assert equipo['cad'].post(f'/api/casos/{caso["id"]}/revision/llego').status_code == 403
    r = equipo['recepcion'].post(f'/api/casos/{caso["id"]}/revision/llego')
    assert r.status_code == 200, r.content
    assert r.json()['en_espera'] is False
    assert _revisar(equipo['revision'], caso, ['ok'] * n, 'aprobar').status_code == 201
    estado = _estado(equipo['revision'], caso)
    assert [x['decision'] for x in estado['revisiones']] == ['aprobar', 'pedir']
    assert estado['en_revision'] is False
    # Ya no espera nada.
    assert equipo['recepcion'].post(f'/api/casos/{caso["id"]}/revision/llego').status_code == 400


def test_revision_no_se_saltea_con_avanzar(equipo, caso):
    trabajo = caso['trabajos'][0]['id']
    r = equipo['revision'].post(f'/api/casos/{caso["id"]}/trabajos/{trabajo}/avanzar')
    assert r.status_code == 400
    assert 'checklist' in r.json()['detail']


def test_solo_revision_revisa(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    assert _revisar(equipo['recepcion'], caso, ['ok'] * n, 'aprobar').status_code == 403
    assert _revisar(equipo['cad'], caso, ['ok'] * n, 'aprobar').status_code == 403


def test_fuera_de_revision_no_se_revisa(equipo, caso):
    n = len(_estado(equipo['revision'], caso)['checklist'])
    _revisar(equipo['revision'], caso, ['ok'] * n, 'aprobar')
    r = _revisar(equipo['revision'], caso, ['ok'] * n, 'aprobar')
    assert r.status_code == 400
    assert 'no está en revisión' in r.json()['detail']


def test_otro_laboratorio_da_404(caso, otro_laboratorio, crear_persona):
    crear_persona(otro_laboratorio, 'ajeno@lab-b.test', [Rol.REVISION])
    ajeno = APIClient()
    ajeno.post('/api/auth/ingresar', {'email': 'ajeno@lab-b.test', 'password': PASSWORD}, format='json')
    assert ajeno.get(f'/api/casos/{caso["id"]}/revision').status_code == 404
