"""
Archivos del caso, versiones del escaneo y notas sobre el 3D (P6, P7, P8).

- El escaneo del odontólogo es la versión 1 ("inicial"): solo lectura, nunca se reemplaza.
- Lo que sale de exocad entra como versión nueva, con sus propios archivos.
- Cada nota queda atada a su versión, con el punto en milímetros en el mismo sistema que
  la malla, así se puede abrir en exocad.
"""

from django.conf import settings
from django.db import models

from comun.modelos import ModeloBase, ModeloDeLaboratorio


class VersionEscaneo(ModeloBase):
    class Origen(models.TextChoices):
        INICIAL = 'inicial', 'Escaneo del odontólogo'
        CAD = 'cad', 'Diseño (exocad)'

    caso = models.ForeignKey('casos.Caso', on_delete=models.CASCADE, related_name='versiones')
    numero = models.PositiveIntegerField()
    origen = models.CharField(max_length=10, choices=Origen.choices)
    descripcion = models.CharField(max_length=200, blank=True)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')

    class Meta:
        ordering = ['numero']
        constraints = [
            models.UniqueConstraint(fields=['caso', 'numero'], name='version_escaneo_unica'),
            models.UniqueConstraint(
                fields=['caso'],
                condition=models.Q(origen='inicial'),
                name='una_sola_version_inicial',
            ),
        ]

    def __str__(self):
        return f'{self.caso_id} v{self.numero} ({self.origen})'


class Archivo(ModeloDeLaboratorio):
    class Tipo(models.TextChoices):
        ESCANEO = 'escaneo', 'Escaneo 3D'
        FOTO = 'foto', 'Foto'
        ORDEN = 'orden', 'Orden firmada'
        DISENO = 'diseno', 'Diseño'
        OTRO = 'otro', 'Otro'

    class Estado(models.TextChoices):
        # Pendiente: se pidió la URL pero todavía no se confirmó que llegó entero.
        PENDIENTE = 'pendiente', 'Subiendo'
        LISTO = 'listo', 'Listo'

    caso = models.ForeignKey('casos.Caso', on_delete=models.CASCADE, related_name='archivos')
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    nombre = models.CharField(max_length=200)
    formato = models.CharField(max_length=10)
    tamano = models.BigIntegerField('tamaño en bytes')
    sha256 = models.CharField(max_length=64)
    clave = models.CharField(max_length=300, unique=True, editable=False)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.PENDIENTE)
    subido_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    #: Qué es: "escaneo 33423" no dice nada; "Escaneo · arcada inferior" sí.
    categoria = models.CharField(max_length=60, blank=True)
    comentario = models.CharField(max_length=200, blank=True)
    #: En qué etapa estaba el caso cuando se subió (las fotos de avance van con su etapa).
    etapa = models.CharField(max_length=80, blank=True)
    version = models.ForeignKey(
        VersionEscaneo,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='archivos',
    )

    class Meta:
        ordering = ['creado']

    def __str__(self):
        return self.nombre


class NotaEscaneo(ModeloBase):
    class Visibilidad(models.TextChoices):
        EQUIPO = 'equipo', 'Solo el equipo'
        ODONTOLOGO = 'odontologo', 'También el odontólogo'

    version = models.ForeignKey(VersionEscaneo, on_delete=models.CASCADE, related_name='notas')
    numero = models.PositiveIntegerField()
    x = models.DecimalField(max_digits=9, decimal_places=3)
    y = models.DecimalField(max_digits=9, decimal_places=3)
    z = models.DecimalField(max_digits=9, decimal_places=3)
    texto = models.TextField()
    autor = models.ForeignKey('cuentas.Membresia', on_delete=models.PROTECT, related_name='+')
    visibilidad = models.CharField(max_length=12, choices=Visibilidad.choices, default=Visibilidad.EQUIPO)
    etapa = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ['numero']
        constraints = [models.UniqueConstraint(fields=['version', 'numero'], name='nota_numero_unico')]

    def __str__(self):
        return f'Nota {self.numero}'
