"""Vistas por rol (S14): solo lectura. Las reglas viven en `tablero.py`."""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from cuentas.models import Rol
from cuentas.permisos import Accion, LaboratorioScopedMixin, exigir

from . import tablero

PERIODOS = ['hoy', 'semana', 'mes']


class CajaSerializer(serializers.Serializer):
    caso = serializers.UUIDField()
    trabajo = serializers.UUIDField()
    codigo = serializers.CharField()
    numero = serializers.IntegerField()
    item = serializers.CharField()
    material = serializers.CharField(allow_blank=True)
    pieza = serializers.CharField(allow_blank=True)
    etapa = serializers.CharField()
    iniciada = serializers.BooleanField()
    fecha_prometida = serializers.DateField(allow_null=True)
    atrasado = serializers.BooleanField()
    #: Lo que frena la caja: un cambio sin leer, una pausa o la espera del odontólogo.
    bloqueo = serializers.ChoiceField(choices=['cambio', 'pausa', 'espera'], allow_null=True)


class MisCajasSerializer(serializers.Serializer):
    cajas = CajaSerializer(many=True)


class MisCajasView(LaboratorioScopedMixin, APIView):
    @extend_schema(responses=MisCajasSerializer)
    def get(self, request):
        cajas = tablero.mis_cajas(self.get_membresia(request))
        return Response({'cajas': CajaSerializer(cajas, many=True).data})


class FilaDeCasoSerializer(serializers.Serializer):
    caso = serializers.UUIDField()
    codigo = serializers.CharField()
    etapa = serializers.CharField(allow_null=True)
    item = serializers.CharField()
    pieza = serializers.CharField(allow_blank=True)
    profesional = serializers.CharField()


class AtrasadoSerializer(FilaDeCasoSerializer):
    dias = serializers.IntegerField()


class AtrasadosSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    en_produccion = serializers.IntegerField()
    en_espera = serializers.IntegerField()
    pausados = serializers.IntegerField()
    casos = AtrasadoSerializer(many=True)


class CambioSinLeerSerializer(FilaDeCasoSerializer):
    falta = serializers.ListField(child=serializers.ChoiceField(choices=Rol.choices))
    horas = serializers.IntegerField()
    cambios = serializers.ListField(child=serializers.JSONField())


class CambiosSinLeerSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    casos = CambioSinLeerSerializer(many=True)


class EntregasSerializer(serializers.Serializer):
    prometidos = serializers.IntegerField()
    entregados = serializers.IntegerField()


class DiaSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    trabajos = serializers.IntegerField()
    entregados = serializers.IntegerField()
    hoy = serializers.BooleanField()
    futuro = serializers.BooleanField()
    habil = serializers.BooleanField()


class EtapaDelTableroSerializer(serializers.Serializer):
    nombre = serializers.CharField()
    casos = serializers.IntegerField()
    #: Demora promedio en la etapa, en horas. Vacío si no hay con qué calcularla.
    horas = serializers.FloatField(allow_null=True)
    #: "Esperando odontólogo": no es una etapa de la ruta, es una marca del caso.
    espera = serializers.BooleanField()


class RolDelTableroSerializer(serializers.Serializer):
    rol = serializers.CharField()
    nombre = serializers.CharField()
    personas = serializers.IntegerField()
    en_fila = serializers.IntegerField()
    en_mano = serializers.IntegerField()


class PersonaDelTableroSerializer(serializers.Serializer):
    nombre = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    en_mano = serializers.IntegerField()


class ParaAtenderSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=['atrasado', 'sin_leer', 'espera', 'problema'])
    motivos = serializers.ListField(child=serializers.CharField())
    caso = serializers.UUIDField()
    codigo = serializers.CharField()
    detalle = serializers.CharField()
    dias = serializers.IntegerField(required=False)
    horas = serializers.IntegerField(required=False)


class EntregasATiempoSerializer(serializers.Serializer):
    a_tiempo = serializers.IntegerField()
    entregados = serializers.IntegerField()


class PilotoSerializer(serializers.Serializer):
    casos = serializers.IntegerField()
    segundos_carga = serializers.IntegerField(allow_null=True)
    cambios_perdidos = serializers.IntegerField(allow_null=True)
    entregas_a_tiempo = EntregasATiempoSerializer()


class TableroSerializer(serializers.Serializer):
    periodo = serializers.ChoiceField(choices=PERIODOS)
    hoy = serializers.DateField()
    capacidad = serializers.IntegerField()
    en_curso = serializers.IntegerField()
    entregas = EntregasSerializer()
    atrasados = AtrasadosSerializer()
    cambios_sin_leer = CambiosSinLeerSerializer()
    dias = DiaSerializer(many=True)
    etapas = EtapaDelTableroSerializer(many=True)
    roles = RolDelTableroSerializer(many=True)
    gente = PersonaDelTableroSerializer(many=True)
    para_atender = ParaAtenderSerializer(many=True)
    piloto = PilotoSerializer()


class TableroView(LaboratorioScopedMixin, APIView):
    @extend_schema(
        parameters=[OpenApiParameter('periodo', str, required=False, enum=PERIODOS)],
        responses=TableroSerializer,
    )
    def get(self, request):
        membresia = self.get_membresia(request)
        exigir(membresia, Accion.VER_TABLERO, 'El tablero es de Supervisión.')
        periodo = serializers.ChoiceField(choices=PERIODOS).run_validation(request.query_params.get('periodo', 'hoy'))
        return Response(TableroSerializer(tablero.tablero(membresia.laboratorio, periodo)).data)
