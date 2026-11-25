"""
Lo que se lee de los casos sin cambiarlos (S14): "Mis cajas de hoy" para quien trabaja y el
tablero para Supervisión. Todo sale de lo que ya guardan las etapas y las marcas del caso;
no hay tablas nuevas. Las reglas de "qué es atrasado" viven acá y en ningún otro lado.
"""

from collections import defaultdict
from datetime import timedelta

from django.db.models import Avg, Count, Max, Q
from django.utils import timezone

from auditoria.models import Evento
from cuentas.models import Membresia, Rol

from . import servicios
from .models import Caso, EtapaTrabajo, Trabajo

#: Días calendario que muestra el gráfico de carga: hacia atrás y hacia adelante.
DIAS_ATRAS, DIAS_ADELANTE = 13, 7
#: Un problema reportado pide atención este tiempo; después lo tiene la conversación del caso.
DIAS_DE_UN_PROBLEMA = 3
#: Esperar al odontólogo recién es "para atender" pasado este tiempo.
HORAS_DE_ESPERA = 24
#: Cuántas filas trae "Para atender ahora".
MAX_PARA_ATENDER = 12

ROLES_DE_PRODUCCION = [Rol.RECEPCION, Rol.REVISION, Rol.CAD, Rol.PRODUCCION, Rol.CONTROL]


def _horas(desde, ahora):
    return max((ahora - desde).total_seconds() / 3600, 0)


def _piezas(trabajo, tope=3) -> str:
    claves = list((trabajo.piezas or {}).keys())
    texto = ', '.join(claves[:tope])
    return texto + ('…' if len(claves) > tope else '')


def _bloqueo(caso):
    """Qué frena al caso, si algo. El cambio sin leer va primero: es lo que hay que hacer antes."""
    if caso.cambio_pendiente_id:
        return 'cambio'
    if caso.pausado:
        return 'pausa'
    if caso.en_espera:
        return 'espera'
    return None


# --- Mis cajas de hoy --------------------------------------------------------------------------


def mis_cajas(membresia):
    """Las cajas cuya etapa en curso le toca a esta persona, lo urgente primero. Supervisión
    no tiene cajas propias (ve todo en el tablero) y un trabajo terminado no es de nadie."""
    hoy = timezone.localdate()
    etapas = (
        EtapaTrabajo.objects.filter(
            trabajo__caso__laboratorio=membresia.laboratorio,
            trabajo__caso__estado=Caso.Estado.ABIERTO,
            estado=EtapaTrabajo.Estado.EN_CURSO,
            rol__in=membresia.roles,
        )
        .select_related('trabajo__caso', 'trabajo__item__familia')
        .prefetch_related('trabajo__caso__trabajos__item__familia')
    )
    cajas = []
    for etapa in etapas:
        trabajo, caso = etapa.trabajo, etapa.trabajo.caso
        bloqueo = _bloqueo(caso)
        atrasado = caso.fecha_prometida is not None and caso.fecha_prometida < hoy
        cajas.append(
            {
                'caso': caso.pk,
                'trabajo': trabajo.pk,
                'codigo': caso.codigo,
                'numero': caso.numero,
                'item': trabajo.item.nombre,
                'material': trabajo.material,
                'pieza': _piezas(trabajo),
                'etapa': etapa.nombre,
                'iniciada': etapa.iniciada_en is not None,
                'fecha_prometida': caso.fecha_prometida,
                'atrasado': atrasado,
                'bloqueo': bloqueo,
            }
        )
    # Frenadas (pausa o espera) al final: no se pueden trabajar. Después, el cambio sin leer
    # (hay que leerlo antes de seguir), lo atrasado, y por fecha; sin fecha, al final.
    cajas.sort(
        key=lambda c: (
            c['bloqueo'] in ('pausa', 'espera'),
            c['bloqueo'] != 'cambio',
            not c['atrasado'],
            c['fecha_prometida'] is None,
            c['fecha_prometida'] or hoy,
            c['numero'],
        )
    )
    return cajas


# --- Tablero -----------------------------------------------------------------------------------


def desde_del_periodo(periodo, hoy):
    if periodo == 'semana':
        return hoy - timedelta(days=hoy.weekday())
    if periodo == 'mes':
        return hoy.replace(day=1)
    return hoy


def _resumen(caso):
    """Qué es y dónde está el caso, en una línea: para las listas del tablero."""
    trabajo = next(iter(caso.trabajos.all()), None)
    actual = trabajo.etapa_actual if trabajo is not None else None
    return {
        'caso': caso.pk,
        'codigo': caso.codigo,
        'etapa': actual.nombre if actual is not None else None,
        'item': trabajo.item.nombre if trabajo is not None else '',
        'pieza': _piezas(trabajo) if trabajo is not None else '',
        'profesional': caso.profesional.nombre_completo,
    }


def _abiertos(laboratorio):
    return Caso.objects.filter(laboratorio=laboratorio, estado=Caso.Estado.ABIERTO)


def _atrasados(laboratorio, hoy):
    casos = (
        _abiertos(laboratorio)
        .filter(fecha_prometida__lt=hoy)
        .select_related('profesional')
        .prefetch_related('trabajos__item__familia', 'trabajos__etapas')
        .order_by('fecha_prometida', 'numero')
    )
    filas = [{**_resumen(c), 'dias': (hoy - c.fecha_prometida).days, '_caso': c} for c in casos]
    en_espera = sum(1 for f in filas if f['_caso'].en_espera)
    pausados = sum(1 for f in filas if f['_caso'].pausado and not f['_caso'].en_espera)
    return {
        'total': len(filas),
        'en_espera': en_espera,
        'pausados': pausados,
        'en_produccion': len(filas) - en_espera - pausados,
        'casos': filas,
    }


def _cambios_sin_leer(laboratorio, ahora):
    casos = (
        _abiertos(laboratorio)
        .filter(cambio_pendiente__isnull=False)
        .select_related('profesional', 'cambio_pendiente')
        .prefetch_related('trabajos__item__familia', 'trabajos__etapas')
        .order_by('cambio_pendiente__creado')
    )
    filas = []
    for caso in casos:
        revision = caso.cambio_pendiente
        filas.append(
            {
                **_resumen(caso),
                'falta': servicios.roles_que_confirman(revision),
                'horas': int(_horas(revision.creado, ahora)),
                'cambios': revision.cambios,
                '_caso': caso,
            }
        )
    return {'total': len(filas), 'casos': filas}


def _entregas(laboratorio, desde, hoy):
    del_periodo = Caso.objects.filter(laboratorio=laboratorio, fecha_prometida__range=(desde, hoy)).exclude(
        estado=Caso.Estado.CANCELADO
    )
    cuentas = del_periodo.aggregate(
        prometidos=Count('id'), entregados=Count('id', filter=Q(estado=Caso.Estado.ENTREGADO))
    )
    return {'prometidos': cuentas['prometidos'], 'entregados': cuentas['entregados']}


def _dias(laboratorio, hoy):
    """Trabajos por fecha prometida, día calendario por día calendario. Los fines de semana
    van marcados (`habil`) para que la pantalla los esconda si están vacíos."""
    primero, ultimo = hoy - timedelta(days=DIAS_ATRAS), hoy + timedelta(days=DIAS_ADELANTE)
    filas = (
        Trabajo.objects.filter(caso__laboratorio=laboratorio, caso__fecha_prometida__range=(primero, ultimo))
        .exclude(caso__estado=Caso.Estado.CANCELADO)
        .values('caso__fecha_prometida')
        .annotate(trabajos=Count('id'), entregados=Count('id', filter=Q(caso__estado=Caso.Estado.ENTREGADO)))
    )
    por_fecha = {f['caso__fecha_prometida']: f for f in filas}
    dias = []
    for i in range((ultimo - primero).days + 1):
        fecha = primero + timedelta(days=i)
        fila = por_fecha.get(fecha)
        dias.append(
            {
                'fecha': fecha,
                'trabajos': fila['trabajos'] if fila else 0,
                'entregados': fila['entregados'] if fila else 0,
                'hoy': fecha == hoy,
                'futuro': fecha > hoy,
                'habil': fecha.weekday() < 5,
            }
        )
    return dias


def _etapas(laboratorio, ahora):
    """Casos y demora promedio por etapa. El caso que espera al odontólogo se cuenta aparte
    (es la que más demora) y no en la etapa donde quedó: ahí no hay nadie trabajándolo."""
    en_curso = EtapaTrabajo.objects.filter(
        trabajo__caso__laboratorio=laboratorio,
        trabajo__caso__estado=Caso.Estado.ABIERTO,
        estado=EtapaTrabajo.Estado.EN_CURSO,
    ).select_related('trabajo__caso')
    grupos = defaultdict(lambda: {'casos': set(), 'horas': [], 'orden': []})
    espera = {'casos': set(), 'horas': [], 'orden': []}
    for etapa in en_curso:
        caso = etapa.trabajo.caso
        grupo = espera if caso.en_espera else grupos[etapa.nombre]
        grupo['casos'].add(caso.pk)
        grupo['orden'].append(etapa.orden)
        desde = caso.espera_desde if caso.en_espera and caso.espera_desde else etapa.inicio
        if desde is not None:
            grupo['horas'].append(_horas(desde, ahora))

    filas = []
    for nombre, g in grupos.items():
        filas.append(_fila_de_etapa(nombre, g, espera=False))
    if espera['casos']:
        # Se ubica pegada a donde se frenaron los casos (Revisión técnica, casi siempre).
        filas.append(_fila_de_etapa('Esperando odontólogo', espera, espera=True, corrimiento=0.5))
    listos = (
        _abiertos(laboratorio)
        .exclude(trabajos__etapas__estado__in=[EtapaTrabajo.Estado.PENDIENTE, EtapaTrabajo.Estado.EN_CURSO])
        .annotate(ultimo_fin=Max('trabajos__etapas__fin'))
    )
    listos = list(listos)
    if listos:
        horas = [_horas(c.ultimo_fin, ahora) for c in listos if c.ultimo_fin]
        filas.append(
            {
                'nombre': 'Listos para entregar',
                'casos': len(listos),
                'horas': round(sum(horas) / len(horas), 1) if horas else None,
                'espera': False,
                '_orden': 10_000,
            }
        )
    filas.sort(key=lambda f: f['_orden'])
    for f in filas:
        del f['_orden']
    return filas


def _fila_de_etapa(nombre, g, *, espera, corrimiento=0):
    orden = sum(g['orden']) / len(g['orden']) + corrimiento
    horas = round(sum(g['horas']) / len(g['horas']), 1) if g['horas'] else None
    return {'nombre': nombre, 'casos': len(g['casos']), 'horas': horas, 'espera': espera, '_orden': orden}


def _roles(laboratorio):
    en_curso = EtapaTrabajo.objects.filter(
        trabajo__caso__laboratorio=laboratorio,
        trabajo__caso__estado=Caso.Estado.ABIERTO,
        estado=EtapaTrabajo.Estado.EN_CURSO,
    )
    cuentas = {
        r['rol']: r
        for r in en_curso.values('rol').annotate(
            en_fila=Count('id', filter=Q(iniciada_en__isnull=True)),
            en_mano=Count('id', filter=Q(iniciada_en__isnull=False)),
        )
    }
    miembros = list(Membresia.objects.filter(laboratorio=laboratorio, activa=True, tipo=Membresia.Tipo.EQUIPO))
    filas = []
    for rol in ROLES_DE_PRODUCCION:
        c = cuentas.get(rol.value, {})
        filas.append(
            {
                'rol': rol.value,
                'nombre': rol.label,
                'personas': sum(1 for m in miembros if rol.value in m.roles),
                'en_fila': c.get('en_fila', 0),
                'en_mano': c.get('en_mano', 0),
            }
        )
    return filas


def _gente(laboratorio):
    """Lo que cada persona tiene en la mano ahora (etapas que inició y no cerró)."""
    en_mano = dict(
        EtapaTrabajo.objects.filter(
            trabajo__caso__laboratorio=laboratorio,
            trabajo__caso__estado=Caso.Estado.ABIERTO,
            estado=EtapaTrabajo.Estado.EN_CURSO,
            iniciada_por__isnull=False,
        )
        .values_list('iniciada_por')
        .annotate(n=Count('id'))
    )
    miembros = (
        Membresia.objects.filter(laboratorio=laboratorio, activa=True, tipo=Membresia.Tipo.EQUIPO)
        .exclude(roles__contains=[Rol.ADMINISTRACION], roles__len=1)
        .select_related('usuario')
    )
    filas = [
        {'nombre': m.usuario.nombre_visible, 'roles': list(m.roles), 'en_mano': en_mano.get(m.pk, 0)} for m in miembros
    ]
    filas.sort(key=lambda f: (-f['en_mano'], f['nombre']))
    return filas


def _para_atender(atrasados, sin_leer, laboratorio, ahora):
    """Lo que Supervisión tiene que mirar ahora, por prioridad. Un mismo caso aparece una
    vez, con el motivo más fuerte, y los otros motivos en `motivos`."""
    filas = {}

    def sumar(caso_id, tipo, fila):
        if caso_id in filas:
            filas[caso_id]['motivos'].append(tipo)
        else:
            filas[caso_id] = {'tipo': tipo, 'motivos': [tipo], **fila}

    for f in atrasados['casos']:
        detalle = f'{f["item"]} {f["pieza"]}'.strip()
        detalle += f' en {f["etapa"]}' if f['etapa'] else ''
        detalle += f', {f["profesional"]}'
        sumar(f['caso'], 'atrasado', {'caso': f['caso'], 'codigo': f['codigo'], 'detalle': detalle, 'dias': f['dias']})
    for f in sin_leer['casos']:
        campos = ', '.join(sorted({c['campo'] for c in f['cambios']})) or 'la ficha'
        quienes = ', '.join(Rol(r).label for r in f['falta'])
        sumar(
            f['caso'],
            'sin_leer',
            {
                'caso': f['caso'],
                'codigo': f['codigo'],
                'detalle': f'Cambió {campos}, falta {quienes}',
                'horas': f['horas'],
            },
        )
    esperando = (
        _abiertos(laboratorio)
        .filter(en_espera=True, espera_desde__lte=ahora - timedelta(hours=HORAS_DE_ESPERA))
        .prefetch_related('trabajos__item__familia')
        .order_by('espera_desde')
    )
    for caso in esperando:
        ultimo = caso.revisiones_tecnicas.filter(decision='pedir').first()
        detalle = ultimo.mensaje[:140] if ultimo else 'Falta algo del odontólogo'
        sumar(
            caso.pk,
            'espera',
            {
                'caso': caso.pk,
                'codigo': caso.codigo,
                'detalle': detalle,
                'horas': int(_horas(caso.espera_desde, ahora)),
            },
        )
    problemas = Evento.objects.filter(
        laboratorio=laboratorio,
        accion='problema_reportado',
        cuando__gte=ahora - timedelta(days=DIAS_DE_UN_PROBLEMA),
    ).order_by('-cuando')
    abiertos = {str(c.pk): c for c in _abiertos(laboratorio).prefetch_related('trabajos__item__familia')}
    vistos = set()
    for evento in problemas:
        caso = abiertos.get(evento.objeto_id)
        if caso is None or caso.pk in vistos:
            continue
        vistos.add(caso.pk)
        sumar(
            caso.pk,
            'problema',
            {
                'caso': caso.pk,
                'codigo': caso.codigo,
                'detalle': (evento.despues or {}).get('texto', 'Problema en producción'),
                'horas': int(_horas(evento.cuando, ahora)),
            },
        )
    return list(filas.values())[:MAX_PARA_ATENDER]


def _piloto(laboratorio):
    """Lo que mide el piloto desde el arranque (docs/03 §14). Un dato que todavía no se puede
    medir es `None`, nunca cero: un cero se lee como "va perfecto"."""
    casos = Caso.objects.filter(laboratorio=laboratorio).exclude(estado=Caso.Estado.CANCELADO)
    carga = casos.aggregate(prom=Avg('segundos_carga'))['prom']
    entregados = list(casos.filter(estado=Caso.Estado.ENTREGADO, fecha_prometida__isnull=False))
    fechas = {}
    for e in Evento.objects.filter(
        laboratorio=laboratorio, accion='caso_entregado', objeto_id__in=[str(c.pk) for c in entregados]
    ).order_by('cuando'):
        fechas[e.objeto_id] = timezone.localtime(e.cuando).date()
    a_tiempo = 0
    for caso in entregados:
        entrega = fechas.get(str(caso.pk), timezone.localtime(caso.actualizado).date())
        if entrega <= caso.fecha_prometida:
            a_tiempo += 1
    return {
        'casos': casos.count(),
        'segundos_carga': round(carga) if carga is not None else None,
        'cambios_perdidos': None,
        'entregas_a_tiempo': {'a_tiempo': a_tiempo, 'entregados': len(entregados)},
    }


def tablero(laboratorio, periodo):
    ahora = timezone.now()
    hoy = timezone.localdate()
    atrasados = _atrasados(laboratorio, hoy)
    sin_leer = _cambios_sin_leer(laboratorio, ahora)
    para_atender = _para_atender(atrasados, sin_leer, laboratorio, ahora)
    for lista in (atrasados['casos'], sin_leer['casos']):
        for fila in lista:
            fila.pop('_caso', None)
    return {
        'periodo': periodo,
        'hoy': hoy,
        'capacidad': laboratorio.capacidad_diaria,
        'en_curso': _abiertos(laboratorio).count(),
        'entregas': _entregas(laboratorio, desde_del_periodo(periodo, hoy), hoy),
        'atrasados': atrasados,
        'cambios_sin_leer': sin_leer,
        'dias': _dias(laboratorio, hoy),
        'etapas': _etapas(laboratorio, ahora),
        'roles': _roles(laboratorio),
        'gente': _gente(laboratorio),
        'para_atender': para_atender,
        'piloto': _piloto(laboratorio),
    }
