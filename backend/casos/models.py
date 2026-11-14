"""
El caso: un pedido con uno o más trabajos. Todo cuelga de acá.

Decisión de modelo (docs/13-plan-de-trabajo.md, puntos abiertos): las ETAPAS cuelgan del
TRABAJO, no del caso. Si en un caso con una corona y una prótesis cada trabajo avanza a su
ritmo, cada uno tiene su ruta. Para una corona sola (el piloto) es lo mismo: el caso
muestra la etapa de su único trabajo. Pasar de esto a "una ruta por caso" es fácil; al
revés, no.

La ruta se COPIA de la plantilla del catálogo al crear el trabajo y queda congelada: si el
laboratorio cambia la plantilla mañana, los casos en curso siguen con la suya.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from comun.modelos import ModeloBase, ModeloDeLaboratorio
from cuentas.models import Rol


class ContadorCasos(models.Model):
    """Último número usado por laboratorio. Se bloquea la fila al numerar: dos recepcionistas
    creando casos a la vez nunca reciben el mismo número."""

    laboratorio = models.OneToOneField('cuentas.Laboratorio', on_delete=models.CASCADE, primary_key=True)
    ultimo = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f'{self.laboratorio_id}: {self.ultimo}'


class Caso(ModeloDeLaboratorio):
    class Estado(models.TextChoices):
        # Dónde está el trabajo lo dicen las etapas; esto es solo el ciclo de vida.
        ABIERTO = 'abierto', 'Abierto'
        ENTREGADO = 'entregado', 'Entregado'
        CANCELADO = 'cancelado', 'Cancelado'

    numero = models.PositiveIntegerField(editable=False)
    cliente = models.ForeignKey('directorio.Cliente', on_delete=models.PROTECT, related_name='casos')
    profesional = models.ForeignKey('directorio.Profesional', on_delete=models.PROTECT, related_name='casos')
    #: Solo iniciales: son datos de salud (Ley 25.326) y el laboratorio no necesita más.
    paciente = models.CharField(max_length=12, blank=True)
    fecha_ingreso = models.DateField(default=timezone.localdate)
    fecha_prometida = models.DateField(null=True, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.ABIERTO)
    observaciones = models.TextField(blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    motivo_cancelacion = models.CharField(max_length=200, blank=True)
    version_ficha = models.PositiveIntegerField(default=1)

    class OrigenOrden(models.TextChoices):
        PENDIENTE = '', 'Sin indicar'
        PAPEL = 'papel', 'Llegó en papel'
        CAJA = 'caja', 'Viene con la caja'
        DIGITAL = 'digital', 'La cargó el odontólogo'

    #: La orden firmada es obligación legal (Decreto 1630/71). En papel la transcribe
    #: recepción mirando la foto (D20); la foto va como archivo de tipo "orden".
    orden_origen = models.CharField(max_length=10, choices=OrigenOrden.choices, blank=True, default='')
    orden_numero = models.CharField(max_length=30, blank=True)
    orden_fecha = models.DateField(null=True, blank=True)
    orden_firmada = models.BooleanField(default=False)
    #: No hay escaneo: llega una impresión física con el cadete.
    llega_impresion = models.BooleanField(default=False)
    #: Cuánto tardó recepción en cargarlo: métrica del piloto (P12).
    segundos_carga = models.PositiveIntegerField(null=True, blank=True)
    #: La última versión que nadie confirmó todavía. Mientras haya una, el caso no avanza
    #: ("cambio sin confirmar" no es un estado: es una marca que frena en cualquier etapa).
    cambio_pendiente = models.ForeignKey(
        'casos.RevisionFicha',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    #: Revisión técnica pidió algo al odontólogo: el caso no avanza hasta que llegue (S12).
    #: Como el cambio sin confirmar, es una marca que frena, no un estado del caso.
    en_espera = models.BooleanField(default=False)
    espera_desde = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-numero']
        constraints = [models.UniqueConstraint(fields=['laboratorio', 'numero'], name='numero_unico_por_laboratorio')]
        indexes = [
            models.Index(fields=['laboratorio', 'estado']),
            models.Index(fields=['laboratorio', 'fecha_prometida']),
        ]

    def __str__(self):
        return self.codigo

    @property
    def codigo(self) -> str:
        """Lo que se ve (C-0412). La letra sale de la familia del primer trabajo: hipótesis
        de diseño hasta confirmar cómo numera el laboratorio. Nunca va en una URL."""
        primero = next(iter(self.trabajos.all()), None)
        letra = primero.item.familia.letra if primero is not None else 'C'
        return f'{letra}-{self.numero:04d}'


class Trabajo(ModeloBase):
    class Soporte(models.TextChoices):
        NINGUNO = '', 'No aplica'
        MUNON = 'munon', 'Muñón'
        IMPLANTE = 'implante', 'Implante'

    caso = models.ForeignKey(Caso, on_delete=models.CASCADE, related_name='trabajos')
    orden = models.PositiveSmallIntegerField(default=1)
    item = models.ForeignKey('catalogo.ItemCatalogo', on_delete=models.PROTECT, related_name='trabajos')
    #: Piezas en el formato del odontograma de Lupa v2.10 (docs/07): {"36": {"toothSelection":
    #: "tooth-base", "toothSubstrate": "crownprep", "restorationType": "crown", ...}}.
    piezas = models.JSONField(default=dict, blank=True)
    material = models.CharField(max_length=60, blank=True)
    color = models.CharField(max_length=10, blank=True)
    soporte = models.CharField(max_length=10, choices=Soporte.choices, blank=True, default=Soporte.NINGUNO)
    implante_marca = models.CharField(max_length=60, blank=True)
    implante_diametro = models.CharField(max_length=20, blank=True)
    implante_conexion = models.CharField(max_length=40, blank=True)
    observaciones = models.TextField(blank=True)

    class Meta:
        ordering = ['orden']

    def __str__(self):
        return f'{self.caso_id} · {self.item}'

    @property
    def etapa_actual(self):
        """La etapa en curso, o None si terminó todas."""
        return next((e for e in self.etapas.all() if e.estado == EtapaTrabajo.Estado.EN_CURSO), None)

    @property
    def terminado(self) -> bool:
        return all(e.estado == EtapaTrabajo.Estado.HECHA for e in self.etapas.all())


class EtapaTrabajo(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        EN_CURSO = 'en_curso', 'En curso'
        HECHA = 'hecha', 'Hecha'

    trabajo = models.ForeignKey(Trabajo, on_delete=models.CASCADE, related_name='etapas')
    orden = models.PositiveSmallIntegerField()
    nombre = models.CharField(max_length=80)
    rol = models.CharField(max_length=20, choices=Rol.choices)
    en_consultorio = models.BooleanField(default=False)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.PENDIENTE)
    inicio = models.DateTimeField(null=True, blank=True)
    fin = models.DateTimeField(null=True, blank=True)
    hecha_por = models.ForeignKey(
        'cuentas.Membresia', on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )

    class Meta:
        ordering = ['orden']
        constraints = [
            models.UniqueConstraint(fields=['trabajo', 'orden'], name='etapa_orden_unico'),
            # Nunca dos etapas en curso a la vez en un mismo trabajo.
            models.UniqueConstraint(
                fields=['trabajo'],
                condition=models.Q(estado='en_curso'),
                name='una_etapa_en_curso',
            ),
        ]

    def __str__(self):
        return f'{self.orden}. {self.nombre} ({self.get_estado_display()})'


#: Lo que se puede cambiar de un trabajo con un cambio de ficha.
CAMPOS_DE_FICHA = [
    'piezas',
    'material',
    'color',
    'soporte',
    'implante_marca',
    'implante_diametro',
    'implante_conexion',
    'observaciones',
]


def foto_de_trabajos(caso):
    """Copia de los datos de ficha de cada trabajo, tal como están ahora."""
    return [
        {'id': str(t.pk), 'item': t.item.nombre, **{c: getattr(t, c) for c in CAMPOS_DE_FICHA}}
        for t in caso.trabajos.select_related('item').order_by('orden')
    ]


class RevisionFicha(ModeloBase):
    """
    Una versión de la ficha. Nunca se edita: un cambio crea la siguiente. La versión 1 es
    la del alta; cada cambio guarda la copia completa y, aparte, qué campos cambiaron.
    """

    caso = models.ForeignKey(Caso, on_delete=models.CASCADE, related_name='fichas')
    version = models.PositiveIntegerField()
    trabajos = models.JSONField()
    #: [{"trabajo": id, "campo": "color", "antes": "A2", "despues": "A3"}]
    cambios = models.JSONField(default=list, blank=True)
    motivo = models.CharField(max_length=300, blank=True)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')

    class Meta:
        ordering = ['-version']
        constraints = [models.UniqueConstraint(fields=['caso', 'version'], name='version_unica_por_caso')]

    def __str__(self):
        return f'{self.caso_id} v{self.version}'


class ConfirmacionLectura(ModeloBase):
    """Quién leyó el cambio y qué decidió (seguir o rehacer desde una etapa)."""

    revision = models.ForeignKey(RevisionFicha, on_delete=models.CASCADE, related_name='confirmaciones')
    membresia = models.ForeignKey('cuentas.Membresia', on_delete=models.PROTECT, related_name='+')
    rehacer = models.BooleanField(default=False)
    volver_a = models.CharField(max_length=80, blank=True)
    comentario = models.CharField(max_length=300, blank=True)

    def __str__(self):
        return f'{self.revision} leída por {self.membresia_id}'


class RevisionTecnica(ModeloBase):
    """
    Una pasada de la revisión técnica (S12): el checklist marcado y qué se decidió. Los
    puntos se guardan con su texto copiado, así una edición de la plantilla no cambia
    revisiones viejas. Nunca se edita: si llega lo que faltaba, se revisa de nuevo.
    """

    class Decision(models.TextChoices):
        APROBAR = 'aprobar', 'Aprobado'
        CONSULTA = 'consulta', 'Aprobado con nota técnica'
        PEDIR = 'pedir', 'Pedido al odontólogo'

    class Marca(models.TextChoices):
        OK = 'ok', 'Bien'
        FALTA = 'falta', 'Falta'
        DUDA = 'duda', 'Con duda'

    caso = models.ForeignKey(Caso, on_delete=models.CASCADE, related_name='revisiones_tecnicas')
    #: [{"texto": "Márgenes de la preparación", "marca": "duda"}]
    items = models.JSONField()
    decision = models.CharField(max_length=10, choices=Decision.choices)
    #: Lo que se le pidió al odontólogo, tal cual salió por WhatsApp.
    mensaje = models.TextField(blank=True)
    por = models.ForeignKey('cuentas.Membresia', on_delete=models.PROTECT, related_name='+')

    class Meta:
        ordering = ['-creado']

    def __str__(self):
        return f'{self.caso_id}: {self.decision}'
