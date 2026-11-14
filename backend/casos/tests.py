"""Reglas del caso (S6): numeración, ruta congelada, validaciones, etapas y cierre."""

from datetime import timedelta

import pytest
from django.utils import timezone

from catalogo.models import ItemCatalogo, PasoPlantilla
from catalogo.semilla import cargar_catalogo
from cuentas.models import Rol
from directorio.models import Cliente, Profesional

pytestmark = pytest.mark.django_db

CORONA = {'36': {'toothSelection': 'tooth-base', 'toothSubstrate': 'crownprep', 'restorationType': 'crown'}}


@pytest.fixture
def pedido(catalogo, cliente_y_profesional):
    """Una corona de zirconio en la 36, A2, para dentro de una semana."""
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')

    def armar(**cambios):
        trabajo = {'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'a2'}
        trabajo.update(cambios.pop('trabajo', {}))
        datos = {
            'cliente': str(clinica.id),
            'profesional': str(profesional.id),
            'paciente': 'jp',
            'fecha_prometida': str(timezone.localdate() + timedelta(days=7)),
            'trabajos': [trabajo],
        }
        datos.update(cambios)
        return datos

    return armar


@pytest.fixture
def crear(cliente, entrar, recepcion, pedido):
    entrar(recepcion)

    def crear_caso(**cambios):
        r = cliente.post('/api/casos', pedido(**cambios), format='json')
        assert r.status_code == 201, r.content
        return r.json()

    return crear_caso


# --- Alta ----------------------------------------------------------------------------------


def test_crea_el_caso_con_su_ruta_y_la_primera_etapa_en_curso(crear):
    caso = crear()
    assert caso['numero'] == 1
    assert caso['codigo'] == 'C-0001'
    assert caso['paciente'] == 'JP'
    trabajo = caso['trabajos'][0]
    assert trabajo['color'] == 'A2'
    assert trabajo['etapa_actual'] == {'orden': 1, 'nombre': 'Recepción', 'rol': 'recepcion', 'total': 8}
    assert [e['estado'] for e in trabajo['etapas']][:2] == ['en_curso', 'pendiente']


def test_los_numeros_son_correlativos_por_laboratorio(crear, otro_laboratorio, crear_persona):
    assert [crear()['numero'] for _ in range(3)] == [1, 2, 3]
    # El otro laboratorio arranca su propia cuenta.
    from casos.servicios import siguiente_numero

    assert siguiente_numero(otro_laboratorio) == 1


def test_la_ruta_queda_congelada_aunque_cambie_la_plantilla(crear, catalogo):
    caso = crear()
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    PasoPlantilla.objects.filter(plantilla=item.plantilla_etapas, orden=4).update(nombre='Fresado nuevo')
    from casos.models import EtapaTrabajo

    etapas = EtapaTrabajo.objects.filter(trabajo_id=caso['trabajos'][0]['id']).values_list('nombre', flat=True)
    assert 'Fresado' in etapas and 'Fresado nuevo' not in etapas


def test_solo_quien_puede_crea_casos(cliente, entrar, laboratorio, crear_persona, pedido):
    entrar(crear_persona(laboratorio, 'carla@lab-a.test', [Rol.CAD]))
    assert cliente.post('/api/casos', pedido(), format='json').status_code == 403


@pytest.mark.parametrize(
    ('trabajo', 'campo'),
    [
        ({'piezas': {'19': {}}}, 'piezas'),
        ({'piezas': {'36': {'restorationType': 'puente'}}}, 'piezas'),
        ({'color': 'Z9'}, 'color'),
        ({'material': 'Oro'}, 'material'),
        ({'soporte': 'implante'}, 'implante_marca'),
    ],
)
def test_reglas_fijas_del_trabajo(cliente, entrar, recepcion, pedido, trabajo, campo):
    entrar(recepcion)
    r = cliente.post('/api/casos', pedido(trabajo=trabajo), format='json')
    assert r.status_code == 400
    # DRF devuelve los errores de una lista por posición: {"trabajos": {"0": {...}}}.
    assert campo in r.json()['trabajos']['0']


def test_color_con_coma_se_normaliza(crear):
    assert crear(trabajo={'color': 'a3,5'})['trabajos'][0]['color'] == 'A3.5'


def test_fecha_prometida_pasada(cliente, entrar, recepcion, pedido):
    entrar(recepcion)
    ayer = str(timezone.localdate() - timedelta(days=1))
    assert cliente.post('/api/casos', pedido(fecha_prometida=ayer), format='json').status_code == 400


def test_no_usa_clientes_ni_trabajos_de_otro_laboratorio(cliente, entrar, recepcion, pedido, otro_laboratorio):
    cargar_catalogo(otro_laboratorio)
    ajeno = Cliente.objects.create(laboratorio=otro_laboratorio, razon_social='Ajena')
    item_ajeno = ItemCatalogo.objects.get(laboratorio=otro_laboratorio, codigo='COR-ZM')
    entrar(recepcion)
    assert cliente.post('/api/casos', pedido(cliente=str(ajeno.id)), format='json').status_code == 400
    r = cliente.post('/api/casos', pedido(trabajo={'item': str(item_ajeno.id)}), format='json')
    assert r.status_code == 400


def test_un_caso_ajeno_da_404(cliente, entrar, otro_laboratorio, crear_persona, crear):
    caso = crear()
    cliente.post('/api/auth/salir')
    entrar(crear_persona(otro_laboratorio, 'otra@lab-b.test', [Rol.SUPERVISION]))
    assert cliente.get(f'/api/casos/{caso["id"]}').status_code == 404
    assert cliente.get('/api/casos').json()['results'] == []


def test_busca_por_numero_y_sin_tildes(cliente, crear):
    crear()
    otro = crear()
    assert [c['numero'] for c in cliente.get('/api/casos?q=C-0002').json()['results']] == [otro['numero']]
    assert len(cliente.get('/api/casos?q=gomez').json()['results']) == 2


# --- Etapas --------------------------------------------------------------------------------


def _avanzar(cliente, caso):
    return cliente.post(f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/avanzar')


def test_cada_etapa_la_avanza_su_rol(cliente, entrar, laboratorio, crear_persona, crear):
    caso = crear()
    assert _avanzar(cliente, caso).status_code == 200  # Recepción
    r = _avanzar(cliente, caso)  # Revisión técnica: recepción no puede
    assert r.status_code == 403
    assert 'Revisión técnica' in r.json()['detail']
    cliente.post('/api/auth/salir')
    entrar(crear_persona(laboratorio, 'raul@lab-a.test', [Rol.REVISION]))
    datos = _avanzar(cliente, caso).json()
    etapa = datos['trabajos'][0]['etapa_actual']
    assert etapa['nombre'] == 'Diseño exocad'
    hechas = [e for e in datos['trabajos'][0]['etapas'] if e['estado'] == 'hecha']
    assert [e['hecha_por'] for e in hechas] == ['rita@lab-a.test', 'raul@lab-a.test']


def test_supervision_completa_todo_y_entrega(cliente, entrar, laboratorio, crear_persona, crear):
    caso = crear()
    cliente.post('/api/auth/salir')
    entrar(crear_persona(laboratorio, 'sole@lab-a.test', [Rol.SUPERVISION]))
    assert cliente.post(f'/api/casos/{caso["id"]}/entregar').status_code == 400  # faltan etapas
    for _ in range(8):
        assert _avanzar(cliente, caso).status_code == 200
    assert _avanzar(cliente, caso).status_code == 400  # ya no quedan etapas
    r = cliente.post(f'/api/casos/{caso["id"]}/entregar')
    assert r.json()['estado'] == 'entregado'
    # Cerrado: no se mueve más.
    assert cliente.post(f'/api/casos/{caso["id"]}/cancelar', {'motivo': 'x'}, format='json').status_code == 400


def test_cancelar_pide_motivo_y_frena_el_caso(cliente, crear):
    caso = crear()
    assert cliente.post(f'/api/casos/{caso["id"]}/cancelar', {'motivo': ' '}, format='json').status_code == 400
    r = cliente.post(f'/api/casos/{caso["id"]}/cancelar', {'motivo': 'El odontólogo lo pidió'}, format='json')
    assert r.json()['estado'] == 'cancelado'
    assert _avanzar(cliente, caso).status_code == 400


def test_profesional_inactivo_no_recibe_casos_nuevos(cliente, entrar, recepcion, pedido, cliente_y_profesional):
    _, profesional = cliente_y_profesional
    Profesional.objects.filter(pk=profesional.pk).update(activo=False)
    entrar(recepcion)
    assert cliente.post('/api/casos', pedido(), format='json').status_code == 400


# --- Datos del alta que vienen del prototipo (S9) --------------------------------------------


def test_guarda_la_orden_la_impresion_y_el_tiempo_de_carga(crear):
    caso = crear(
        orden_origen='papel',
        orden_numero='OT-2291',
        orden_fecha='2026-11-02',
        orden_firmada=True,
        llega_impresion=True,
        segundos_carga=74,
    )
    assert (caso['orden_origen'], caso['orden_numero'], caso['orden_firmada']) == ('papel', 'OT-2291', True)
    assert caso['llega_impresion'] is True
    assert caso['segundos_carga'] == 74


def test_carga_por_dia_cuenta_solo_los_abiertos(cliente, crear):
    a = crear()
    crear()
    cliente.post(f'/api/casos/{a["id"]}/cancelar', {'motivo': 'No va'}, format='json')
    dia = a['fecha_prometida']
    r = cliente.get(f'/api/casos/carga?desde={dia}&hasta={dia}')
    assert r.json() == [{'fecha': dia, 'casos': 1}]


def test_filtra_por_profesional(cliente, crear, cliente_y_profesional):
    crear()
    _, profesional = cliente_y_profesional
    assert len(cliente.get(f'/api/casos?profesional={profesional.id}').json()['results']) == 1


def test_crear_y_pasar_a_revision(crear):
    caso = crear(pasar_a_revision=True)
    assert caso['trabajos'][0]['etapa_actual']['nombre'] == 'Revisión técnica'
