from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import serializers, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from catalogo.models import ItemCatalogo
from cuentas.permisos import LaboratorioScopedMixin
from directorio.models import Cliente, Profesional

from . import servicios
from .models import Caso, EtapaTrabajo, Trabajo
from .validadores import normalizar_color, validar_piezas

# --- Lectura -----------------------------------------------------------------------------


class EtapaSerializer(serializers.ModelSerializer):
    hecha_por = serializers.CharField(source='hecha_por.usuario.nombre_visible', default=None, read_only=True)

    class Meta:
        model = EtapaTrabajo
        fields = ['orden', 'nombre', 'rol', 'en_consultorio', 'estado', 'inicio', 'fin', 'hecha_por']
        read_only_fields = fields


class EtapaActualSerializer(serializers.Serializer):
    orden = serializers.IntegerField()
    nombre = serializers.CharField()
    rol = serializers.CharField()
    total = serializers.IntegerField()


class PersonaResumen(serializers.Serializer):
    id = serializers.UUIDField()
    nombre = serializers.CharField()


class TrabajoSerializer(serializers.ModelSerializer):
    item_nombre = serializers.CharField(source='item.nombre', read_only=True)
    codigo_item = serializers.CharField(source='item.codigo', read_only=True)
    familia = serializers.CharField(source='item.familia.nombre', read_only=True)
    color_familia = serializers.CharField(source='item.familia.color', read_only=True)
    etapa_actual = serializers.SerializerMethodField()
    terminado = serializers.BooleanField(read_only=True)
    etapas = EtapaSerializer(many=True, read_only=True)

    class Meta:
        model = Trabajo
        fields = [
            'id',
            'orden',
            'item',
            'item_nombre',
            'codigo_item',
            'familia',
            'color_familia',
            'piezas',
            'material',
            'color',
            'soporte',
            'implante_marca',
            'implante_diametro',
            'implante_conexion',
            'observaciones',
            'etapa_actual',
            'terminado',
            'etapas',
        ]
        read_only_fields = fields

    @extend_schema_field(EtapaActualSerializer(allow_null=True))
    def get_etapa_actual(self, trabajo):
        etapa = trabajo.etapa_actual
        if etapa is None:
            return None
        return {'orden': etapa.orden, 'nombre': etapa.nombre, 'rol': etapa.rol, 'total': len(trabajo.etapas.all())}


class CasoSerializer(serializers.ModelSerializer):
    codigo = serializers.CharField(read_only=True)
    cliente = serializers.SerializerMethodField()
    profesional = serializers.SerializerMethodField()
    trabajos = TrabajoSerializer(many=True, read_only=True)

    class Meta:
        model = Caso
        fields = [
            'id',
            'numero',
            'codigo',
            'cliente',
            'profesional',
            'paciente',
            'fecha_ingreso',
            'fecha_prometida',
            'estado',
            'observaciones',
            'motivo_cancelacion',
            'creado',
            'trabajos',
        ]
        read_only_fields = fields

    @extend_schema_field(PersonaResumen)
    def get_cliente(self, caso):
        return {'id': caso.cliente_id, 'nombre': caso.cliente.razon_social}

    @extend_schema_field(PersonaResumen)
    def get_profesional(self, caso):
        return {'id': caso.profesional_id, 'nombre': caso.profesional.nombre_completo}


# --- Alta --------------------------------------------------------------------------------


class TrabajoNuevoSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=ItemCatalogo.objects.all())
    piezas = serializers.JSONField(required=False, default=dict)
    material = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    color = serializers.CharField(max_length=10, required=False, allow_blank=True, default='')
    soporte = serializers.ChoiceField(choices=Trabajo.Soporte.choices, required=False, default='')
    implante_marca = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    implante_diametro = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    implante_conexion = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
    observaciones = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_item(self, item):
        # Va acá y no en __init__: dentro de una lista (many=True) el hijo se crea sin contexto.
        if item.laboratorio_id != self.context['laboratorio'].id or not item.activo:
            raise serializers.ValidationError('Ese trabajo no está en el catálogo.')
        return item

    def validate_piezas(self, valor):
        return validar_piezas(valor)

    def validate_color(self, valor):
        return normalizar_color(valor)

    def validate(self, datos):
        item = datos['item']
        if datos['material'] and item.materiales and datos['material'] not in item.materiales:
            raise serializers.ValidationError(
                {'material': [f'{item.nombre} se hace en: {", ".join(item.materiales)}.']},
            )
        if datos['soporte'] == Trabajo.Soporte.IMPLANTE and not datos['implante_marca']:
            raise serializers.ValidationError({'implante_marca': ['Sobre implante hace falta la marca.']})
        return datos


class CasoNuevoSerializer(serializers.Serializer):
    cliente = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.all())
    profesional = serializers.PrimaryKeyRelatedField(queryset=Profesional.objects.all())
    paciente = serializers.CharField(
        max_length=12, required=False, allow_blank=True, default='', help_text='Solo iniciales: son datos de salud.'
    )
    fecha_prometida = serializers.DateField(required=False, allow_null=True, default=None)
    observaciones = serializers.CharField(required=False, allow_blank=True, default='')
    trabajos = TrabajoNuevoSerializer(many=True, allow_empty=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        laboratorio = self.context.get('laboratorio')
        if laboratorio is not None:
            self.fields['cliente'].queryset = Cliente.objects.filter(laboratorio=laboratorio, activo=True)
            self.fields['profesional'].queryset = Profesional.objects.filter(laboratorio=laboratorio, activo=True)

    def validate_paciente(self, valor):
        return valor.strip().upper()

    def validate(self, datos):
        fecha = datos.get('fecha_prometida')
        if fecha is not None and fecha < timezone.localdate():
            raise serializers.ValidationError({'fecha_prometida': ['La fecha prometida ya pasó.']})
        return datos


class CancelarSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=200)


# --- Vistas ------------------------------------------------------------------------------


def _con_todo(queryset):
    return queryset.select_related('cliente', 'profesional').prefetch_related(
        Prefetch(
            'trabajos',
            queryset=Trabajo.objects.select_related('item__familia').prefetch_related(
                Prefetch('etapas', queryset=EtapaTrabajo.objects.select_related('hecha_por__usuario')),
            ),
        ),
    )


class Paginado(LimitOffsetPagination):
    default_limit = 50
    max_limit = 200


class CasosView(LaboratorioScopedMixin, APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter('q', str, required=False, description='Número, paciente, cliente o profesional'),
            OpenApiParameter('estado', str, required=False, enum=list(Caso.Estado.values)),
            OpenApiParameter('cliente', str, required=False),
            OpenApiParameter('limit', int, required=False),
            OpenApiParameter('offset', int, required=False),
        ],
        responses=CasoSerializer(many=True),
    )
    def get(self, request):
        casos = self.scoped_queryset(request, Caso)
        p = request.query_params
        if p.get('estado'):
            casos = casos.filter(estado=p['estado'])
        if p.get('cliente'):
            casos = casos.filter(cliente_id=p['cliente'])
        for palabra in p.get('q', '').split()[:5]:
            condicion = (
                Q(paciente__icontains=palabra)
                | Q(cliente__razon_social__unaccent__icontains=palabra)
                | Q(profesional__apellido__unaccent__icontains=palabra)
                | Q(profesional__nombre__unaccent__icontains=palabra)
            )
            # "C-0412", "0412" o "412" buscan el número.
            digitos = ''.join(c for c in palabra if c.isdigit())
            if digitos:
                condicion |= Q(numero=int(digitos))
            casos = casos.filter(condicion)
        paginado = Paginado()
        pagina = paginado.paginate_queryset(_con_todo(casos), request, view=self)
        return paginado.get_paginated_response(CasoSerializer(pagina, many=True).data)

    @extend_schema(request=CasoNuevoSerializer, responses={201: CasoSerializer})
    def post(self, request):
        datos = CasoNuevoSerializer(data=request.data, context={'laboratorio': self.get_laboratorio(request)})
        datos.is_valid(raise_exception=True)
        caso = servicios.crear_caso(request, **datos.validated_data)
        caso = _con_todo(Caso.objects.filter(pk=caso.pk)).get()
        return Response(CasoSerializer(caso).data, status=status.HTTP_201_CREATED)


class CasoView(LaboratorioScopedMixin, APIView):
    @extend_schema(responses=CasoSerializer)
    def get(self, request, pk):
        caso = get_caso(self, request, pk)
        return Response(CasoSerializer(caso).data)


def get_caso(vista, request, pk):
    return get_object_or_404(_con_todo(vista.scoped_queryset(request, Caso)), pk=pk)


class AvanzarView(LaboratorioScopedMixin, APIView):
    @extend_schema(request=None, responses=CasoSerializer)
    def post(self, request, pk, trabajo):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        servicios.avanzar(request, self._trabajo(caso, trabajo))
        return Response(CasoSerializer(get_caso(self, request, pk)).data)

    def _trabajo(self, caso, trabajo_id):
        return get_object_or_404(caso.trabajos, pk=trabajo_id)


class EntregarView(LaboratorioScopedMixin, APIView):
    @extend_schema(request=None, responses=CasoSerializer)
    def post(self, request, pk):
        servicios.entregar(request, self.get_scoped_object(request, Caso, pk=pk))
        return Response(CasoSerializer(get_caso(self, request, pk)).data)


class CancelarView(LaboratorioScopedMixin, APIView):
    @extend_schema(request=CancelarSerializer, responses=CasoSerializer)
    def post(self, request, pk):
        datos = CancelarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        servicios.cancelar(request, self.get_scoped_object(request, Caso, pk=pk), datos.validated_data['motivo'])
        return Response(CasoSerializer(get_caso(self, request, pk)).data)
