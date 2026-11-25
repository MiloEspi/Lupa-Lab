from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from catalogo.models import ItemCatalogo
from conftest import PASSWORD
from cuentas.models import Rol

pytestmark = pytest.mark.django_db


@pytest.fixture
def caso(cliente, entrar, recepcion, catalogo, cliente_y_profesional):
    clinica, profesional = cliente_y_profesional
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    entrar(recepcion)
    datos = {
        'cliente': str(clinica.id),
        'profesional': str(profesional.id),
        'fecha_prometida': str(timezone.localdate() + timedelta(days=7)),
        'trabajos': [{'item': str(item.id), 'color': 'A2'}],
    }
    return cliente.post('/api/casos', datos, format='json').json()


def _url(caso):
    return f'/api/casos/{caso["id"]}/mensajes'


def test_publica_y_responde_en_la_etapa_actual(cliente, caso):
    r = cliente.post(_url(caso), {'texto': 'Llegó la caja', 'tipo': 'equipo'}, format='json')
    assert r.status_code == 201, r.content
    padre = r.json()
    assert (padre['etapa'], padre['etapa_orden']) == ('Recepción', 0)
    respuesta = cliente.post(_url(caso), {'texto': 'Gracias', 'respuesta_a': padre['id']}, format='json').json()
    assert respuesta['etapa'] == 'Recepción'
    hilo = cliente.get(_url(caso)).json()
    assert len(hilo) == 1
    assert [x['texto'] for x in hilo[0]['respuestas']] == ['Gracias']


def test_comentar_en_una_etapa_que_ya_paso(cliente, caso):
    r = cliente.post(_url(caso), {'texto': 'Nota tardía', 'etapa_orden': 0}, format='json').json()
    assert r['etapa'] == 'Recepción'
    assert cliente.post(_url(caso), {'texto': 'x', 'etapa_orden': 40}, format='json').status_code == 400


def test_mensaje_vacio_no_se_publica(cliente, caso):
    assert cliente.post(_url(caso), {'texto': '  '}, format='json').status_code == 400


def test_un_cambio_deja_un_mensaje_del_sistema(cliente, caso):
    datos = {'trabajo': caso['trabajos'][0]['id'], 'cambios': {'color': 'A3'}, 'motivo': 'Lo pidió por WhatsApp'}
    cliente.post(f'/api/casos/{caso["id"]}/cambios', datos, format='json')
    hilo = cliente.get(_url(caso)).json()
    assert hilo[0]['tipo'] == 'sistema'
    assert hilo[0]['version_ficha'] == 2
    assert 'color A2 a A3' in hilo[0]['texto']


def test_otro_laboratorio_no_ve_la_conversacion(cliente, caso, otro_laboratorio, crear_persona):
    cliente.post(_url(caso), {'texto': 'Interno'}, format='json')
    crear_persona(otro_laboratorio, 'otra@lab-b.test', [Rol.SUPERVISION])
    ajeno = APIClient()
    ajeno.post('/api/auth/ingresar', {'email': 'otra@lab-b.test', 'password': PASSWORD}, format='json')
    assert ajeno.get(_url(caso)).status_code == 404


def test_etiqueta_a_gente_del_equipo(cliente, caso, laboratorio, crear_persona):
    sup = crear_persona(laboratorio, 'sofi@lab-a.test', [Rol.SUPERVISION])
    r = cliente.post(_url(caso), {'texto': '@sofi mirá esto', 'menciones': [str(sup.id)]}, format='json')
    assert r.status_code == 201, r.content
    assert [m['id'] for m in r.json()['menciones']] == [str(sup.id)]
    hilo = cliente.get(_url(caso)).json()
    assert [m['nombre'] for m in hilo[0]['menciones']] == ['sofi@lab-a.test']


def test_no_se_etiqueta_a_otro_laboratorio_ni_a_una_baja(cliente, caso, laboratorio, otro_laboratorio, crear_persona):
    ajena = crear_persona(otro_laboratorio, 'ana@lab-b.test', [Rol.RECEPCION])
    baja = crear_persona(laboratorio, 'beto@lab-a.test', [Rol.CAD], activa=False)
    for quien in (ajena, baja):
        r = cliente.post(_url(caso), {'texto': 'hola', 'menciones': [str(quien.id)]}, format='json')
        assert r.status_code == 400, r.content


def test_mencionables_lista_solo_al_equipo_activo_de_este_laboratorio(cliente, caso, laboratorio, otro_laboratorio, crear_persona):
    crear_persona(laboratorio, 'cami@lab-a.test', [Rol.CAD])
    crear_persona(laboratorio, 'beto@lab-a.test', [Rol.CAD], activa=False)
    crear_persona(otro_laboratorio, 'ana@lab-b.test', [Rol.RECEPCION])
    r = cliente.get(f'/api/casos/{caso["id"]}/mencionables')
    assert r.status_code == 200, r.content
    nombres = {m['nombre'] for m in r.json()}
    assert nombres == {'rita@lab-a.test', 'cami@lab-a.test'}
    assert all(m['rol'] for m in r.json())
