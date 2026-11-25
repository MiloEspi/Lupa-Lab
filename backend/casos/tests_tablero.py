"""
Vistas por rol y Tablero (S14): "Mis cajas de hoy" para quien trabaja y el tablero para
Supervisión. Escritos antes que el código. Las fechas se mueven por ORM porque la API no
deja prometer un caso para el pasado.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import Evento
from casos.models import Caso, EtapaTrabajo
from catalogo.models import ItemCatalogo
from conftest import PASSWORD, aprobar_revision
from cuentas.models import Rol

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
        'revision': con_sesion('rena@lab-a.test', [Rol.REVISION]),
        'cad': con_sesion('carla@lab-a.test', [Rol.CAD]),
        'produccion': con_sesion('pablo@lab-a.test', [Rol.PRODUCCION]),
        'control': con_sesion('cora@lab-a.test', [Rol.CONTROL]),
        'supervision': con_sesion('sole@lab-a.test', [Rol.SUPERVISION]),
        'administracion': con_sesion('ada@lab-a.test', [Rol.ADMINISTRACION]),
    }


@pytest.fixture
def crear(equipo, catalogo, cliente_y_profesional):
    """Crea un corona con la fecha prometida en `dias` (puede ser negativa) y la lleva a `etapa`."""
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')

    def hacer(etapa='Recepción', dias=7, paciente='JP'):
        datos = {
            'cliente': str(clinica.id),
            'profesional': str(profesional.id),
            'paciente': paciente,
            'trabajos': [{'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'A2'}],
        }
        creado = equipo['recepcion'].post('/api/casos', datos, format='json').json()
        Caso.objects.filter(pk=creado['id']).update(fecha_prometida=timezone.localdate() + timedelta(days=dias))
        sup = equipo['supervision']
        ruta = f'/api/casos/{creado["id"]}'
        trabajo = creado['trabajos'][0]['id']
        while sup.get(ruta).json()['trabajos'][0]['etapa_actual']['nombre'] != etapa:
            actual = sup.get(ruta).json()['trabajos'][0]['etapa_actual']['nombre']
            if actual == 'Revisión técnica':
                assert aprobar_revision(sup, creado['id']).status_code == 201
            else:
                assert sup.post(f'{ruta}/trabajos/{trabajo}/avanzar').status_code == 200
        return sup.get(ruta).json()

    return hacer


def _cajas(cliente):
    r = cliente.get('/api/vistas/mis-cajas')
    assert r.status_code == 200, r.content
    return r.json()['cajas']


def _tablero(cliente, **parametros):
    r = cliente.get('/api/vistas/tablero', parametros)
    assert r.status_code == 200, r.content
    return r.json()


# --- Mis cajas de hoy -----------------------------------------------------------------------


def test_cada_uno_ve_las_cajas_de_la_etapa_que_le_toca(equipo, crear):
    en_fresado = crear('Fresado')
    en_diseno = crear('Diseño exocad')
    assert [c['caso'] for c in _cajas(equipo['produccion'])] == [en_fresado['id']]
    assert [c['caso'] for c in _cajas(equipo['cad'])] == [en_diseno['id']]
    assert _cajas(equipo['control']) == []


def test_la_caja_trae_lo_que_el_celular_muestra(equipo, crear):
    caso = crear('Fresado', dias=3)
    [caja] = _cajas(equipo['produccion'])
    assert caja['codigo'] == caso['codigo']
    assert caja['trabajo'] == caso['trabajos'][0]['id']
    assert caja['etapa'] == 'Fresado'
    assert caja['item'] == caso['trabajos'][0]['item_nombre']
    assert caja['material'] == 'Zirconio'
    assert caja['pieza'] == '36'
    assert caja['fecha_prometida'] == caso['fecha_prometida']
    assert caja['iniciada'] is False
    assert caja['bloqueo'] is None
    assert caja['atrasado'] is False


def test_una_caja_iniciada_se_marca(equipo, crear):
    caso = crear('Fresado')
    r = equipo['produccion'].post(f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/iniciar')
    assert r.status_code == 200
    assert _cajas(equipo['produccion'])[0]['iniciada'] is True


def test_las_cajas_vienen_con_lo_urgente_primero(equipo, crear):
    tranquilo = crear('Fresado', dias=9)
    pronto = crear('Fresado', dias=1)
    atrasado = crear('Fresado', dias=-2)
    con_cambio = crear('Fresado', dias=5)
    r = equipo['recepcion'].post(
        f'/api/casos/{con_cambio["id"]}/cambios',
        {'trabajo': con_cambio['trabajos'][0]['id'], 'motivo': 'Pidió otro color', 'cambios': {'color': 'A3'}},
        format='json',
    )
    assert r.status_code == 201
    orden = [c['caso'] for c in _cajas(equipo['produccion'])]
    assert orden == [con_cambio['id'], atrasado['id'], pronto['id'], tranquilo['id']]


def test_un_caso_sin_fecha_va_al_final(equipo, crear):
    sin_fecha = crear('Fresado')
    Caso.objects.filter(pk=sin_fecha['id']).update(fecha_prometida=None)
    con_fecha = crear('Fresado', dias=20)
    assert [c['caso'] for c in _cajas(equipo['produccion'])] == [con_fecha['id'], sin_fecha['id']]


def test_las_marcas_que_frenan_se_ven_en_la_caja(equipo, crear):
    en_pausa = crear('Fresado')
    assert (
        equipo['recepcion']
        .post(f'/api/casos/{en_pausa["id"]}/pausar', {'motivo': 'Falta el color'}, format='json')
        .status_code
        == 200
    )
    en_espera = crear('Fresado')
    Caso.objects.filter(pk=en_espera['id']).update(en_espera=True, espera_desde=timezone.now())
    cajas = {c['caso']: c for c in _cajas(equipo['produccion'])}
    assert cajas[en_pausa['id']]['bloqueo'] == 'pausa'
    assert cajas[en_espera['id']]['bloqueo'] == 'espera'


def test_casos_cerrados_no_aparecen(equipo, crear):
    caso = crear('Fresado')
    Caso.objects.filter(pk=caso['id']).update(estado=Caso.Estado.CANCELADO)
    assert _cajas(equipo['produccion']) == []


def test_un_trabajo_ya_terminado_no_es_de_nadie(equipo, crear):
    caso = crear('Fresado')
    EtapaTrabajo.objects.filter(trabajo_id=caso['trabajos'][0]['id']).update(estado=EtapaTrabajo.Estado.HECHA)
    assert _cajas(equipo['produccion']) == []


def test_supervision_no_tiene_cajas_propias_ve_todo_en_el_tablero(equipo, crear):
    crear('Fresado')
    assert _cajas(equipo['supervision']) == []


def test_quien_tiene_dos_roles_ve_las_cajas_de_los_dos(laboratorio, crear_persona, equipo, crear):
    crear_persona(laboratorio, 'dos@lab-a.test', [Rol.CAD, Rol.PRODUCCION])
    cliente = APIClient()
    assert (
        cliente.post('/api/auth/ingresar', {'email': 'dos@lab-a.test', 'password': PASSWORD}, format='json').status_code
        == 200
    )
    crear('Fresado')
    crear('Diseño exocad')
    assert {c['etapa'] for c in _cajas(cliente)} == {'Fresado', 'Diseño exocad'}


def test_un_laboratorio_no_ve_las_cajas_del_otro(equipo, crear, otro_laboratorio, crear_persona):
    crear('Fresado')
    crear_persona(otro_laboratorio, 'otro@lab-b.test', [Rol.PRODUCCION])
    ajeno = APIClient()
    assert (
        ajeno.post('/api/auth/ingresar', {'email': 'otro@lab-b.test', 'password': PASSWORD}, format='json').status_code
        == 200
    )
    assert _cajas(ajeno) == []


def test_mis_cajas_pide_sesion(cliente):
    assert cliente.get('/api/vistas/mis-cajas').status_code in (401, 403)


# --- Tablero: permisos ------------------------------------------------------------------------


@pytest.mark.parametrize('rol', ['recepcion', 'revision', 'cad', 'produccion', 'control', 'administracion'])
def test_el_tablero_es_solo_de_supervision(equipo, rol):
    assert equipo[rol].get('/api/vistas/tablero').status_code == 403


def test_supervision_ve_el_tablero(equipo):
    assert equipo['supervision'].get('/api/vistas/tablero').status_code == 200


def test_el_tablero_pide_sesion(cliente):
    assert cliente.get('/api/vistas/tablero').status_code in (401, 403)


# --- Tablero: indicadores ---------------------------------------------------------------------


def test_en_curso_cuenta_solo_los_abiertos(equipo, crear):
    crear('Fresado')
    crear('Diseño exocad')
    cancelado = crear('Fresado')
    Caso.objects.filter(pk=cancelado['id']).update(estado=Caso.Estado.CANCELADO)
    assert _tablero(equipo['supervision'])['en_curso'] == 2


def test_atrasados_son_los_abiertos_con_fecha_vencida_y_dicen_donde_estan(equipo, crear):
    en_produccion = crear('Fresado', dias=-1)
    esperando = crear('Revisión técnica', dias=-3)
    Caso.objects.filter(pk=esperando['id']).update(en_espera=True, espera_desde=timezone.now())
    crear('Fresado', dias=0)  # vence hoy: todavía no está atrasado
    entregado = crear('Fresado', dias=-5)
    Caso.objects.filter(pk=entregado['id']).update(estado=Caso.Estado.ENTREGADO)
    atrasados = _tablero(equipo['supervision'])['atrasados']
    assert atrasados['total'] == 2
    assert atrasados['en_espera'] == 1
    assert atrasados['en_produccion'] == 1
    assert {c['caso'] for c in atrasados['casos']} == {en_produccion['id'], esperando['id']}
    assert max(c['dias'] for c in atrasados['casos']) == 3


def test_cambios_sin_leer_trae_el_caso_y_hace_cuanto(equipo, crear):
    caso = crear('Fresado')
    crear('Fresado')
    assert (
        equipo['recepcion']
        .post(
            f'/api/casos/{caso["id"]}/cambios',
            {'trabajo': caso['trabajos'][0]['id'], 'motivo': 'Pidió otro color', 'cambios': {'color': 'A3'}},
            format='json',
        )
        .status_code
        == 201
    )
    sin_leer = _tablero(equipo['supervision'])['cambios_sin_leer']
    assert sin_leer['total'] == 1
    [fila] = sin_leer['casos']
    assert fila['caso'] == caso['id']
    assert fila['codigo'] == caso['codigo']
    assert fila['etapa'] == 'Fresado'
    assert fila['falta'] == ['produccion']
    assert fila['horas'] == 0


def test_entregas_de_hoy_cuenta_las_prometidas_para_hoy(equipo, crear):
    crear('Fresado', dias=0)
    hecho = crear('Fresado', dias=0)
    Caso.objects.filter(pk=hecho['id']).update(estado=Caso.Estado.ENTREGADO)
    crear('Fresado', dias=2)
    entregas = _tablero(equipo['supervision'])['entregas']
    assert entregas == {'prometidos': 2, 'entregados': 1}


def test_carga_por_dia_cuenta_trabajos_contra_la_capacidad(laboratorio, equipo, crear):
    hoy = timezone.localdate()
    crear('Fresado', dias=1)
    crear('Fresado', dias=1)
    crear('Fresado', dias=-1)
    tablero = _tablero(equipo['supervision'])
    assert tablero['capacidad'] == laboratorio.capacidad_diaria
    dias = {d['fecha']: d for d in tablero['dias']}
    assert dias[str(hoy + timedelta(days=1))]['trabajos'] == 2
    assert dias[str(hoy - timedelta(days=1))]['trabajos'] == 1
    assert dias[str(hoy)]['trabajos'] == 0


def test_carga_por_dia_marca_hoy_el_futuro_y_lo_ya_entregado(equipo, crear):
    hoy = timezone.localdate()
    pasado = crear('Fresado', dias=-2)
    Caso.objects.filter(pk=pasado['id']).update(estado=Caso.Estado.ENTREGADO)
    crear('Fresado', dias=3)
    dias = {d['fecha']: d for d in _tablero(equipo['supervision'])['dias']}
    assert [d['fecha'] for d in dias.values()] == sorted(dias)
    assert dias[str(hoy + timedelta(days=3))]['futuro'] is True
    antes = dias[str(hoy - timedelta(days=2))]
    assert (antes['futuro'], antes['trabajos'], antes['entregados']) == (False, 1, 1)
    assert dias[str(hoy)]['hoy'] is True
    assert dias[str(hoy)]['futuro'] is False
    assert dias[str(hoy + timedelta(days=1))]['hoy'] is False
    assert dias[str(hoy)]['habil'] is (hoy.weekday() < 5)


def test_la_carga_cuenta_trabajos_no_casos(equipo, catalogo, cliente_y_profesional):
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    trabajo = {'item': str(item.id), 'piezas': CORONA, 'material': 'Zirconio', 'color': 'A2'}
    r = equipo['recepcion'].post(
        '/api/casos',
        {'cliente': str(clinica.id), 'profesional': str(profesional.id), 'trabajos': [trabajo, trabajo, trabajo]},
        format='json',
    )
    Caso.objects.filter(pk=r.json()['id']).update(fecha_prometida=timezone.localdate() + timedelta(days=1))
    dias = {d['fecha']: d for d in _tablero(equipo['supervision'])['dias']}
    assert dias[str(timezone.localdate() + timedelta(days=1))]['trabajos'] == 3


def test_los_casos_cancelados_no_pesan_en_la_carga(equipo, crear):
    caso = crear('Fresado', dias=2)
    Caso.objects.filter(pk=caso['id']).update(estado=Caso.Estado.CANCELADO)
    dias = {d['fecha']: d for d in _tablero(equipo['supervision'])['dias']}
    assert dias[str(timezone.localdate() + timedelta(days=2))]['trabajos'] == 0


def test_por_etapa_cuenta_casos_y_demora_promedio(equipo, crear):
    crear('Fresado')
    crear('Fresado')
    crear('Diseño exocad')
    EtapaTrabajo.objects.filter(nombre='Fresado', estado=EtapaTrabajo.Estado.EN_CURSO).update(
        inicio=timezone.now() - timedelta(hours=4)
    )
    etapas = {e['nombre']: e for e in _tablero(equipo['supervision'])['etapas']}
    assert etapas['Fresado']['casos'] == 2
    assert 3.9 <= etapas['Fresado']['horas'] <= 4.1
    assert etapas['Diseño exocad']['casos'] == 1


def test_por_etapa_suma_esperando_odontologo_aparte(equipo, crear):
    esperando = crear('Revisión técnica')
    Caso.objects.filter(pk=esperando['id']).update(en_espera=True, espera_desde=timezone.now() - timedelta(hours=30))
    etapas = {e['nombre']: e for e in _tablero(equipo['supervision'])['etapas']}
    assert etapas['Esperando odontólogo']['casos'] == 1
    assert 29.9 <= etapas['Esperando odontólogo']['horas'] <= 30.1
    # No se cuenta dos veces: el caso espera, no está "en revisión".
    assert 'Revisión técnica' not in etapas


def test_carga_por_rol_separa_lo_iniciado_de_lo_que_espera(equipo, crear):
    primera = crear('Fresado')
    crear('Fresado')
    assert (
        equipo['produccion']
        .post(f'/api/casos/{primera["id"]}/trabajos/{primera["trabajos"][0]["id"]}/iniciar')
        .status_code
        == 200
    )
    roles = {r['rol']: r for r in _tablero(equipo['supervision'])['roles']}
    assert roles['produccion']['en_fila'] == 1
    assert roles['produccion']['en_mano'] == 1
    assert roles['produccion']['personas'] == 1
    assert roles['produccion']['nombre'] == 'Producción'


def test_para_atender_ordena_atrasados_cambios_espera_y_problemas(equipo, crear):
    atrasado = crear('Fresado', dias=-1)
    con_cambio = crear('Fresado', dias=5)
    equipo['recepcion'].post(
        f'/api/casos/{con_cambio["id"]}/cambios',
        {'trabajo': con_cambio['trabajos'][0]['id'], 'motivo': 'Otro color', 'cambios': {'color': 'A3'}},
        format='json',
    )
    problema = crear('Fresado', dias=6)
    assert (
        equipo['produccion']
        .post(
            f'/api/casos/{problema["id"]}/trabajos/{problema["trabajos"][0]["id"]}/problema',
            {'texto': 'Se astilló un borde'},
            format='json',
        )
        .status_code
        == 201
    )
    crear('Fresado', dias=8)  # sin nada raro: no aparece
    filas = _tablero(equipo['supervision'])['para_atender']
    assert [(f['tipo'], f['caso']) for f in filas] == [
        ('atrasado', atrasado['id']),
        ('sin_leer', con_cambio['id']),
        ('problema', problema['id']),
    ]
    assert filas[2]['detalle'] == 'Se astilló un borde'


def test_un_problema_viejo_ya_no_pide_atencion(equipo, crear):
    caso = crear('Fresado')
    equipo['produccion'].post(
        f'/api/casos/{caso["id"]}/trabajos/{caso["trabajos"][0]["id"]}/problema', {'texto': 'Fisura'}, format='json'
    )
    Evento.objects.filter(accion='problema_reportado').update(cuando=timezone.now() - timedelta(days=5))
    assert _tablero(equipo['supervision'])['para_atender'] == []


def test_piloto_mide_carga_y_entregas_a_tiempo(equipo, crear):
    a_tiempo = crear('Fresado', dias=2)
    tarde = crear('Fresado', dias=-1)
    Caso.objects.filter(pk=a_tiempo['id']).update(estado=Caso.Estado.ENTREGADO, segundos_carga=60)
    Caso.objects.filter(pk=tarde['id']).update(estado=Caso.Estado.ENTREGADO, segundos_carga=120)
    for caso in (a_tiempo, tarde):
        Evento.objects.create(
            laboratorio_id=Caso.objects.get(pk=caso['id']).laboratorio_id,
            accion='caso_entregado',
            objeto_tipo='caso',
            objeto_id=caso['id'],
        )
    piloto = _tablero(equipo['supervision'], periodo='mes')['piloto']
    assert piloto['casos'] == 2
    assert piloto['segundos_carga'] == 90
    assert piloto['entregas_a_tiempo'] == {'a_tiempo': 1, 'entregados': 2}


def test_piloto_sin_datos_dice_nulo_no_cero(equipo):
    piloto = _tablero(equipo['supervision'])['piloto']
    assert piloto['casos'] == 0
    assert piloto['segundos_carga'] is None
    assert piloto['entregas_a_tiempo'] == {'a_tiempo': 0, 'entregados': 0}


def test_el_periodo_es_hoy_semana_o_mes(equipo):
    for periodo in ('hoy', 'semana', 'mes'):
        assert _tablero(equipo['supervision'], periodo=periodo)['periodo'] == periodo
    assert equipo['supervision'].get('/api/vistas/tablero', {'periodo': 'siglo'}).status_code == 400


def test_el_tablero_no_mezcla_laboratorios(equipo, crear, otro_laboratorio, crear_persona):
    crear('Fresado', dias=-1)
    crear_persona(otro_laboratorio, 'sup@lab-b.test', [Rol.SUPERVISION])
    ajeno = APIClient()
    assert (
        ajeno.post('/api/auth/ingresar', {'email': 'sup@lab-b.test', 'password': PASSWORD}, format='json').status_code
        == 200
    )
    tablero = _tablero(ajeno)
    assert tablero['en_curso'] == 0
    assert tablero['atrasados']['total'] == 0
    assert tablero['etapas'] == []
