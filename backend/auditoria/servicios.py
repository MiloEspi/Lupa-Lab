"""
Se llama a `registrar` DESPUÉS de que el cambio se guardó: un registro de algo que no
pasó es peor que no tener registro. Como las vistas corren en una transacción
(ATOMIC_REQUESTS), si algo falla después, el evento se va con el cambio.
"""

from .models import Evento


def ip_de(request):
    if request is None:
        return None
    reenviada = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (reenviada.split(',')[0].strip() or request.META.get('REMOTE_ADDR')) or None


def registrar(request, accion, objeto=None, *, antes=None, despues=None, laboratorio=None, usuario=None):
    if usuario is None and request is not None and request.user.is_authenticated:
        usuario = request.user
    if laboratorio is None and request is not None:
        membresia = getattr(request, 'membresia', None)
        laboratorio = membresia.laboratorio if membresia is not None else None
    return Evento.objects.create(
        laboratorio=laboratorio,
        usuario=usuario,
        nombre_usuario=usuario.nombre_visible if usuario is not None else '',
        accion=accion,
        objeto_tipo=objeto._meta.model_name if objeto is not None else '',
        objeto_id=str(objeto.pk) if objeto is not None else '',
        antes=antes,
        despues=despues,
        ip=ip_de(request),
    )
