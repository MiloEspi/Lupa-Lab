from django.db import models

from .ids import uuid7


class ModeloBase(models.Model):
    """Id opaco y fechas de creación y modificación, para todos los modelos del dominio."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ModeloDeLaboratorio(ModeloBase):
    """
    Todo dato de un laboratorio cuelga de él (el laboratorio es el tenant). Las vistas
    nunca consultan estos modelos a secas: pasan por `LaboratorioScopedMixin`
    (cuentas/permisos.py), que filtra por el laboratorio de la sesión.
    """

    laboratorio = models.ForeignKey('cuentas.Laboratorio', on_delete=models.PROTECT, related_name='+')

    class Meta:
        abstract = True
