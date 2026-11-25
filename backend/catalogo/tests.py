import pytest

from catalogo.models import Familia, ItemCatalogo, PlantillaEtapas
from catalogo.semilla import cargar_catalogo

pytestmark = pytest.mark.django_db


def test_la_semilla_carga_las_secciones_del_tarifario_y_es_idempotente(laboratorio):
    assert cargar_catalogo(laboratorio) is True
    assert cargar_catalogo(laboratorio) is False
    assert Familia.objects.filter(laboratorio=laboratorio).count() == 16
    codigos = list(ItemCatalogo.objects.filter(laboratorio=laboratorio).values_list('codigo', flat=True))
    assert len(codigos) == len(set(codigos))
    corona = ItemCatalogo.objects.get(laboratorio=laboratorio, codigo='COR-ZM')
    pasos = [p.nombre for p in corona.plantilla_etapas.pasos.all()]
    assert pasos[:3] == ['Recepción', 'Revisión técnica', 'Diseño exocad']
    assert len(corona.plantilla_checklist.items) == 7


def test_cada_ruta_de_la_semilla_la_usa_algun_trabajo(laboratorio):
    cargar_catalogo(laboratorio)
    sin_uso = PlantillaEtapas.objects.filter(laboratorio=laboratorio, items_catalogo__isnull=True)
    assert not sin_uso.exists(), list(sin_uso.values_list('nombre', flat=True))


def test_el_laboratorio_cambia_la_ruta_de_un_trabajo_sin_tocar_a_los_demas(cliente, entrar, admin, catalogo):
    entrar(admin)
    item = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-DS')
    otro = ItemCatalogo.objects.get(laboratorio=catalogo, codigo='COR-ZM')
    assert item.plantilla_etapas_id == otro.plantilla_etapas_id
    # Copia de la ruta solo para este trabajo (lo que hace el botón de la pantalla).
    original = item.plantilla_etapas
    pasos = [{'nombre': p.nombre, 'rol': p.rol, 'en_consultorio': p.en_consultorio} for p in original.pasos.all()]
    nueva = cliente.post('/api/catalogo/rutas', {'nombre': 'Disilicato propio', 'pasos': pasos}, format='json')
    assert nueva.status_code == 201, nueva.content
    r = cliente.patch(f'/api/catalogo/items/{item.id}', {'plantilla_etapas': nueva.json()['id']}, format='json')
    assert r.status_code == 200, r.content
    cambio = pasos[:2] + [{'nombre': 'Prensado', 'rol': 'produccion'}]
    assert cliente.patch(f'/api/catalogo/rutas/{nueva.json()["id"]}', {'pasos': cambio}, format='json').status_code == 200
    otro.refresh_from_db()
    assert [p.nombre for p in otro.plantilla_etapas.pasos.all()] == [p['nombre'] for p in pasos]


def test_todos_leen_el_catalogo(cliente, entrar, recepcion, catalogo):
    entrar(recepcion)
    datos = cliente.get('/api/catalogo').json()
    assert len(datos['familias']) == 16
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
