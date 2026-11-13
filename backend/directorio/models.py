"""
Clientes y profesionales. Quien paga (cliente: un odontólogo o una clínica) no es lo
mismo que quien pide y firma (profesional). Una clínica agrupa a varios profesionales y
un profesional puede pedir para más de una clínica.

No se borran: se desactivan. Un caso viejo tiene que seguir diciendo de quién era.
"""

from django.db import models

from comun.modelos import ModeloDeLaboratorio


class Cliente(ModeloDeLaboratorio):
    razon_social = models.CharField('razón social o nombre', max_length=160)
    cuit = models.CharField('CUIT', max_length=11, blank=True, help_text='Solo números.')
    telefono = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.CharField('dirección', max_length=200, blank=True)
    notas = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ['razon_social']
        constraints = [
            models.UniqueConstraint(
                fields=['laboratorio', 'cuit'],
                condition=~models.Q(cuit=''),
                name='cliente_cuit_unico_por_laboratorio',
            ),
        ]

    def __str__(self):
        return self.razon_social


class Profesional(ModeloDeLaboratorio):
    nombre = models.CharField(max_length=80)
    apellido = models.CharField(max_length=80)
    matricula = models.CharField('matrícula', max_length=30, blank=True)
    telefono = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    clientes = models.ManyToManyField(Cliente, related_name='profesionales', blank=True)
    notas = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ['apellido', 'nombre']

    def __str__(self):
        return self.nombre_completo

    @property
    def nombre_completo(self) -> str:
        return f'{self.nombre} {self.apellido}'.strip()
