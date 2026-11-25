"""
Vistas genéricas para los datos de un laboratorio: listar, crear, ver y modificar.

Todas filtran por el laboratorio de la sesión (LaboratorioScopedMixin), dejan leer a
cualquiera del equipo, piden `accion_escritura` para cambiar algo y registran el cambio
en la auditoría. Una vista nueva que herede de acá nace cerrada para escribir.
"""

from django.forms.models import model_to_dict
from rest_framework import generics, serializers
from rest_framework.permissions import SAFE_METHODS

from auditoria.servicios import registrar
from cuentas.permisos import LaboratorioScopedMixin, exigir


def _foto(objeto, campos):
    """Los valores que se guardan en la auditoría, en tipos que JSON entiende."""
    datos = model_to_dict(objeto, fields=campos)
    return {
        k: (
            [str(getattr(x, 'pk', x)) for x in v]  # relaciones muchos a muchos (con pk) o listas de textos
            if isinstance(v, list)
            else (str(v) if v is not None and not isinstance(v, (int, bool, str, float)) else v)
        )
        for k, v in datos.items()
    }


# Limita las relaciones (por ejemplo, los clientes de un profesional) al laboratorio de la
# sesión: no se puede colgar algo de un objeto ajeno mandando su id. (Comentario y no
# docstring: el docstring se copiaría como descripción de cada esquema de la API.)
class SerializerDeLaboratorio(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        laboratorio = self.context.get('laboratorio')
        if laboratorio is None:
            return
        for campo in self.fields.values():
            relacion = getattr(campo, 'child_relation', campo)
            if isinstance(relacion, serializers.PrimaryKeyRelatedField) and relacion.queryset is not None:
                relacion.queryset = relacion.queryset.filter(laboratorio=laboratorio)


class _BaseDeLaboratorio(LaboratorioScopedMixin):
    modelo = None
    accion_escritura = None
    #: Campos que se guardan en la auditoría (antes y después).
    campos_auditados: list[str] = []

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        membresia = self.get_membresia(request)
        if request.method not in SAFE_METHODS:
            exigir(membresia, self.accion_escritura)

    def get_queryset(self):
        return self.scoped_queryset(self.request, self.modelo)

    def get_serializer_context(self):
        contexto = super().get_serializer_context()
        if getattr(self.request, 'membresia', None) is not None:
            contexto['laboratorio'] = self.request.membresia.laboratorio
        return contexto

    def _accion(self, verbo):
        return f'{self.modelo._meta.model_name}_{verbo}'


class ListaDeLaboratorio(_BaseDeLaboratorio, generics.ListCreateAPIView):
    def perform_create(self, serializer):
        objeto = serializer.save(laboratorio=self.get_laboratorio(self.request))
        registrar(self.request, self._accion('creado'), objeto, despues=_foto(objeto, self.campos_auditados))


class DetalleDeLaboratorio(_BaseDeLaboratorio, generics.RetrieveUpdateAPIView):
    http_method_names = ['get', 'patch', 'options', 'head']

    def perform_update(self, serializer):
        antes = _foto(serializer.instance, self.campos_auditados)
        objeto = serializer.save()
        despues = _foto(objeto, self.campos_auditados)
        cambios = {k: v for k, v in despues.items() if antes.get(k) != v}
        if cambios:
            registrar(
                self.request,
                self._accion('cambiado'),
                objeto,
                antes={k: antes.get(k) for k in cambios},
                despues=cambios,
            )
