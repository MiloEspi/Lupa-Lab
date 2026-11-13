"""
Deja en `request.membresia` la membresía del laboratorio con el que se está trabajando.

Va en un middleware (y no en cada vista) porque también tiene que cortar el acceso
fuera de la API: una persona dada de baja, o una sesión cerrada desde "Mis
dispositivos", queda afuera en el próximo pedido, no cuando le venza la cookie.
"""

from datetime import timedelta

from django.contrib.auth import logout
from django.utils import timezone

from .models import Membresia, SesionDispositivo

CLAVE_LABORATORIO = 'laboratorio_id'
CLAVE_SEGUIDA = 'sesion_seguida'

#: Cada cuánto se actualiza "último uso" del dispositivo: escribir en cada pedido es
#: carga inútil para un dato que se muestra como "hace 10 minutos".
_CADA = timedelta(minutes=5)


def membresias_activas(usuario):
    return (
        Membresia.objects.filter(usuario=usuario, activa=True, laboratorio__activo=True)
        .select_related('laboratorio')
        .order_by('laboratorio__nombre')
    )


class LaboratorioActivoMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.membresia = None
        usuario = getattr(request, 'user', None)
        if usuario is not None and usuario.is_authenticated:
            if not self._sesion_sigue_viva(request):
                logout(request)
            else:
                request.membresia = resolver_membresia(request, usuario)
                if request.membresia is None and not usuario.is_superuser and not membresias_activas(usuario).exists():
                    # Dado de baja en todos lados: afuera ya.
                    logout(request)
        return self.get_response(request)

    def _sesion_sigue_viva(self, request) -> bool:
        if not request.session.get(CLAVE_SEGUIDA):
            # Sesiones del admin de Django: no pasan por el ingreso de la app.
            return True
        sesion = SesionDispositivo.objects.filter(clave_sesion=request.session.session_key).first()
        if sesion is None:
            return False
        ahora = timezone.now()
        if ahora - sesion.ultimo_uso > _CADA:
            SesionDispositivo.objects.filter(pk=sesion.pk).update(ultimo_uso=ahora)
        return True


def resolver_membresia(request, usuario):
    """La membresía con la que se trabaja: la elegida en la sesión o, si hay una sola, esa."""
    activas = membresias_activas(usuario)
    elegido = request.session.get(CLAVE_LABORATORIO)
    if elegido:
        membresia = activas.filter(laboratorio_id=elegido).first()
        if membresia is not None:
            return membresia
        request.session.pop(CLAVE_LABORATORIO, None)
    # Con un solo laboratorio no hay nada que elegir.
    unicas = list(activas[:2])
    if len(unicas) == 1:
        request.session[CLAVE_LABORATORIO] = str(unicas[0].laboratorio_id)
        return unicas[0]
    return None
