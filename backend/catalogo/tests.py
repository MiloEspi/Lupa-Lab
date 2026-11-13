import pytest

from catalogo.models import Familia, ItemCatalogo, PlantillaEtapas
from catalogo.semilla import cargar_catalogo

pytestmark = pytest.mark.django_db


def test_la_semilla_carga_las_8_familias_y_es_idempotente(laboratorio):
    assert cargar_catalogo(laboratorio) is True
    assert cargar_catalogo(laboratorio) is False
    assert Familia.objects.filter(laboratorio=laboratorio).count() == 8
    corona = ItemCatalogo.objects.get(laboratorio=laboratorio, codigo='COR-ZM')
    pasos = [p.nombre for p in corona.plantilla_etapas.pasos.all()]
    assert pasos[:3] == ['Recepción', 'Revisión técnica', 'Diseño exocad']
    assert len(corona.plantilla_checklist.items) == 7


def test_todos_leen_el_catalogo(cliente, entrar, recepcion, catalogo):
    entrar(recepcion)
    datos = cliente.get('/api/catalogo').json()
    assert len(datos['familias']) == 8
    assert any(i['codigo'] == 'COR-ZM' for i in datos['items'])


def test_solo_administracion_lo_cambia(cliente, entrar, recepcion, catalogo):
    entrar(recepcion)
    familia = Familia.objects.first()
    assert cliente.patch(f'/api/catalogo/familias/{familia.id}', {'nombre': 'X'}, format='json').status_code == 403


def test_editar_una_ruta_reemplaza_sus_pasos(cliente, entrar, admin, catalogo):
    entrar(admin)
    ruta = PlantillaEtapas.objects.get(nombre__startswith='Coronas')
    pasos = [{'nombre': 'Recepción', 'rol': 'recepcion'}, {'nombre': 'Fresado', 'rol': 'produccion'}]
    r = cliente.patch(f'/api/catalogo/rutas/{ruta.id}', {'pasos': pasos}, format='json')
    assert r.status_code == 200, r.content
    assert [p['nombre'] for p in r.json()['pasos']] == ['Recepción', 'Fresado']


def test_una_ruta_no_puede_quedar_vacia(cliente, entrar, admin, catalogo):
    entrar(admin)
    ruta = PlantillaEtapas.objects.first()
    assert cliente.patch(f'/api/catalogo/rutas/{ruta.id}', {'pasos': []}, format='json').status_code == 400


def test_codigo_repetido_y_relaciones_ajenas(cliente, entrar, admin, catalogo, otro_laboratorio):
    cargar_catalogo(otro_laboratorio)
    entrar(admin)
    propia = Familia.objects.filter(laboratorio=catalogo).first()
    ruta_ajena = PlantillaEtapas.objects.filter(laboratorio=otro_laboratorio).first()
    ruta_propia = PlantillaEtapas.objects.filter(laboratorio=catalogo).first()
    base = {'familia': str(propia.id), 'nombre': 'Nuevo', 'plantilla_etapas': str(ruta_propia.id)}
    assert cliente.post('/api/catalogo/items', {**base, 'codigo': 'cor-zm'}, format='json').status_code == 400
    ajeno = {**base, 'codigo': 'NUE-1', 'plantilla_etapas': str(ruta_ajena.id)}
    assert cliente.post('/api/catalogo/items', ajeno, format='json').status_code == 400
    r = cliente.post('/api/catalogo/items', {**base, 'codigo': 'nue-1'}, format='json')
    assert r.status_code == 201
    assert r.json()['codigo'] == 'NUE-1'
