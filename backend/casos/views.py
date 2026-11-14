from django.db.models import Count, Prefetch, Q
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
from .models import CAMPOS_DE_FICHA, Caso, EtapaTrabajo, RevisionFicha, RevisionTecnica, Trabajo
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


class DiferenciaSerializer(serializers.Serializer):
    trabajo = serializers.UUIDField()
    campo = serializers.CharField()
    antes = serializers.JSONField()
    despues = serializers.JSONField()


class CambioPendienteSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    motivo = serializers.CharField()
    cambios = DiferenciaSerializer(many=True)
    #: Roles que pueden confirmarlo (los de la etapa actual de lo que cambió).
    confirma = serializers.ListField(child=serializers.CharField())
    registrado_por = serializers.CharField()
    creado = serializers.DateTimeField()


class FichaSerializer(serializers.ModelSerializer):
    creada_por = serializers.CharField(source='creada_por.nombre_visible', read_only=True)
    confirmada_por = serializers.SerializerMethodField()

    class Meta:
        model = RevisionFicha
        fields = ['version', 'trabajos', 'cambios', 'motivo', 'creada_por', 'creado', 'confirmada_por']
        read_only_fields = fields

    def get_confirmada_por(self, revision) -> list[str]:
        return [c.membresia.usuario.nombre_visible for c in revision.confirmaciones.all()]


class CasoSerializer(serializers.ModelSerializer):
    codigo = serializers.CharField(read_only=True)
    cliente = serializers.SerializerMethodField()
    profesional = serializers.SerializerMethodField()
    trabajos = TrabajoSerializer(many=True, read_only=True)
    cambio_pendiente = serializers.SerializerMethodField()

    @extend_schema_field(CambioPendienteSerializer(allow_null=True))
    def get_cambio_pendiente(self, caso):
        revision = caso.cambio_pendiente
        if revision is None:
            return None
        return {
            'version': revision.version,
            'motivo': revision.motivo,
            'cambios': revision.cambios,
            'confirma': servicios.roles_que_confirman(revision),
            'registrado_por': revision.creada_por.nombre_visible,
            'creado': revision.creado,
        }

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
            'version_ficha',
            'cambio_pendiente',
            'en_espera',
            'espera_desde',
            'orden_origen',
            'orden_numero',
            'orden_fecha',
            'orden_firmada',
            'llega_impresion',
            'segundos_carga',
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
    orden_origen = serializers.ChoiceField(choices=Caso.OrigenOrden.choices, required=False, default='')
    orden_numero = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    orden_fecha = serializers.DateField(required=False, allow_null=True, default=None)
    orden_firmada = serializers.BooleanField(required=False, default=False)
    llega_impresion = serializers.BooleanField(required=False, default=False)
    segundos_carga = serializers.IntegerField(required=False, allow_null=True, default=None, min_value=0)
    pasar_a_revision = serializers.BooleanField(required=False, default=False)

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
    return queryset.select_related('cliente', 'profesional', 'cambio_pendiente__creada_por').prefetch_related(
        Prefetch(
            'trabajos',
            queryset=Trabajo.objects.select_related('item__familia').prefetch_related(
                Prefetch('etapas', queryset=EtapaTrabajo.objects.select_related('hecha_por__usuario')),
            ),
        ),
    )


class CasosPaginadosSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.CharField(allow_null=True)
    previous = serializers.CharField(allow_null=True)
    results = CasoSerializer(many=True)


class Paginado(LimitOffsetPagination):
    default_limit = 50
    # Los casos abiertos de un laboratorio grande (~350) entran en una sola página.
    max_limit = 500


class CasosView(LaboratorioScopedMixin, APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter('q', str, required=False, description='Número, paciente, cliente o profesional'),
            OpenApiParameter('estado', str, required=False, enum=list(Caso.Estado.values)),
            OpenApiParameter('cliente', str, required=False),
            OpenApiParameter('profesional', str, required=False),
            OpenApiParameter('limit', int, required=False),
            OpenApiParameter('offset', int, required=False),
        ],
        responses=CasosPaginadosSerializer,
    )
    def get(self, request):
        casos = self.scoped_queryset(request, Caso)
        p = request.query_params
        if p.get('estado'):
            casos = casos.filter(estado=p['estado'])
        if p.get('cliente'):
            casos = casos.filter(cliente_id=p['cliente'])
        if p.get('profesional'):
            casos = casos.filter(profesional_id=p['profesional'])
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


# --- Cambios de ficha (S7) -----------------------------------------------------------------


class CambioSerializer(serializers.Serializer):
    trabajo = serializers.UUIDField()
    motivo = serializers.CharField(max_length=300, allow_blank=True)
    cambios = serializers.DictField(help_text=f'Campos que cambian: {", ".join(CAMPOS_DE_FICHA)}')


class ConfirmarSerializer(serializers.Serializer):
    rehacer = serializers.BooleanField(default=False)
    trabajo = serializers.UUIDField(required=False, allow_null=True, default=None)
    volver_a = serializers.IntegerField(required=False, allow_null=True, default=None, help_text='Orden de la etapa')
    comentario = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')


def _validar_cambios(trabajo, cambios, laboratorio):
    """El cambio pasa por las mismas reglas fijas que el alta: se arma el trabajo como
    quedaría y se valida entero (así "material" se controla contra el catálogo)."""
    desconocidos = sorted(set(cambios) - set(CAMPOS_DE_FICHA))
    if desconocidos:
        raise serializers.ValidationError({'cambios': [f'No se puede cambiar: {", ".join(desconocidos)}.']})
    actual = {c: getattr(trabajo, c) for c in CAMPOS_DE_FICHA}
    datos = TrabajoNuevoSerializer(
        data={**actual, **cambios, 'item': trabajo.item_id}, context={'laboratorio': laboratorio}
    )
    if not datos.is_valid():
        raise serializers.ValidationError(datos.errors)
    return {c: datos.validated_data[c] for c in cambios}


class CambiosView(LaboratorioScopedMixin, APIView):
    @extend_schema(request=CambioSerializer, responses={201: CasoSerializer})
    def post(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        datos = CambioSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        trabajo = get_object_or_404(caso.trabajos.select_related('item'), pk=datos.validated_data['trabajo'])
        cambios = _validar_cambios(trabajo, datos.validated_data['cambios'], self.get_laboratorio(request))
        servicios.registrar_cambio(request, caso, trabajo, cambios, datos.validated_data['motivo'])
        return Response(CasoSerializer(get_caso(self, request, pk)).data, status=status.HTTP_201_CREATED)


class ConfirmarCambioView(LaboratorioScopedMixin, APIView):
    @extend_schema(request=ConfirmarSerializer, responses=CasoSerializer)
    def post(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        datos = ConfirmarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        servicios.confirmar_cambio(request, caso, **datos.validated_data)
        return Response(CasoSerializer(get_caso(self, request, pk)).data)


class FichasView(LaboratorioScopedMixin, APIView):
    """El historial de versiones de la ficha, la más nueva primero."""

    @extend_schema(responses=FichaSerializer(many=True))
    def get(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        fichas = caso.fichas.select_related('creada_por').prefetch_related('confirmaciones__membresia__usuario')
        return Response(FichaSerializer(fichas, many=True).data)


# --- Carga por día (fecha prometida contra la capacidad) -----------------------------------


class CargaDiaSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    casos = serializers.IntegerField()


class CargaView(LaboratorioScopedMixin, APIView):
    """Cuántos casos abiertos vencen cada día, para sugerir la fecha prometida."""

    @extend_schema(
        parameters=[OpenApiParameter('desde', str), OpenApiParameter('hasta', str)],
        responses=CargaDiaSerializer(many=True),
    )
    def get(self, request):
        desde = serializers.DateField().to_internal_value(request.query_params.get('desde', ''))
        hasta = serializers.DateField().to_internal_value(request.query_params.get('hasta', ''))
        if (hasta - desde).days > 62:
            raise serializers.ValidationError({'hasta': ['Hasta dos meses por pedido.']})
        filas = (
            self.scoped_queryset(request, Caso)
            .filter(estado=Caso.Estado.ABIERTO, fecha_prometida__range=(desde, hasta))
            .values('fecha_prometida')
            .annotate(casos=Count('id'))
            .order_by('fecha_prometida')
        )
        return Response([{'fecha': f['fecha_prometida'], 'casos': f['casos']} for f in filas])


# --- Revisión técnica (S12) -----------------------------------------------------------------


class ItemRevisadoSerializer(serializers.Serializer):
    texto = serializers.CharField()
    marca = serializers.ChoiceField(choices=RevisionTecnica.Marca.choices)


class RevisionTecnicaSerializer(serializers.ModelSerializer):
    items = ItemRevisadoSerializer(many=True, read_only=True)
    por = serializers.CharField(source='por.usuario.nombre_visible', read_only=True)

    class Meta:
        model = RevisionTecnica
        fields = ['id', 'items', 'decision', 'mensaje', 'por', 'creado']
        read_only_fields = fields


class EstadoRevisionSerializer(serializers.Serializer):
    #: Si hay algún trabajo en Revisión técnica ahora: si no, solo se ve el historial.
    en_revision = serializers.BooleanField()
    en_espera = serializers.BooleanField()
    #: Los puntos a revisar, de la plantilla de cada trabajo (sin repetir).
    checklist = serializers.ListField(child=serializers.CharField())
    #: Para el enlace wa.me: el WhatsApp del odontólogo, o su teléfono si no cargaron otro.
    whatsapp = serializers.CharField()
    matricula = serializers.CharField()
    email = serializers.CharField()
    revisiones = RevisionTecnicaSerializer(many=True)


class RevisarSerializer(serializers.Serializer):
    marcas = serializers.ListField(child=serializers.CharField(allow_blank=True))
    decision = serializers.ChoiceField(choices=RevisionTecnica.Decision.choices)
    mensaje = serializers.CharField(required=False, allow_blank=True, default='')


def _estado_revision(caso):
    trabajos, items = servicios.en_revision(caso)
    revisiones = caso.revisiones_tecnicas.select_related('por__usuario')
    profesional = caso.profesional
    return {
        'en_revision': bool(trabajos),
        'en_espera': caso.en_espera,
        'checklist': items,
        'whatsapp': profesional.whatsapp or profesional.telefono,
        'matricula': profesional.matricula,
        'email': profesional.email,
        'revisiones': RevisionTecnicaSerializer(revisiones, many=True).data,
    }


class RevisionView(LaboratorioScopedMixin, APIView):
    @extend_schema(responses=EstadoRevisionSerializer)
    def get(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        return Response(_estado_revision(caso))

    @extend_schema(request=RevisarSerializer, responses={201: EstadoRevisionSerializer})
    def post(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        datos = RevisarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        servicios.revisar(request, caso, **datos.validated_data)
        caso.refresh_from_db()
        return Response(_estado_revision(caso), status=status.HTTP_201_CREATED)


class LlegoView(LaboratorioScopedMixin, APIView):
    @extend_schema(request=None, responses=EstadoRevisionSerializer)
    def post(self, request, pk):
        caso = self.get_scoped_object(request, Caso, pk=pk)
        servicios.llego_lo_pedido(request, caso)
        caso.refresh_from_db()
        return Response(_estado_revision(caso))
