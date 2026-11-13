from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from cuentas.permisos import Accion, LaboratorioScopedMixin, exigir

from .models import Evento


class EventoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evento
        fields = ['id', 'cuando', 'nombre_usuario', 'accion', 'objeto_tipo', 'objeto_id', 'antes', 'despues']


class EventosView(LaboratorioScopedMixin, APIView):
    """Los últimos movimientos del laboratorio. Solo Administración y Supervisión."""

    LIMITE = 200

    @extend_schema(
        parameters=[OpenApiParameter('objeto_id', str, required=False, description='Solo lo de un objeto')],
        responses=EventoSerializer(many=True),
    )
    def get(self, request):
        exigir(self.get_membresia(request), Accion.VER_AUDITORIA)
        eventos = self.scoped_queryset(request, Evento)
        if request.query_params.get('objeto_id'):
            eventos = eventos.filter(objeto_id=request.query_params['objeto_id'])
        return Response(EventoSerializer(eventos[: self.LIMITE], many=True).data)
