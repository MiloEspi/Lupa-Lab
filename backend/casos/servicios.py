"""
Las reglas del caso, fuera de las vistas: así las prueban los tests directo y las usan
igual la API, el QR de producción (S13) y lo que venga.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from auditoria.servicios import registrar
from cuentas.models import Rol
from cuentas.permisos import Accion, exigir, puede, puede_avanzar_etapa, puede_confirmar_cambio

from .models import (
    Caso,
    ConfirmacionLectura,
    ContadorCasos,
    EtapaTrabajo,
    RevisionFicha,
    RevisionTecnica,
    Trabajo,
    foto_de_trabajos,
)


class CambioSinConfirmar(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Hay un cambio de ficha sin confirmar: primero tiene que leerlo quien tiene el trabajo.'


class EnEspera(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'El caso está en espera del odontólogo: avanza cuando llegue lo que se pidió.'


class CasoPausado(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'El caso está pausado: Recepción lo tiene que reanudar para que siga.'


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
def crear_caso(request, *, trabajos, pasar_a_revision=False, **datos):
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
    RevisionFicha.objects.create(caso=caso, version=1, trabajos=foto_de_trabajos(caso), creada_por=request.user)
    registrar(request, 'caso_creado', caso, despues={'numero': caso.numero, 'trabajos': len(trabajos)})
    if pasar_a_revision:
        # "Crear caso y pasar a revisión": quien lo carga completa la etapa de Recepción.
        for trabajo in caso.trabajos.all():
            actual = trabajo.etapa_actual
            if actual is not None and actual.rol == Rol.RECEPCION and puede_avanzar_etapa(membresia, actual):
                avanzar(request, trabajo)
    return caso


def _exigir_abierto(caso):
    if caso.estado != Caso.Estado.ABIERTO:
        raise ValidationError({'detail': f'El caso está {caso.get_estado_display().lower()}: no se puede cambiar.'})


@transaction.atomic
def avanzar(request, trabajo, *, desde_revision=False):
    """Termina la etapa en curso y arranca la siguiente. Solo quien tiene el rol de esa etapa
    (o Supervisión). No avanza con un cambio sin confirmar (S7) ni en espera del odontólogo
    (S12). La revisión técnica de un trabajo con checklist se cierra solo con `revisar`: si
    no, "Falta" no frenaría nada."""
    caso = Caso.objects.select_for_update().get(pk=trabajo.caso_id)
    _exigir_abierto(caso)
    if caso.cambio_pendiente_id:
        raise CambioSinConfirmar()
    if caso.en_espera:
        raise EnEspera()
    if caso.pausado:
        raise CasoPausado()
    etapas = list(trabajo.etapas.select_for_update())
    actual = next((e for e in etapas if e.estado == EtapaTrabajo.Estado.EN_CURSO), None)
    if actual is None:
        raise ValidationError({'detail': 'Este trabajo ya pasó por todas sus etapas.'})
    if not puede_avanzar_etapa(request.membresia, actual):
        raise PermissionDenied(f'"{actual.nombre}" la avanza {actual.get_rol_display()}.')
    if actual.rol == Rol.REVISION and not desde_revision and trabajo.item.plantilla_checklist_id:
        raise ValidationError({'detail': 'La revisión técnica se cierra con el checklist, desde Revisión.'})
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
def iniciar_etapa(request, trabajo):
    """El técnico toca "Iniciar" al empezar a trabajar la etapa (S13). No cambia de etapa:
    solo deja quién y cuándo, para medir cuánto espera cada trabajo en la fila y cuánto
    lleva trabajarlo. Mismas reglas que `avanzar`: lo inicia quien tiene el rol de la etapa
    (o Supervisión) y no con un cambio sin confirmar ni en espera del odontólogo."""
    caso = Caso.objects.select_for_update().get(pk=trabajo.caso_id)
    _exigir_abierto(caso)
    if caso.cambio_pendiente_id:
        raise CambioSinConfirmar()
    if caso.en_espera:
        raise EnEspera()
    if caso.pausado:
        raise CasoPausado()
    actual = next((e for e in trabajo.etapas.select_for_update() if e.estado == EtapaTrabajo.Estado.EN_CURSO), None)
    if actual is None:
        raise ValidationError({'detail': 'Este trabajo ya pasó por todas sus etapas.'})
    if not puede_avanzar_etapa(request.membresia, actual):
        raise PermissionDenied(f'"{actual.nombre}" la inicia {actual.get_rol_display()}.')
    if actual.iniciada_en is not None:
        # No se pisa: si dos personas escanean la misma caja, queda la primera.
        quien = actual.iniciada_por.usuario.nombre_visible if actual.iniciada_por_id else 'alguien'
        raise ValidationError({'detail': f'"{actual.nombre}" ya la inició {quien}.'})
    actual.iniciada_en, actual.iniciada_por = timezone.now(), request.membresia
    actual.save(update_fields=['iniciada_en', 'iniciada_por'])
    registrar(request, 'etapa_iniciada', caso, despues={'trabajo': str(trabajo.pk), 'etapa': actual.nombre})
    return trabajo


@transaction.atomic
def reportar_problema(request, trabajo, texto):
    """Producción avisa que algo salió mal (fresa rota, pieza astillada, falta material).
    No frena el caso: queda en la conversación, en la etapa, y como evento para que
    Supervisión lo vea (el push llega con la S15). Quien decide qué hacer es una persona."""
    exigir(request.membresia, Accion.AVANZAR_PRODUCCION, 'Los problemas de producción los reporta Producción.')
    caso = Caso.objects.select_for_update().get(pk=trabajo.caso_id)
    _exigir_abierto(caso)
    texto = texto.strip()
    if not texto:
        raise ValidationError({'texto': ['Contá qué pasó.']})
    actual = trabajo.etapa_actual
    from hilo.models import Mensaje

    Mensaje.objects.create(
        caso=caso,
        autor=request.membresia,
        tipo=Mensaje.Tipo.EQUIPO,
        texto=texto[:1000],
        nota='Problema en producción',
        etapa=actual.nombre if actual else '',
        etapa_orden=actual.orden - 1 if actual else None,
    )
    registrar(
        request,
        'problema_reportado',
        caso,
        despues={'trabajo': str(trabajo.pk), 'etapa': actual.nombre if actual else None, 'texto': texto[:1000]},
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


@transaction.atomic
def pausar(request, caso, motivo):
    """Frena el caso a mano: nadie avanza ni inicia etapas hasta reanudarlo. Pide el motivo
    porque queda en la conversación y en la auditoría, y es lo que el equipo lee para saber por qué."""
    exigir(request.membresia, Accion.PAUSAR_CASO, 'Tu rol no puede pausar casos.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    if caso.pausado:
        raise ValidationError({'detail': 'El caso ya está pausado.'})
    motivo = motivo.strip()
    if not motivo:
        raise ValidationError({'motivo': ['Contá por qué se pausa.']})
    caso.pausado, caso.pausa_desde, caso.pausa_motivo = True, timezone.now(), motivo[:200]
    caso.save(update_fields=['pausado', 'pausa_desde', 'pausa_motivo', 'actualizado'])
    from hilo.servicios import mensaje_de_sistema

    mensaje_de_sistema(caso, f'{request.membresia.usuario.nombre_visible} pausó el caso: {caso.pausa_motivo}.')
    registrar(request, 'caso_pausado', caso, despues={'motivo': caso.pausa_motivo})
    return caso


@transaction.atomic
def reanudar(request, caso):
    exigir(request.membresia, Accion.PAUSAR_CASO, 'Tu rol no puede reanudar casos.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    if not caso.pausado:
        raise ValidationError({'detail': 'El caso no está pausado.'})
    caso.pausado, caso.pausa_desde, caso.pausa_motivo = False, None, ''
    caso.save(update_fields=['pausado', 'pausa_desde', 'pausa_motivo', 'actualizado'])
    from hilo.servicios import mensaje_de_sistema

    mensaje_de_sistema(caso, f'{request.membresia.usuario.nombre_visible} reanudó el caso.')
    registrar(request, 'caso_reanudado', caso)
    return caso


def roles_que_confirman(revision) -> list[str]:
    """Los roles de la etapa actual de cada trabajo que cambió. Un trabajo que ya terminó
    sus etapas está en manos de Recepción (lo entrega)."""
    ids = {c['trabajo'] for c in revision.cambios}
    roles = []
    for trabajo in revision.caso.trabajos.prefetch_related('etapas'):
        if str(trabajo.pk) not in ids:
            continue
        actual = trabajo.etapa_actual
        rol = actual.rol if actual is not None else Rol.RECEPCION
        if rol not in roles:
            roles.append(rol)
    return roles


@transaction.atomic
def registrar_cambio(request, caso, trabajo, cambios, motivo):
    """Aplica el cambio al trabajo, crea la versión siguiente de la ficha y frena el caso.
    `cambios` ya viene validado (mismas reglas fijas que el alta)."""
    exigir(request.membresia, Accion.REGISTRAR_CAMBIO, 'Tu rol no puede registrar cambios.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    if not motivo.strip():
        raise ValidationError({'motivo': ['Contá qué pidió el odontólogo y por dónde llegó.']})
    diferencias = [
        {'trabajo': str(trabajo.pk), 'campo': campo, 'antes': getattr(trabajo, campo), 'despues': valor}
        for campo, valor in cambios.items()
        if getattr(trabajo, campo) != valor
    ]
    if not diferencias:
        raise ValidationError({'detail': 'No cambia nada: los datos son los mismos que ya tiene la ficha.'})
    for campo, valor in cambios.items():
        setattr(trabajo, campo, valor)
    trabajo.save(update_fields=list(cambios))
    # Si había otro cambio sin leer, este lo incluye: se confirman juntos.
    anteriores = caso.cambio_pendiente.cambios if caso.cambio_pendiente_id else []
    caso.version_ficha += 1
    revision = RevisionFicha.objects.create(
        caso=caso,
        version=caso.version_ficha,
        trabajos=foto_de_trabajos(caso),
        cambios=_juntar(anteriores, diferencias),
        motivo=motivo.strip()[:300],
        creada_por=request.user,
    )
    caso.cambio_pendiente = revision
    caso.save(update_fields=['version_ficha', 'cambio_pendiente', 'actualizado'])
    registrar(request, 'cambio_registrado', caso, despues={'version': revision.version, 'cambios': diferencias})
    from hilo.servicios import mensaje_de_sistema

    detalle = ', '.join(f'{d["campo"]} {d["antes"] or "—"} a {d["despues"] or "—"}' for d in diferencias)
    mensaje_de_sistema(
        caso,
        f'Cambio registrado: {detalle}. Motivo: {revision.motivo}',
        version_ficha=revision.version,
        nota=f'Lo registró {request.user.nombre_visible}',
    )
    return caso


def _juntar(anteriores, nuevos):
    """Un campo que cambió dos veces queda con el valor original y el último."""
    por_clave = {(c['trabajo'], c['campo']): dict(c) for c in anteriores}
    for c in nuevos:
        clave = (c['trabajo'], c['campo'])
        if clave in por_clave:
            por_clave[clave]['despues'] = c['despues']
        else:
            por_clave[clave] = dict(c)
    return [c for c in por_clave.values() if c['antes'] != c['despues']]


@transaction.atomic
def confirmar_cambio(request, caso, *, rehacer=False, trabajo=None, volver_a=None, comentario=''):
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    revision = caso.cambio_pendiente
    if revision is None:
        raise ValidationError({'detail': 'No hay ningún cambio para confirmar.'})
    roles = roles_que_confirman(revision)
    if not puede_confirmar_cambio(request.membresia, roles):
        nombres = ', '.join(Rol(r).label for r in roles)
        raise PermissionDenied(f'Este cambio lo confirma quien tiene el trabajo ahora: {nombres}.')
    destino = _volver(caso, trabajo, volver_a) if rehacer else None
    ConfirmacionLectura.objects.create(
        revision=revision,
        membresia=request.membresia,
        rehacer=rehacer,
        volver_a=destino.nombre if destino else '',
        comentario=comentario.strip()[:300],
    )
    caso.cambio_pendiente = None
    caso.save(update_fields=['cambio_pendiente', 'actualizado'])
    registrar(
        request,
        'cambio_confirmado',
        caso,
        despues={'version': revision.version, 'rehacer': rehacer, 'volver_a': destino.nombre if destino else None},
    )
    return caso


def _volver(caso, trabajo_id, orden):
    """Vuelve el trabajo a una etapa que ya pasó: esa queda en curso y las siguientes, pendientes."""
    trabajo = caso.trabajos.filter(pk=trabajo_id).first() if trabajo_id else caso.trabajos.first()
    if trabajo is None:
        raise ValidationError({'trabajo': ['Ese trabajo no es de este caso.']})
    etapas = list(trabajo.etapas.select_for_update())
    actual = next((e for e in etapas if e.estado == EtapaTrabajo.Estado.EN_CURSO), None)
    tope = actual.orden if actual is not None else len(etapas) + 1
    destino = next((e for e in etapas if e.orden == orden), None)
    if destino is None or destino.orden >= tope:
        raise ValidationError({'volver_a': ['Se vuelve a una etapa por la que el trabajo ya pasó.']})
    for etapa in etapas:
        if etapa.orden >= destino.orden:
            etapa.estado, etapa.inicio, etapa.fin, etapa.hecha_por = EtapaTrabajo.Estado.PENDIENTE, None, None, None
            etapa.iniciada_en, etapa.iniciada_por = None, None
            etapa.save(update_fields=['estado', 'inicio', 'fin', 'hecha_por', 'iniciada_en', 'iniciada_por'])
    destino.estado, destino.inicio = EtapaTrabajo.Estado.EN_CURSO, timezone.now()
    destino.save(update_fields=['estado', 'inicio'])
    return destino


# --- Revisión técnica (S12) -----------------------------------------------------------------


def en_revision(caso):
    """Los trabajos del caso que están en una etapa de Revisión técnica y el checklist que
    les toca: los puntos de sus plantillas, sin repetir, en orden."""
    trabajos = [
        t
        for t in caso.trabajos.select_related('item__plantilla_checklist').prefetch_related('etapas')
        if (e := t.etapa_actual) is not None and e.rol == Rol.REVISION
    ]
    items = []
    for t in trabajos:
        for texto in t.item.plantilla_checklist.items if t.item.plantilla_checklist else []:
            if texto not in items:
                items.append(texto)
    return trabajos, items


def _lista(textos):
    return ', '.join(textos).lower()


@transaction.atomic
def revisar(request, caso, *, marcas, decision, mensaje=''):
    """
    Cierra una pasada de la revisión técnica. Reglas: se marcan todos los puntos; con algo
    en "Falta" no se aprueba (se pide o se aprueba con nota técnica); "pedir" deja el caso
    en espera y el mensaje en la conversación (lo manda una persona por WhatsApp, D15).
    """
    exigir(request.membresia, Accion.REVISAR, 'La revisión técnica la hace Revisión técnica.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    if caso.cambio_pendiente_id:
        raise CambioSinConfirmar()
    if caso.pausado:
        raise CasoPausado()
    trabajos, items = en_revision(caso)
    if not trabajos:
        raise ValidationError({'detail': 'Este caso no está en revisión técnica.'})
    if len(marcas) != len(items):
        raise ValidationError({'marcas': [f'El checklist tiene {len(items)} puntos.']})
    pares = list(zip(items, marcas, strict=True))
    sin_marcar = [t for t, m in pares if m not in RevisionTecnica.Marca.values]
    if sin_marcar:
        raise ValidationError({'marcas': [f'Marcá todos los puntos. Falta revisar: {_lista(sin_marcar)}.']})
    faltan = [t for t, m in pares if m == RevisionTecnica.Marca.FALTA]
    dudas = [t for t, m in pares if m == RevisionTecnica.Marca.DUDA]
    if decision == RevisionTecnica.Decision.APROBAR and faltan:
        raise ValidationError(
            {'decision': [f'No se aprueba con puntos en "Falta" ({_lista(faltan)}). Pedilos o aprobá con nota.']}
        )
    mensaje = mensaje.strip()
    pedir = decision == RevisionTecnica.Decision.PEDIR
    if pedir and not mensaje:
        raise ValidationError({'mensaje': ['Escribí qué le pedís al odontólogo.']})

    from hilo.models import Mensaje
    from hilo.servicios import etapa_del_caso, mensaje_de_sistema

    revision = RevisionTecnica.objects.create(
        caso=caso,
        items=[{'texto': t, 'marca': m} for t, m in pares],
        decision=decision,
        mensaje=mensaje if pedir else '',
        por=request.membresia,
    )
    if pedir:
        caso.en_espera, caso.espera_desde = True, timezone.now()
        caso.save(update_fields=['en_espera', 'espera_desde', 'actualizado'])
        etapa, orden = etapa_del_caso(caso)
        Mensaje.objects.create(
            caso=caso,
            autor=request.membresia,
            tipo=Mensaje.Tipo.ODONTOLOGO,
            texto=mensaje,
            nota='Pedido por WhatsApp desde la revisión técnica',
            etapa=etapa,
            etapa_orden=orden,
        )
    else:
        texto = f'Revisión técnica: {revision.get_decision_display().lower()}.'
        if dudas:
            texto += f' Con duda: {_lista(dudas)}.'
        if faltan:
            texto += f' Falta: {_lista(faltan)}.'
        # Antes de avanzar, así el mensaje queda en la etapa de la revisión.
        mensaje_de_sistema(caso, texto)
        for trabajo in trabajos:
            avanzar(request, trabajo, desde_revision=True)
    registrar(request, 'revision_tecnica', caso, despues={'decision': decision, 'faltan': faltan, 'dudas': dudas})
    return revision


@transaction.atomic
def llego_lo_pedido(request, caso):
    """Llegó lo que se le pidió al odontólogo: el caso vuelve a la bandeja de revisión. Lo
    marca Revisión técnica o Recepción, que es quien suele recibirlo."""
    membresia = request.membresia
    if not (puede(membresia, Accion.REVISAR) or puede(membresia, Accion.REGISTRAR_CAMBIO)):
        raise PermissionDenied('Lo marca Revisión técnica o Recepción.')
    caso = Caso.objects.select_for_update().get(pk=caso.pk)
    _exigir_abierto(caso)
    if not caso.en_espera:
        raise ValidationError({'detail': 'El caso no está esperando nada del odontólogo.'})
    caso.en_espera, caso.espera_desde = False, None
    caso.save(update_fields=['en_espera', 'espera_desde', 'actualizado'])
    from hilo.servicios import mensaje_de_sistema

    mensaje_de_sistema(caso, f'Llegó lo que se le pidió al odontólogo (lo marcó {membresia.usuario.nombre_visible}).')
    registrar(request, 'espera_resuelta', caso)
    return caso
