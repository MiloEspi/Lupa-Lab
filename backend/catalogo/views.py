from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from auditoria.servicios import registrar
from comun.vistas import DetalleDeLaboratorio, ListaDeLaboratorio, SerializerDeLaboratorio
from cuentas.permisos import Accion, LaboratorioScopedMixin

from .models import Familia, ItemCatalogo, PasoPlantilla, PlantillaChecklist, PlantillaEtapas


class FamiliaSerializer(SerializerDeLaboratorio):
    class Meta:
        model = Familia
        fields = ['id', 'nombre', 'letra', 'color', 'orden', 'activa']

    def validate_color(self, valor):
        if len(valor) != 7 or not valor.startswith('#'):
            raise serializers.ValidationError('El color va en formato #RRGGBB.')
        return valor.upper()

    def validate_letra(self, valor):
        return valor.strip().upper()


class ItemSerializer(SerializerDeLaboratorio):
    familia = serializers.PrimaryKeyRelatedField(queryset=Familia.objects.all())
    plantilla_etapas = serializers.PrimaryKeyRelatedField(queryset=PlantillaEtapas.objects.all())
    plantilla_checklist = serializers.PrimaryKeyRelatedField(
        queryset=PlantillaChecklist.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = ItemCatalogo
        fields = [
            'id',
            'familia',
            'nombre',
            'codigo',
            'materiales',
            'datos_pedidos',
            'plantilla_etapas',
            'plantilla_checklist',
            'dias_minimos',
            'activo',
        ]

    def validate_codigo(self, valor):
        codigo = valor.strip().upper()
        otros = ItemCatalogo.objects.filter(laboratorio=self.context['laboratorio'], codigo=codigo)
        if otros.exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('Ya hay un trabajo con ese código.')
        return codigo


class PasoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PasoPlantilla
        fields = ['nombre', 'rol', 'en_consultorio']


class PlantillaEtapasSerializer(SerializerDeLaboratorio):
    pasos = PasoSerializer(many=True)

    class Meta:
        model = PlantillaEtapas
        fields = ['id', 'nombre', 'pasos']

    def validate_pasos(self, pasos):
        if not pasos:
            raise serializers.ValidationError('La ruta necesita al menos una etapa.')
        return pasos

    @transaction.atomic
    def create(self, datos):
        pasos = datos.pop('pasos')
        plantilla = super().create(datos)
        self._guardar_pasos(plantilla, pasos)
        return plantilla

    @transaction.atomic
    def update(self, plantilla, datos):
        pasos = datos.pop('pasos', None)
        plantilla = super().update(plantilla, datos)
        if pasos is not None:
            # Se reemplaza la ruta entera: los casos ya creados tienen su copia y no cambian.
            plantilla.pasos.all().delete()
            self._guardar_pasos(plantilla, pasos)
        return plantilla

    def _guardar_pasos(self, plantilla, pasos):
        PasoPlantilla.objects.bulk_create(
            PasoPlantilla(plantilla=plantilla, orden=i, **paso) for i, paso in enumerate(pasos, start=1)
        )


class PlantillaChecklistSerializer(SerializerDeLaboratorio):
    items = serializers.ListField(child=serializers.CharField(max_length=160), allow_empty=False)

    class Meta:
        model = PlantillaChecklist
        fields = ['id', 'nombre', 'items']


class CatalogoSerializer(serializers.Serializer):
    familias = FamiliaSerializer(many=True)
    items = ItemSerializer(many=True)
    plantillas_etapas = PlantillaEtapasSerializer(many=True)
    plantillas_checklist = PlantillaChecklistSerializer(many=True)


class CatalogoView(LaboratorioScopedMixin, APIView):
    """Todo el catálogo de una vez: son decenas de filas, no vale paginar."""

    @extend_schema(responses=CatalogoSerializer)
    def get(self, request):
        q = lambda modelo: self.scoped_queryset(request, modelo)  # noqa: E731
        return Response(
            CatalogoSerializer(
                {
                    'familias': q(Familia),
                    'items': q(ItemCatalogo).select_related('familia'),
                    'plantillas_etapas': q(PlantillaEtapas).prefetch_related('pasos'),
                    'plantillas_checklist': q(PlantillaChecklist),
                }
            ).data
        )


class _Catalogo:
    accion_escritura = Accion.GESTIONAR_CATALOGO


class FamiliasView(_Catalogo, ListaDeLaboratorio):
    modelo, serializer_class = Familia, FamiliaSerializer
    campos_auditados = ['nombre', 'letra', 'color', 'orden', 'activa']


class FamiliaView(_Catalogo, DetalleDeLaboratorio):
    modelo, serializer_class = Familia, FamiliaSerializer
    campos_auditados = FamiliasView.campos_auditados


class ItemsView(_Catalogo, ListaDeLaboratorio):
    modelo, serializer_class = ItemCatalogo, ItemSerializer
    campos_auditados = [
        'familia',
        'nombre',
        'codigo',
        'materiales',
        'plantilla_etapas',
        'plantilla_checklist',
        'activo',
    ]


class ItemView(_Catalogo, DetalleDeLaboratorio):
    modelo, serializer_class = ItemCatalogo, ItemSerializer
    campos_auditados = ItemsView.campos_auditados


class PlantillasEtapasView(_Catalogo, ListaDeLaboratorio):
    modelo, serializer_class = PlantillaEtapas, PlantillaEtapasSerializer
    campos_auditados = ['nombre']

    def get_queryset(self):
        return super().get_queryset().prefetch_related('pasos')


class PlantillaEtapasView(_Catalogo, DetalleDeLaboratorio):
    modelo, serializer_class = PlantillaEtapas, PlantillaEtapasSerializer
    campos_auditados = ['nombre']

    def perform_update(self, serializer):
        def ruta():
            return [f'{p.nombre} ({p.rol})' for p in serializer.instance.pasos.all()]

        antes = ruta()
        super().perform_update(serializer)
        despues = ruta()
        if antes != despues:
            registrar(
                self.request, 'ruta_cambiada', serializer.instance, antes={'pasos': antes}, despues={'pasos': despues}
            )


class PlantillasChecklistView(_Catalogo, ListaDeLaboratorio):
    modelo, serializer_class = PlantillaChecklist, PlantillaChecklistSerializer
    campos_auditados = ['nombre', 'items']


class PlantillaChecklistView(_Catalogo, DetalleDeLaboratorio):
    modelo, serializer_class = PlantillaChecklist, PlantillaChecklistSerializer
    campos_auditados = PlantillasChecklistView.campos_auditados
