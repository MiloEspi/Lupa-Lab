"""
Qué hace el laboratorio y por dónde pasa cada trabajo.

Todo esto es DATO de cada laboratorio, nunca código: las etapas, el checklist, los
códigos y los materiales los define el laboratorio (y para Ocludent hoy son un borrador
hasta la reunión de relevamiento). Cambiar una plantilla no toca los casos ya creados:
el caso se lleva una copia congelada de la ruta al nacer (casos.EtapaTrabajo).
"""

from django.contrib.postgres.fields import ArrayField
from django.db import models

from comun.modelos import ModeloDeLaboratorio
from cuentas.models import Rol


class Familia(ModeloDeLaboratorio):
    nombre = models.CharField(max_length=80)
    #: Letra del código visible del caso (C-0412 para coronas). Hipótesis de diseño: se
    #: confirma con el laboratorio.
    letra = models.CharField(max_length=2)
    #: Color del tipo de trabajo en la interfaz (hex). Va siempre con la letra y el nombre.
    color = models.CharField(max_length=7, default='#5A48D0')
    orden = models.PositiveSmallIntegerField(default=0)
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ['orden', 'nombre']
        constraints = [models.UniqueConstraint(fields=['laboratorio', 'nombre'], name='familia_unica_por_laboratorio')]

    def __str__(self):
        return self.nombre


class PlantillaEtapas(ModeloDeLaboratorio):
    nombre = models.CharField(max_length=80)

    class Meta:
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class PasoPlantilla(models.Model):
    plantilla = models.ForeignKey(PlantillaEtapas, on_delete=models.CASCADE, related_name='pasos')
    orden = models.PositiveSmallIntegerField()
    nombre = models.CharField(max_length=80)
    #: Quién tiene el trabajo en este paso.
    rol = models.CharField(max_length=20, choices=Rol.choices)
    #: Prueba en el consultorio: el trabajo sale del laboratorio y vuelve.
    en_consultorio = models.BooleanField(default=False)

    class Meta:
        ordering = ['orden']
        constraints = [models.UniqueConstraint(fields=['plantilla', 'orden'], name='paso_orden_unico')]

    def __str__(self):
        return f'{self.orden}. {self.nombre}'


class PlantillaChecklist(ModeloDeLaboratorio):
    nombre = models.CharField(max_length=80)
    #: Los puntos, en orden. Una lista de textos alcanza: el resultado de cada revisión se
    #: guarda con el texto copiado, así una edición no cambia revisiones viejas.
    items = ArrayField(models.CharField(max_length=160), default=list)

    class Meta:
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class ItemCatalogo(ModeloDeLaboratorio):
    familia = models.ForeignKey(Familia, on_delete=models.PROTECT, related_name='items')
    nombre = models.CharField(max_length=120)
    codigo = models.CharField('código', max_length=20)
    materiales = ArrayField(models.CharField(max_length=60), default=list, blank=True)
    #: Los datos que pide el pedido de este trabajo (pieza, color, implante...). Por ahora
    #: es una guía para recepción; las reglas que validan cada dato van en casos.
    datos_pedidos = ArrayField(models.CharField(max_length=80), default=list, blank=True)
    plantilla_etapas = models.ForeignKey(PlantillaEtapas, on_delete=models.PROTECT, related_name='items_catalogo')
    plantilla_checklist = models.ForeignKey(
        PlantillaChecklist,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='items_catalogo',
    )
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ['familia__orden', 'nombre']
        constraints = [models.UniqueConstraint(fields=['laboratorio', 'codigo'], name='codigo_unico_por_laboratorio')]

    def __str__(self):
        return f'{self.codigo} · {self.nombre}'
