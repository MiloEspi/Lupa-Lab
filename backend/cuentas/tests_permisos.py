"""
Un test por celda de la matriz de permisos (docs/13-plan-de-trabajo.md §4).

La tabla de abajo es una copia escrita a mano, a propósito: si alguien cambia
`_PERMISOS` sin querer, este test falla y obliga a cambiar las dos cosas a conciencia.
"""

import pytest

from cuentas.models import Laboratorio, Membresia, Rol
from cuentas.permisos import Accion, permisos_de, puede

R = Rol
ESPERADO = {
    Accion.CREAR_CASO: {R.RECEPCION, R.SUPERVISION},
    Accion.REGISTRAR_CAMBIO: {R.RECEPCION, R.SUPERVISION},
    Accion.REVISAR: {R.REVISION, R.SUPERVISION},
    Accion.DISENAR: {R.CAD},
    Accion.AVANZAR_PRODUCCION: {R.PRODUCCION, R.SUPERVISION},
    Accion.CONTROLAR: {R.CONTROL, R.SUPERVISION},
    Accion.REASIGNAR: {R.SUPERVISION},
    Accion.ENTREGAR: {R.RECEPCION, R.SUPERVISION},
    Accion.CANCELAR_CASO: {R.RECEPCION, R.SUPERVISION},
    Accion.PAUSAR_CASO: {R.RECEPCION, R.SUPERVISION},
    Accion.COMENTAR: {R.RECEPCION, R.REVISION, R.CAD, R.PRODUCCION, R.CONTROL, R.SUPERVISION},
    Accion.GESTIONAR_EQUIPO: {R.ADMINISTRACION},
    Accion.GESTIONAR_CATALOGO: {R.ADMINISTRACION},
    Accion.GESTIONAR_CLIENTES: {R.ADMINISTRACION, R.RECEPCION},
    Accion.VER_AUDITORIA: {R.ADMINISTRACION, R.SUPERVISION},
    Accion.VER_TABLERO: {R.SUPERVISION},
}


def _membresia(roles, activa=True, laboratorio_activo=True):
    # Sin base: puede() solo mira roles, activa y el laboratorio.
    return Membresia(roles=roles, activa=activa, laboratorio=Laboratorio(nombre='X', activo=laboratorio_activo))


def test_la_tabla_cubre_todas_las_acciones():
    assert set(ESPERADO) == set(Accion)


@pytest.mark.parametrize('accion', list(Accion))
@pytest.mark.parametrize('rol', list(Rol))
def test_celda(accion, rol):
    assert puede(_membresia([rol]), accion) is (rol in ESPERADO[accion])


def test_varios_roles_suman():
    membresia = _membresia([R.CAD, R.CONTROL])
    assert puede(membresia, Accion.DISENAR)
    assert puede(membresia, Accion.CONTROLAR)
    assert not puede(membresia, Accion.REVISAR)


def test_sin_roles_no_puede_nada():
    assert permisos_de(_membresia([])) == []


def test_baja_no_puede_nada():
    assert permisos_de(_membresia([R.SUPERVISION, R.ADMINISTRACION], activa=False)) == []


def test_laboratorio_desactivado_no_puede_nada():
    assert permisos_de(_membresia([R.ADMINISTRACION], laboratorio_activo=False)) == []


def test_accion_desconocida_nace_cerrada():
    assert not puede(_membresia(list(Rol)), 'borrar_todo')


def test_sin_membresia_no_puede():
    assert not puede(None, Accion.COMENTAR)
