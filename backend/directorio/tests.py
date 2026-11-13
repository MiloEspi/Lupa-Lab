import pytest

from auditoria.models import Evento
from cuentas.models import Rol
from directorio.models import Cliente

pytestmark = pytest.mark.django_db

CUIT_VALIDO = '20-12345678-6'


def test_recepcion_crea_un_cliente_con_cuit_normalizado(cliente, entrar, recepcion):
    entrar(recepcion)
    r = cliente.post('/api/clientes', {'razon_social': 'Clínica Norte', 'cuit': CUIT_VALIDO}, format='json')
    assert r.status_code == 201, r.content
    assert r.json()['cuit'] == '20123456786'
    assert Evento.objects.filter(accion='cliente_creado').exists()


def test_cuit_con_digito_verificador_mal(cliente, entrar, recepcion):
    entrar(recepcion)
    r = cliente.post('/api/clientes', {'razon_social': 'X', 'cuit': '20-12345678-0'}, format='json')
    assert r.status_code == 400
    assert 'CUIT' in r.json()['cuit'][0]


def test_cuit_repetido_dice_de_quien_es(cliente, entrar, recepcion, laboratorio):
    Cliente.objects.create(laboratorio=laboratorio, razon_social='Clínica Norte', cuit='20123456786')
    entrar(recepcion)
    r = cliente.post('/api/clientes', {'razon_social': 'Otra', 'cuit': CUIT_VALIDO}, format='json')
    assert 'Clínica Norte' in r.json()['cuit'][0]


def test_el_mismo_cuit_puede_estar_en_otro_laboratorio(cliente, entrar, recepcion, otro_laboratorio):
    Cliente.objects.create(laboratorio=otro_laboratorio, razon_social='Ajena', cuit='20123456786')
    entrar(recepcion)
    r = cliente.post('/api/clientes', {'razon_social': 'Propia', 'cuit': CUIT_VALIDO}, format='json')
    assert r.status_code == 201


def test_cad_lee_pero_no_escribe(cliente, entrar, laboratorio, crear_persona, cliente_y_profesional):
    entrar(crear_persona(laboratorio, 'carla@lab-a.test', [Rol.CAD]))
    assert len(cliente.get('/api/clientes').json()) == 1
    assert cliente.post('/api/clientes', {'razon_social': 'X'}, format='json').status_code == 403


def test_busca_sin_tildes_ni_mayusculas(cliente, entrar, recepcion, cliente_y_profesional):
    entrar(recepcion)
    nombres = [p['nombre_completo'] for p in cliente.get('/api/profesionales?q=gomez JULIAN').json()]
    assert nombres == ['Julián Gómez']
    assert cliente.get('/api/profesionales?q=perez').json() == []


def test_no_ve_ni_toca_lo_de_otro_laboratorio(cliente, entrar, recepcion, otro_laboratorio):
    ajeno = Cliente.objects.create(laboratorio=otro_laboratorio, razon_social='Ajena')
    entrar(recepcion)
    assert cliente.get('/api/clientes').json() == []
    assert cliente.get(f'/api/clientes/{ajeno.id}').status_code == 404
    assert cliente.patch(f'/api/clientes/{ajeno.id}', {'activo': False}, format='json').status_code == 404


def test_no_cuelga_un_profesional_de_un_cliente_ajeno(cliente, entrar, recepcion, otro_laboratorio):
    ajeno = Cliente.objects.create(laboratorio=otro_laboratorio, razon_social='Ajena')
    entrar(recepcion)
    datos = {'nombre': 'Ana', 'apellido': 'Paz', 'clientes': [str(ajeno.id)]}
    assert cliente.post('/api/profesionales', datos, format='json').status_code == 400


def test_desactivar_lo_saca_de_la_lista_pero_no_lo_borra(cliente, entrar, recepcion, cliente_y_profesional):
    clinica, _ = cliente_y_profesional
    entrar(recepcion)
    cliente.patch(f'/api/clientes/{clinica.id}', {'activo': False}, format='json')
    assert cliente.get('/api/clientes').json() == []
    assert len(cliente.get('/api/clientes?activos=false').json()) == 1
    evento = Evento.objects.get(accion='cliente_cambiado')
    assert evento.antes == {'activo': True}
    assert evento.despues == {'activo': False}
