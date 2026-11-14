"""
Qué puede hacer cada rol, en un solo lugar (docs/13-plan-de-trabajo.md §4).

Las vistas preguntan `puede(membresia, Accion.X)`; nunca miran el rol a mano. Una acción
que no está en `_PERMISOS` no la puede hacer nadie: una vista nueva que pregunta por algo
mal escrito nace cerrada, no abierta. Todos los del equipo leen todo el caso; los roles
solo deciden lo que se puede CAMBIAR.

Las reglas que dependen del objeto (quién avanza una etapa; en la S7, quién confirma la
lectura de un cambio) también viven acá, no en las vistas.
"""

from enum import StrEnum

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from .models import Rol


class Accion(StrEnum):
    CREAR_CASO = 'crear_caso'
    REGISTRAR_CAMBIO = 'registrar_cambio'
    REVISAR = 'revisar'
    DISENAR = 'disenar'
    AVANZAR_PRODUCCION = 'avanzar_produccion'
    CONTROLAR = 'controlar'
    REASIGNAR = 'reasignar'
    ENTREGAR = 'entregar'
    CANCELAR_CASO = 'cancelar_caso'
    COMENTAR = 'comentar'
    GESTIONAR_EQUIPO = 'gestionar_equipo'
    GESTIONAR_CATALOGO = 'gestionar_catalogo'
    GESTIONAR_CLIENTES = 'gestionar_clientes'
    VER_AUDITORIA = 'ver_auditoria'


_REC, _REV, _CAD, _PROD = Rol.RECEPCION, Rol.REVISION, Rol.CAD, Rol.PRODUCCION
_CTRL, _SUP, _ADM = Rol.CONTROL, Rol.SUPERVISION, Rol.ADMINISTRACION
_TODO_EL_EQUIPO = frozenset({_REC, _REV, _CAD, _PROD, _CTRL, _SUP})

#: Acción → roles que la pueden hacer. Supervisión cubre a cualquiera que falte (por
#: eso aparece en casi todo); Administración configura el sistema pero no toca casos.
_PERMISOS: dict[Accion, frozenset[str]] = {
    Accion.CREAR_CASO: frozenset({_REC, _SUP}),
    Accion.REGISTRAR_CAMBIO: frozenset({_REC, _SUP}),
    Accion.REVISAR: frozenset({_REV, _SUP}),
    Accion.DISENAR: frozenset({_CAD}),
    Accion.AVANZAR_PRODUCCION: frozenset({_PROD, _SUP}),
    Accion.CONTROLAR: frozenset({_CTRL, _SUP}),
    Accion.REASIGNAR: frozenset({_SUP}),
    Accion.ENTREGAR: frozenset({_REC, _SUP}),
    Accion.CANCELAR_CASO: frozenset({_REC, _SUP}),
    Accion.COMENTAR: _TODO_EL_EQUIPO,
    Accion.GESTIONAR_EQUIPO: frozenset({_ADM}),
    Accion.GESTIONAR_CATALOGO: frozenset({_ADM}),
    Accion.GESTIONAR_CLIENTES: frozenset({_ADM, _REC}),
    Accion.VER_AUDITORIA: frozenset({_ADM, _SUP}),
}


def puede(membresia, accion: str) -> bool:
    """La única respuesta a "¿esta persona puede hacer esto en este laboratorio?"."""
    if membresia is None or not membresia.activa or not membresia.laboratorio.activo:
        return False
    try:
        permitidos = _PERMISOS[Accion(accion)]
    except ValueError:
        return False
    return any(rol in permitidos for rol in membresia.roles)


def puede_avanzar_etapa(membresia, etapa) -> bool:
    """Una etapa la avanza quien tiene el rol de esa etapa. Supervisión cubre a cualquiera
    que falte. Las pruebas en el consultorio las cierra Recepción cuando vuelve el trabajo."""
    if membresia is None or not membresia.activa or not membresia.laboratorio.activo:
        return False
    return etapa.rol in membresia.roles or _SUP in membresia.roles


def puede_confirmar_cambio(membresia, roles_que_confirman) -> bool:
    """Un cambio de ficha lo confirma quien tiene el trabajo ahora (el rol de su etapa
    actual), porque es quien tiene que enterarse. Supervisión no lo confirma por otro: si
    nadie lo lee, le llega el aviso (S15), no el botón."""
    if membresia is None or not membresia.activa or not membresia.laboratorio.activo:
        return False
    return any(rol in membresia.roles for rol in roles_que_confirman)


def permisos_de(membresia) -> list[str]:
    """Para que el front esconda lo que no aplica. La decisión real la toma `puede`."""
    return sorted(accion.value for accion in Accion if puede(membresia, accion))


def exigir(membresia, accion: str, mensaje: str = 'Tu rol no puede hacer esto.'):
    if not puede(membresia, accion):
        raise PermissionDenied(mensaje)


class LaboratorioScopedMixin:
    """
    Para toda vista que toca datos de un laboratorio. Es la única barrera contra que un
    laboratorio vea lo de otro: una vista que consulte `Modelo.objects.get(pk=...)` a
    secas reintroduce la fuga. Un objeto de otro laboratorio da 404, igual que uno que
    no existe: no se distingue "existe pero no es tuyo".
    """

    #: Lookup para llegar del modelo al laboratorio ('laboratorio' en los modelos que
    #: heredan de ModeloDeLaboratorio).
    laboratorio_lookup = 'laboratorio'

    def get_membresia(self, request):
        membresia = getattr(request, 'membresia', None)
        if membresia is None:
            # Sin laboratorio no hay con qué filtrar: se corta, nunca "ver todo".
            raise PermissionDenied('Elegí un laboratorio para seguir.')
        return membresia

    def get_laboratorio(self, request):
        return self.get_membresia(request).laboratorio

    def scoped_queryset(self, request, modelo):
        return modelo.objects.filter(**{self.laboratorio_lookup: self.get_laboratorio(request)})

    def get_scoped_object(self, request, modelo, **kwargs):
        return get_object_or_404(self.scoped_queryset(request, modelo), **kwargs)
