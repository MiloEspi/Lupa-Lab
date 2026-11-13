from django.core.exceptions import ValidationError as ErrorDjango
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers

from comun.vistas import DetalleDeLaboratorio, ListaDeLaboratorio, SerializerDeLaboratorio
from cuentas.permisos import Accion

from .models import Cliente, Profesional
from .validadores import normalizar_cuit, validar_cuit


class ClienteSerializer(SerializerDeLaboratorio):
    # Más largo que el campo: llega con guiones o espacios y se guarda solo con números.
    cuit = serializers.CharField(max_length=20, required=False, allow_blank=True)

    class Meta:
        model = Cliente
        fields = ['id', 'razon_social', 'cuit', 'telefono', 'whatsapp', 'email', 'direccion', 'notas', 'activo']

    def validate_cuit(self, valor):
        cuit = normalizar_cuit(valor)
        try:
            validar_cuit(cuit)
        except ErrorDjango as e:
            raise serializers.ValidationError(e.messages[0]) from e
        laboratorio = self.context['laboratorio']
        repetido = Cliente.objects.filter(laboratorio=laboratorio, cuit=cuit).exclude(
            pk=getattr(self.instance, 'pk', None)
        )
        if cuit and repetido.exists():
            raise serializers.ValidationError(f'Ese CUIT ya es de {repetido.first().razon_social}.')
        return cuit


class ClienteResumenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ['id', 'razon_social']


class ProfesionalSerializer(SerializerDeLaboratorio):
    clientes = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.all(), many=True, required=False)
    clientes_detalle = ClienteResumenSerializer(source='clientes', many=True, read_only=True)
    nombre_completo = serializers.CharField(read_only=True)

    class Meta:
        model = Profesional
        fields = [
            'id',
            'nombre',
            'apellido',
            'nombre_completo',
            'matricula',
            'telefono',
            'whatsapp',
            'email',
            'clientes',
            'clientes_detalle',
            'notas',
            'activo',
        ]


_Q = OpenApiParameter('q', str, required=False, description='Busca sin importar tildes ni mayúsculas')
_ACTIVOS = OpenApiParameter('activos', bool, required=False, description='Por defecto solo los activos')


def buscar(queryset, request, campos):
    """Busca cada palabra en alguno de los campos: "gomez juli" encuentra a Julián Gómez."""
    if request.query_params.get('activos', 'true').lower() != 'false':
        queryset = queryset.filter(activo=True)
    texto = request.query_params.get('q', '').strip()
    for palabra in texto.split()[:5]:
        condicion = Q()
        for campo in campos:
            condicion |= Q(**{f'{campo}__unaccent__icontains': palabra})
        queryset = queryset.filter(condicion)
    return queryset


@extend_schema_view(get=extend_schema(parameters=[_Q, _ACTIVOS]))
class ClientesView(ListaDeLaboratorio):
    modelo = Cliente
    serializer_class = ClienteSerializer
    accion_escritura = Accion.GESTIONAR_CLIENTES
    campos_auditados = ['razon_social', 'cuit', 'telefono', 'whatsapp', 'email', 'activo']

    def get_queryset(self):
        return buscar(super().get_queryset(), self.request, ['razon_social', 'cuit', 'email'])[:100]


class ClienteView(DetalleDeLaboratorio):
    modelo = Cliente
    serializer_class = ClienteSerializer
    accion_escritura = Accion.GESTIONAR_CLIENTES
    campos_auditados = ClientesView.campos_auditados


@extend_schema_view(
    get=extend_schema(parameters=[_Q, _ACTIVOS, OpenApiParameter('cliente', str, required=False)]),
)
class ProfesionalesView(ListaDeLaboratorio):
    modelo = Profesional
    serializer_class = ProfesionalSerializer
    accion_escritura = Accion.GESTIONAR_CLIENTES
    campos_auditados = ['nombre', 'apellido', 'matricula', 'telefono', 'whatsapp', 'email', 'clientes', 'activo']

    def get_queryset(self):
        queryset = super().get_queryset().prefetch_related('clientes')
        if self.request.query_params.get('cliente'):
            queryset = queryset.filter(clientes=self.request.query_params['cliente'])
        return buscar(queryset, self.request, ['nombre', 'apellido', 'matricula', 'email'])[:100]


class ProfesionalView(DetalleDeLaboratorio):
    modelo = Profesional
    serializer_class = ProfesionalSerializer
    accion_escritura = Accion.GESTIONAR_CLIENTES
    campos_auditados = ProfesionalesView.campos_auditados

    def get_queryset(self):
        return super().get_queryset().prefetch_related('clientes')
