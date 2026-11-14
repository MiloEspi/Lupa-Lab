from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from archivos.models import Archivo
from auditoria.servicios import registrar
from casos.models import Caso
from cuentas.permisos import Accion, LaboratorioScopedMixin, exigir

from .models import Mensaje
from .servicios import etapa_del_caso


class AdjuntoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Archivo
        fields = ['id', 'nombre', 'tipo', 'categoria']
        read_only_fields = fields


class RespuestaSerializer(serializers.ModelSerializer):
    autor = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()
    adjuntos = AdjuntoSerializer(many=True, read_only=True)

    class Meta:
        model = Mensaje
        fields = [
            'id',
            'tipo',
            'texto',
            'nota',
            'version_ficha',
            'etapa',
            'etapa_orden',
            'autor',
            'rol',
            'adjuntos',
            'creado',
        ]
        read_only_fields = fields

    def get_autor(self, m) -> str:
        return m.autor.usuario.nombre_visible if m.autor else 'Lupa Lab'

    def get_rol(self, m) -> str:
        from cuentas.models import Rol

        if not m.autor:
            return 'Sistema'
        return ' · '.join(Rol(r).label for r in m.autor.roles) or 'Equipo'


class MensajeSerializer(RespuestaSerializer):
    respuestas = RespuestaSerializer(many=True, read_only=True)

    class Meta(RespuestaSerializer.Meta):
        fields = [*RespuestaSerializer.Meta.fields, 'respuestas']
        read_only_fields = fields


class MensajeNuevoSerializer(serializers.Serializer):
    texto = serializers.CharField(allow_blank=True, default='')
    tipo = serializers.ChoiceField(choices=[Mensaje.Tipo.EQUIPO, Mensaje.Tipo.ODONTOLOGO], default=Mensaje.Tipo.EQUIPO)
    nota = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    respuesta_a = serializers.UUIDField(required=False, allow_null=True, default=None)
    #: Comentar en una etapa que ya pasó (desde el recorrido). Si no viene, la actual.
    etapa_orden = serializers.IntegerField(required=False, allow_null=True, default=None, min_value=0)
    adjuntos = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class MensajesView(LaboratorioScopedMixin, APIView):
    @extend_schema(responses=MensajeSerializer(many=True))
    def get(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        relacionados = ['autor__usuario', 'adjuntos']
        mensajes = (
            caso.mensajes.filter(respuesta_a__isnull=True)
            .prefetch_related(
                *relacionados, Prefetch('respuestas', queryset=Mensaje.objects.prefetch_related(*relacionados))
            )
            .order_by('-creado')
        )
        return Response(MensajeSerializer(mensajes, many=True).data)

    @extend_schema(request=MensajeNuevoSerializer, responses={201: MensajeSerializer})
    def post(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        exigir(self.get_membresia(request), Accion.COMENTAR, 'Tu rol no puede escribir en el caso.')
        datos = MensajeNuevoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        d = datos.validated_data
        adjuntos = list(caso.archivos.filter(pk__in=d['adjuntos'], estado=Archivo.Estado.LISTO))
        if len(adjuntos) != len(set(d['adjuntos'])):
            raise ValidationError({'adjuntos': ['Algún archivo no es de este caso.']})
        if not d['texto'].strip() and not adjuntos:
            raise ValidationError({'texto': ['Escribí algo o agregá una foto.']})
        padre = None
        if d['respuesta_a']:
            padre = get_object_or_404(caso.mensajes, pk=d['respuesta_a'], respuesta_a__isnull=True)
        nombre, orden = etapa_del_caso(caso)
        if padre is not None:
            nombre, orden = padre.etapa, padre.etapa_orden
        elif d['etapa_orden'] is not None:
            trabajo = caso.trabajos.first()
            etapa = trabajo.etapas.filter(orden=d['etapa_orden'] + 1).first() if trabajo else None
            if etapa is None:
                raise ValidationError({'etapa_orden': ['Esa etapa no existe en este caso.']})
            nombre, orden = etapa.nombre, d['etapa_orden']
        mensaje = Mensaje.objects.create(
            caso=caso,
            autor=request.membresia,
            tipo=d['tipo'],
            texto=d['texto'].strip(),
            nota=d['nota'],
            respuesta_a=padre,
            etapa=nombre,
            etapa_orden=orden,
        )
        mensaje.adjuntos.set(adjuntos)
        registrar(request, 'mensaje', caso, despues={'tipo': mensaje.tipo, 'respuesta': padre is not None})
        return Response(MensajeSerializer(mensaje).data, status=status.HTTP_201_CREATED)
