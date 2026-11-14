import hashlib
import io
import zipfile
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import Evento
from catalogo.models import ItemCatalogo
from conftest import PASSWORD
from cuentas.models import Rol

pytestmark = pytest.mark.django_db

MALLA = b'ply\nformat ascii 1.0\nelement vertex 0\nend_header\n'


@pytest.fixture(autouse=True)
def carpeta_temporal(settings, tmp_path):
    settings.ARCHIVOS_BACKEND = 'local'
    settings.ARCHIVOS_DIR = str(tmp_path)


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


def subir(cliente, caso, contenido=MALLA, nombre='arcada-inferior.ply', tipo='escaneo', declarado=None):
    """Los dos pasos del navegador: pedir la URL, subir y confirmar."""
    pedido = {
        'tipo': tipo,
        'nombre': nombre,
        'tamano': len(contenido),
        'sha256': declarado or hashlib.sha256(contenido).hexdigest(),
    }
    r = cliente.post(f'/api/casos/{caso["id"]}/archivos', pedido, format='json')
    assert r.status_code == 201, r.content
    datos = r.json()
    put = cliente.put(datos['subida']['url'], contenido, content_type='application/octet-stream')
    confirmado = cliente.post(f'/api/casos/{caso["id"]}/archivos/{datos["archivo"]["id"]}/confirmar')
    return datos['archivo'], put, confirmado


def test_sube_y_confirma_un_escaneo(cliente, caso):
    archivo, put, confirmado = subir(cliente, caso)
    assert put.status_code == 200
    assert confirmado.json()['estado'] == 'listo'
    assert confirmado.json()['etapa'] == 'Recepción'
    assert [a['nombre'] for a in cliente.get(f'/api/casos/{caso["id"]}/archivos').json()] == ['arcada-inferior.ply']
    assert Evento.objects.filter(accion='archivo_subido').exists()


def test_rechaza_un_archivo_distinto_al_declarado(cliente, caso):
    _, put, confirmado = subir(cliente, caso, declarado='0' * 64)
    assert put.status_code == 400
    assert confirmado.status_code == 400
    assert cliente.get(f'/api/casos/{caso["id"]}/archivos').json() == []


def test_formato_que_no_corresponde(cliente, caso):
    r = cliente.post(
        f'/api/casos/{caso["id"]}/archivos',
        {'tipo': 'escaneo', 'nombre': 'foto.jpg', 'tamano': 10, 'sha256': 'a' * 64},
        format='json',
    )
    assert r.status_code == 400
    assert 'stl' in r.json()['nombre'][0]


def test_la_subida_pide_sesion_ademas_de_la_firma(cliente, caso):
    pedido = {'tipo': 'escaneo', 'nombre': 'a.ply', 'tamano': len(MALLA), 'sha256': hashlib.sha256(MALLA).hexdigest()}
    url = cliente.post(f'/api/casos/{caso["id"]}/archivos', pedido, format='json').json()['subida']['url']
    anonimo = APIClient()
    assert anonimo.put(url, MALLA, content_type='application/octet-stream').status_code == 401


def test_descarga_con_link_que_vence_y_solo_del_laboratorio(cliente, caso, otro_laboratorio, crear_persona):
    archivo, *_ = subir(cliente, caso)
    url = cliente.get(f'/api/casos/{caso["id"]}/archivos/{archivo["id"]}/descarga').json()['url']
    respuesta = cliente.get(url)
    assert b''.join(respuesta.streaming_content) == MALLA
    ajeno = APIClient()
    crear_persona(otro_laboratorio, 'otra@lab-b.test', [Rol.SUPERVISION])
    ajeno.post('/api/auth/ingresar', {'email': 'otra@lab-b.test', 'password': PASSWORD}, format='json')
    assert ajeno.get(url).status_code == 404
    assert ajeno.get(f'/api/casos/{caso["id"]}/archivos').status_code == 404


# --- Versiones y notas ----------------------------------------------------------------------


def _version(cliente, caso, archivos, origen='inicial'):
    return cliente.post(
        f'/api/casos/{caso["id"]}/versiones',
        {'origen': origen, 'archivos': [a['id'] for a in archivos]},
        format='json',
    )


def test_el_escaneo_inicial_no_se_reemplaza(cliente, caso):
    a, *_ = subir(cliente, caso)
    b, *_ = subir(cliente, caso, nombre='otra.ply')
    r = _version(cliente, caso, [a])
    assert r.status_code == 201
    assert r.json()['numero'] == 1
    assert _version(cliente, caso, [b]).status_code == 400
    # Un archivo que ya es de una versión no se mueve a otra.
    assert _version(cliente, caso, [a], origen='cad').status_code in (400, 403)


def test_cad_suma_su_version_y_recepcion_no(cliente, entrar, caso, laboratorio, crear_persona):
    inicial, *_ = subir(cliente, caso)
    _version(cliente, caso, [inicial])
    diseno, *_ = subir(cliente, caso, nombre='corona-36.stl', tipo='diseno')
    assert _version(cliente, caso, [diseno], origen='cad').status_code == 403
    cliente.post('/api/auth/salir')
    entrar(crear_persona(laboratorio, 'carla@lab-a.test', [Rol.CAD]))
    r = _version(cliente, caso, [diseno], origen='cad')
    assert r.status_code == 201
    assert r.json()['numero'] == 2


def test_cad_no_carga_diseno_sin_escaneo_inicial(cliente, entrar, caso, laboratorio, crear_persona):
    diseno, *_ = subir(cliente, caso, nombre='corona-36.stl', tipo='diseno')
    cliente.post('/api/auth/salir')
    entrar(crear_persona(laboratorio, 'carla@lab-a.test', [Rol.CAD]))
    assert _version(cliente, caso, [diseno], origen='cad').status_code == 400


def test_notas_numeradas_y_solo_las_edita_quien_las_escribio(cliente, entrar, caso, laboratorio, crear_persona):
    a, *_ = subir(cliente, caso)
    version = _version(cliente, caso, [a]).json()
    url = f'/api/casos/{caso["id"]}/versiones/{version["id"]}/notas'
    primera = cliente.post(url, {'x': '1.5', 'y': '-2', 'z': '10.25', 'texto': 'Margen poco claro'}, format='json')
    segunda = cliente.post(url, {'x': 0, 'y': 0, 'z': 0, 'texto': 'Falta antagonista'}, format='json').json()
    assert primera.json()['numero'] == 1
    assert segunda['numero'] == 2
    assert primera.json()['es_mia'] is True
    cliente.post('/api/auth/salir')
    entrar(crear_persona(laboratorio, 'raul@lab-a.test', [Rol.REVISION]))
    nota = primera.json()['id']
    assert cliente.patch(f'{url}/{nota}', {'texto': 'otra cosa'}, format='json').status_code == 403


def test_zip_con_las_mallas_y_las_notas_en_csv(cliente, caso):
    a, *_ = subir(cliente, caso)
    version = _version(cliente, caso, [a]).json()
    cliente.post(
        f'/api/casos/{caso["id"]}/versiones/{version["id"]}/notas',
        {'x': '1.5', 'y': '-2', 'z': '10.25', 'texto': 'Margen poco claro, revisar'},
        format='json',
    )
    r = cliente.get(f'/api/casos/{caso["id"]}/versiones/{version["id"]}/zip')
    assert r['Content-Disposition'].endswith('C-0001-v1.zip"')
    with zipfile.ZipFile(io.BytesIO(b''.join(r.streaming_content))) as z:
        assert set(z.namelist()) == {'arcada-inferior.ply', 'notas.csv'}
        assert z.read('arcada-inferior.ply') == MALLA
        csv = z.read('notas.csv').decode('utf-8-sig').splitlines()
    assert csv[0].startswith('numero,x_mm,y_mm,z_mm,texto')
    assert csv[1].startswith('1,1.500,-2.000,10.250,"Margen poco claro, revisar"')
