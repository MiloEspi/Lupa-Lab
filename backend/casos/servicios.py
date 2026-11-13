"""
Las reglas del caso, fuera de las vistas: así las prueban los tests directo y las usan
igual la API, el QR de producción (S13) y lo que venga.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from auditoria.servicios import registrar
from cuentas.permisos import Accion, exigir, puede_avanzar_etapa

from .models import Caso, ContadorCasos, EtapaTrabajo, Trabajo


def siguiente_numero(laboratorio) -> int:
    contador, _ = ContadorCasos.objects.get_or_create(laboratorio=laboratorio)
    contador = ContadorCasos.objects.select_for_update().get(pk=contador.pk)
    contador.ultimo += 1
    contador.save(update_fields=['ultimo'])
    return contador.ultimo


def _copiar_ruta(trabajo):
    """Copia la ruta de la plantilla y arranca la primera etapa. Desde acá es del trabajo."""
    ahora = timezone.now()
    pasos = list(trabajo.item.plantilla_etapas.pasos.all())
    EtapaTrabajo.objects.bulk_create(
        EtapaTrabajo(
            trabajo=trabajo,
            orden=paso.orden,
            nombre=paso.nombre,
            rol=paso.rol,
            en_consultorio=paso.en_consultorio,
            estado=EtapaTrabajo.Estado.EN_CURSO if i == 0 else EtapaTrabajo.Estado.PENDIENTE,
            inicio=ahora if i == 0 else None,
        )
        for i, paso in enumerate(pasos)
    )


@transaction.atomic
def crear_caso(request, *, trabajos, **datos):
    membresia = request.membresia
    exigir(membresia, Accion.CREAR_CASO, 'Tu rol no puede crear casos.')
    caso = Caso.objects.create(
        laboratorio=membresia.laboratorio,
        numero=siguiente_numero(membresia.laboratorio),
        creado_por=request.user,
        **datos,
    )
    for orden, datos_trabajo in enumerate(trabajos, start=1):
        trabajo = Trabajo.objects.create(caso=caso, orden=orden, **datos_trabajo)
        _copiar_ruta(trabajo)
    registrar(request, 'caso_creado', caso, despues={'numero': caso.numero, 'trabajos': len(trabajos)})
    return caso


def _exigir_abierto(caso):
    if caso.estado != Caso.Estado.ABIERTO:
        raise ValidationError({'detail': f'El caso está {caso.get_estado_display().lower()}: no se puede cambiar.'})


@transaction.atomic
def avanzar(request, trabajo):
    """Termina la etapa en curso y arranca la siguiente. Solo quien tiene el rol de esa etapa
    (o Supervisión). En la S7 se suma: no avanza con un cambio sin confirmar."""
    caso = Caso.objects.select_for_update().get(pk=trabajo.caso_id)
    _exigir_abierto(caso)
    etapas = list(trabajo.etapas.select_for_update())
    actual = next((e for e in etapas if e.estado == EtapaTrabajo.Estado.EN_CURSO), None)
    if actual is None:
        raise ValidationError({'detail': 'Este trabajo ya pasó por todas sus etapas.'})
    if not puede_avanzar_etapa(request.membresia, actual):
        raise PermissionDenied(f'"{actual.nombre}" la avanza {actual.get_rol_display()}.')
    ahora = timezone.now()
    actual.estado, actual.fin, actual.hecha_por = EtapaTrabajo.Estado.HECHA, ahora, request.membresia
    actual.save(update_fields=['estado', 'fin', 'hecha_por'])
    siguiente = next((e for e in etapas if e.orden > actual.orden), None)
    if siguiente is not None:
        siguiente.estado, siguiente.inicio = EtapaTrabajo.Estado.EN_CURSO, ahora
        siguiente.save(update_fields=['estado', 'inicio'])
    registrar(
        request,
        'etapa_terminada',
        caso,
        despues={
            'trabajo': str(trabajo.pk),
            'etapa': actual.nombre,
            'siguiente': siguiente.nombre if siguiente else None,
        },
    )
    return trabajo


@transaction.atomic
def entregar(request, caso):
    exigir(request.membresia, Accion.ENTREGAR, 'Tu rol no puede entregar casos.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    pendientes = [t for t in caso.trabajos.prefetch_related('etapas') if not t.terminado]
    if pendientes:
        raise ValidationError({'detail': 'Hay trabajos que no terminaron todas sus etapas.'})
    caso.estado = Caso.Estado.ENTREGADO
    caso.save(update_fields=['estado', 'actualizado'])
    registrar(request, 'caso_entregado', caso)
    return caso


@transaction.atomic
def cancelar(request, caso, motivo):
    exigir(request.membresia, Accion.CANCELAR_CASO, 'Tu rol no puede cancelar casos.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    if not motivo.strip():
        raise ValidationError({'motivo': ['Contá por qué se cancela.']})
    caso.estado, caso.motivo_cancelacion = Caso.Estado.CANCELADO, motivo.strip()[:200]
    caso.save(update_fields=['estado', 'motivo_cancelacion', 'actualizado'])
    registrar(request, 'caso_cancelado', caso, despues={'motivo': caso.motivo_cancelacion})
    return caso
