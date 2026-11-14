from casos.models import EtapaTrabajo

from .models import Mensaje


def etapa_del_caso(caso):
    """La etapa en curso del primer trabajo, con su posición. Si terminó todas, la última."""
    trabajo = caso.trabajos.first()
    if trabajo is None:
        return '', None
    etapas = list(trabajo.etapas.all())
    actual = next((e for e in etapas if e.estado == EtapaTrabajo.Estado.EN_CURSO), etapas[-1] if etapas else None)
    return (actual.nombre, actual.orden - 1) if actual else ('', None)


def mensaje_de_sistema(caso, texto, **extra):
    nombre, orden = etapa_del_caso(caso)
    return Mensaje.objects.create(
        caso=caso, tipo=Mensaje.Tipo.SISTEMA, texto=texto, etapa=nombre, etapa_orden=orden, **extra
    )
