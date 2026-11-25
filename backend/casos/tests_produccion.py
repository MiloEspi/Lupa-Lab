"""
Producción con QR (S13): iniciar la etapa y reportar un problema. Cada toque guarda quién y
cuándo (docs/03 §11). Escritos antes que el código.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import Evento
from casos.models import EtapaTrabajo
from catalogo.models import ItemCatalogo
from conftest import PASSWORD, aprobar_revision
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
        'cad': con_sesion('carla@lab-a.test', [Rol.CAD]),
        'produccion': con_sesion('pablo@lab-a.test', [Rol.PRODUCCION]),
        'control': con_sesion('cora@lab-a.test', [Rol.CONTROL]),
        'supervision': con_sesion('sole@lab-a.test', [Rol.SUPERVISION]),
    }


def _ir_a(equipo, caso, etapa):
    """Avanza el caso hasta que `etapa` quede en curso."""
    cliente = equipo['supervision']
    ruta = f'/api/casos/{caso["id"]}'
    trabajo = caso['trabajos'][0]['id']
    while True:
        actual = cliente.get(ruta).json()['trabajos'][0]['etapa_actual']
        if actual['nombre'] == etapa:
            return cliente.get(ruta).json()
        if actual['nombre'] == 'Revisión técnica':
            assert aprobar_revision(cliente, caso['id']).status_code == 201
        else:
            assert cliente.post(f'{ruta}/trabajos/{trabajo}/avanzar').status_code == 200


@pytest.fixture
def caso(equipo, catalogo, cliente_y_profesional):
    """Una corona que está en Fresado (la tiene Producción)."""
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    datos = {
        'cliente': str(clinica.id),
        'profesional': str(profesional.id),
        'paciente': 'JP',
        'fecha_prometida': str(timezone.localdate() + timedelta(days=7)),
        'trabajos': [{'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'A2'}],
    }
    creado = equipo['recepcion'].post('/api/casos', datos, format='json').json()
    return _ir_a(equipo, creado, 'Fresado')


def _iniciar(cliente, caso):
    return cliente.post(f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/iniciar')


def _problema(cliente, caso, texto='Se rompió la fresa y la corona quedó con un borde astillado'):
    return cliente.post(
        f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/problema', {'texto': texto}, format='json'
    )


# --- Iniciar -------------------------------------------------------------------------------


def test_un_trabajo_nuevo_llega_a_la_etapa_sin_iniciar(caso):
    etapa = caso['trabajos'][0]['etapas'][3]
    assert etapa['estado'] == 'en_curso'
    assert etapa['iniciada'] is None
    assert etapa['iniciada_por'] is None


def test_produccion_inicia_su_etapa_y_queda_quien_y_cuando(equipo, caso):
    r = _iniciar(equipo['produccion'], caso)
    assert r.status_code == 200, r.content
    etapa = r.json()['trabajos'][0]['etapas'][3]
    assert etapa['estado'] == 'en_curso'
    assert etapa['iniciada'] is not None
    assert etapa['iniciada_por'] == 'pablo@lab-a.test'
    assert Evento.objects.filter(accion='etapa_iniciada').count() == 1


def test_el_caso_no_cambia_de_etapa_al_iniciar(equipo, caso):
    r = _iniciar(equipo['produccion'], caso)
    assert r.json()['trabajos'][0]['etapa_actual']['nombre'] == 'Fresado'


def test_iniciar_dos_veces_no_pisa_la_primera(equipo, caso):
    assert _iniciar(equipo['produccion'], caso).status_code == 200
    r = _iniciar(equipo['supervision'], caso)
    assert r.status_code == 400
    assert 'pablo' in r.json()['detail']
    fresado = EtapaTrabajo.objects.get(trabajo_id=caso['trabajos'][0]['id'], orden=4)
    assert fresado.iniciada_por.usuario.email.startswith('pablo')


@pytest.mark.parametrize('quien', ['recepcion', 'cad', 'control'])
def test_solo_el_rol_de_la_etapa_o_supervision_la_inicia(equipo, caso, quien):
    assert _iniciar(equipo[quien], caso).status_code == 403
    assert Evento.objects.filter(accion='etapa_iniciada').count() == 0


def test_supervision_cubre_a_cualquiera(equipo, caso):
    assert _iniciar(equipo['supervision'], caso).status_code == 200


def test_con_un_cambio_sin_confirmar_no_se_inicia(equipo, caso):
    r = equipo['recepcion'].post(
        f'/api/casos/{caso["id"]}/cambios',
        {'trabajo': caso['trabajos'][0]['id'], 'cambios': {'color': 'A3'}, 'motivo': 'Pidió A3'},
        format='json',
    )
    assert r.status_code == 201
    assert _iniciar(equipo['produccion'], caso).status_code == 409


def test_en_espera_del_odontologo_no_se_inicia(equipo, caso):
    from casos.models import Caso

    Caso.objects.filter(pk=caso['id']).update(en_espera=True)
    assert _iniciar(equipo['produccion'], caso).status_code == 409


def test_no_se_inicia_un_caso_cancelado(equipo, caso):
    r = equipo['recepcion'].post(f'/api/casos/{caso["id"]}/cancelar', {'motivo': 'No va más'}, format='json')
    assert r.status_code == 200
    assert _iniciar(equipo['produccion'], caso).status_code == 400


def test_terminar_una_etapa_iniciada_arranca_la_siguiente_sin_iniciar(equipo, caso):
    _iniciar(equipo['produccion'], caso)
    r = equipo['produccion'].post(f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/avanzar')
    assert r.status_code == 200
    etapas = r.json()['trabajos'][0]['etapas']
    assert etapas[3]['estado'] == 'hecha'
    assert etapas[3]['iniciada'] is not None
    assert etapas[4]['estado'] == 'en_curso'
    assert etapas[4]['iniciada'] is None


def test_rehacer_desde_una_etapa_anterior_borra_quien_habia_iniciado_las_que_vuelven(equipo, caso):
    """Un cambio que obliga a rehacer desde Diseño deja Fresado pendiente y sin iniciar."""
    _iniciar(equipo['produccion'], caso)
    equipo['recepcion'].post(
        f'/api/casos/{caso["id"]}/cambios',
        {'trabajo': caso['trabajos'][0]['id'], 'cambios': {'color': 'A3'}, 'motivo': 'Pidió A3'},
        format='json',
    )
    r = equipo['produccion'].post(
        f'/api/casos/{caso["id"]}/cambios/confirmar',
        {'rehacer': True, 'trabajo': caso['trabajos'][0]['id'], 'volver_a': 3},
        format='json',
    )
    assert r.status_code == 200, r.content
    etapas = r.json()['trabajos'][0]['etapas']
    assert etapas[2]['estado'] == 'en_curso'  # Diseño exocad
    assert etapas[3]['estado'] == 'pendiente'  # Fresado
    assert etapas[3]['iniciada'] is None
    assert etapas[3]['iniciada_por'] is None


# --- Reportar un problema ------------------------------------------------------------------


def test_produccion_reporta_un_problema_y_queda_en_la_conversacion(equipo, caso):
    r = _problema(equipo['produccion'], caso)
    assert r.status_code == 201, r.content
    # La revisión técnica ya dejó su propio mensaje de sistema: se busca el del problema.
    mensaje = Mensaje.objects.get(caso_id=caso['id'], nota='Problema en producción')
    assert mensaje.tipo == Mensaje.Tipo.EQUIPO
    assert 'astillado' in mensaje.texto
    assert mensaje.etapa == 'Fresado'
    assert Evento.objects.filter(accion='problema_reportado').count() == 1


def test_un_problema_no_frena_el_caso(equipo, caso):
    """Es un aviso para Supervisión; quien decide qué hacer es una persona."""
    _problema(equipo['produccion'], caso)
    r = equipo['produccion'].get(f'/api/casos/{caso["id"]}').json()
    assert r['en_espera'] is False
    assert r['cambio_pendiente'] is None
    assert r['trabajos'][0]['etapa_actual']['nombre'] == 'Fresado'


def test_hay_que_contar_el_problema(equipo, caso):
    assert _problema(equipo['produccion'], caso, texto='   ').status_code == 400
    assert not Mensaje.objects.filter(nota='Problema en producción').exists()
    assert not Evento.objects.filter(accion='problema_reportado').exists()


@pytest.mark.parametrize('quien', ['recepcion', 'cad', 'control'])
def test_solo_produccion_y_supervision_reportan(equipo, caso, quien):
    assert _problema(equipo[quien], caso).status_code == 403


def test_supervision_tambien_reporta(equipo, caso):
    assert _problema(equipo['supervision'], caso).status_code == 201


def test_no_se_reporta_en_un_caso_de_otro_laboratorio(equipo, caso, otro_laboratorio, crear_persona):
    crear_persona(otro_laboratorio, 'otro@lab-b.test', [Rol.PRODUCCION])
    ajeno = APIClient()
    r = ajeno.post('/api/auth/ingresar', {'email': 'otro@lab-b.test', 'password': PASSWORD}, format='json')
    assert r.status_code == 200
    assert _iniciar(ajeno, caso).status_code == 404
    assert _problema(ajeno, caso).status_code == 404
