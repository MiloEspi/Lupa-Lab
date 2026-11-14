import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from cuentas.models import Laboratorio, Membresia, Rol, Usuario

PASSWORD = 'una-clave-de-prueba-larga'


@pytest.fixture(autouse=True)
def limites_limpios():
    # Los límites de intentos (throttles) viven en la caché: sin esto se arrastran de un
    # test al otro.
    cache.clear()


@pytest.fixture
def laboratorio(db):
    return Laboratorio.objects.create(nombre='Laboratorio A')


@pytest.fixture
def otro_laboratorio(db):
    return Laboratorio.objects.create(nombre='Laboratorio B')


@pytest.fixture
def crear_persona(db):
    def crear(laboratorio, email, roles, activa=True):
        usuario = Usuario.objects.filter(email=email).first() or Usuario.objects.create_user(email, PASSWORD)
        membresia = Membresia.objects.create(usuario=usuario, laboratorio=laboratorio, roles=roles, activa=activa)
        return membresia

    return crear


@pytest.fixture
def admin(laboratorio, crear_persona):
    return crear_persona(laboratorio, 'ada@lab-a.test', [Rol.ADMINISTRACION])


@pytest.fixture
def recepcion(laboratorio, crear_persona):
    return crear_persona(laboratorio, 'rita@lab-a.test', [Rol.RECEPCION])


@pytest.fixture
def cliente():
    return APIClient()


@pytest.fixture
def entrar(cliente):
    """Inicia sesión por la API (no con force_login): así se prueba el camino real."""

    def entrar_como(membresia_o_usuario, password=PASSWORD):
        usuario = getattr(membresia_o_usuario, 'usuario', membresia_o_usuario)
        respuesta = cliente.post('/api/auth/ingresar', {'email': usuario.email, 'password': password}, format='json')
        assert respuesta.status_code == 200, respuesta.content
        return respuesta

    return entrar_como


def aprobar_revision(cliente, caso_id):
    """Cierra la revisión técnica con todo "Bien" (desde la S12 no se pasa con avanzar)."""
    checklist = cliente.get(f'/api/casos/{caso_id}/revision').json()['checklist']
    datos = {'marcas': ['ok'] * len(checklist), 'decision': 'aprobar'}
    return cliente.post(f'/api/casos/{caso_id}/revision', datos, format='json')


@pytest.fixture
def catalogo(laboratorio):
    from catalogo.semilla import cargar_catalogo

    cargar_catalogo(laboratorio)
    return laboratorio


@pytest.fixture
def cliente_y_profesional(laboratorio):
    from directorio.models import Cliente, Profesional

    clinica = Cliente.objects.create(laboratorio=laboratorio, razon_social='Clínica Gómez')
    profesional = Profesional.objects.create(laboratorio=laboratorio, nombre='Julián', apellido='Gómez')
    profesional.clientes.add(clinica)
    return clinica, profesional
