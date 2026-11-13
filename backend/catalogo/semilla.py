"""
Catálogo provisorio: las 8 familias del sitio de Ocludent con las rutas, checklists y
códigos del prototipo (diseno/pantallas/Catalogo.dc.html). Es un BORRADOR (caja B del plan):
la reunión de relevamiento lo corrige como datos, sin tocar código.
"""

from django.db import transaction

from cuentas.models import Rol

from .models import Familia, ItemCatalogo, PasoPlantilla, PlantillaChecklist, PlantillaEtapas

REC, REV, CAD, PROD, CTRL = Rol.RECEPCION, Rol.REVISION, Rol.CAD, Rol.PRODUCCION, Rol.CONTROL

RUTAS = {
    'Coronas e incrustaciones (CAD/CAM)': [
        ('Recepción', REC),
        ('Revisión técnica', REV),
        ('Diseño exocad', CAD),
        ('Fresado', PROD),
        ('Sinterizado', PROD),
        ('Maquillaje y glaseado', PROD),
        ('Control final', CTRL),
        ('Listo para retirar', REC),
    ],
    'Prótesis removible': [
        ('Recepción', REC),
        ('Modelos', PROD),
        ('Prueba de rodetes', REC, True),
        ('Enfilado', PROD),
        ('Prueba de dientes', REC, True),
        ('Acrilizado', PROD),
        ('Terminación', PROD),
        ('Control', CTRL),
    ],
    'Genérica (a relevar)': [
        ('Recepción', REC),
        ('Revisión', REV),
        ('Producción', PROD),
        ('Control', CTRL),
        ('Listo', REC),
    ],
}

CHECKLISTS = {
    'Coronas': [
        'Arcada a trabajar',
        'Antagonista',
        'Registro de mordida',
        'Márgenes visibles',
        'Espacio oclusal',
        'Pieza, material y color',
        'Orden firmada',
    ],
    'Prótesis': ['Impresión completa', 'Registro de mordida', 'Color de encía', 'Orden firmada'],
    'Implantes': ['Scanbody correcto', 'Marca y conexión', 'Antagonista', 'Orden firmada'],
    'Incrustaciones': ['Preparación visible', 'Antagonista', 'Orden firmada'],
    'Carillas': ['Fotos con guía de color', 'Escaneo', 'Orden firmada'],
    'Placas': ['Modelo completo', 'Orden firmada'],
    'Reparaciones': ['Prótesis recibida', 'Orden firmada'],
    'Impresiones 3D': ['Archivo válido'],
}

_CR, _PR, _GR = RUTAS
FAMILIAS = [
    # nombre, letra, color, ruta, checklist, datos, [(ítem, código, materiales)]
    (
        'Coronas',
        'C',
        '#5A48D0',
        _CR,
        'Coronas',
        [
            'Pieza',
            'Muñón o implante',
            'Marca, diámetro y conexión',
            'Material',
            'Color y guía',
            'Fecha prometida',
            'Escaneo',
            'Orden firmada',
        ],
        [
            ('Metalocerámica', 'COR-MC', ['Metalocerámica']),
            ('Zirconio monolítica', 'COR-ZM', ['Zirconio']),
            ('Disilicato', 'COR-DS', ['Disilicato']),
        ],
    ),
    (
        'Prótesis',
        'R',
        '#66701F',
        _PR,
        'Prótesis',
        [
            'Piezas',
            'Tipo de prótesis',
            'Color de dientes y encía',
            'Fecha de cada prueba',
            'Impresión o escaneo',
            'Orden firmada',
        ],
        [
            ('Fijas', 'PRO-FIJ', []),
            ('Nylon', 'PRO-NYL', ['Nylon']),
            ('Acrílico', 'PRO-ACR', ['Acrílico']),
            ('Cromo', 'PRO-CRO', ['Cromo']),
            ('Híbridas', 'PRO-HIB', []),
        ],
    ),
    (
        'Implantes',
        'M',
        '#0B6F8C',
        _CR,
        'Implantes',
        ['Pieza', 'Marca', 'Diámetro', 'Conexión', 'Material', 'Color'],
        [
            ('Coronas sobre implante', 'IMP-COR', ['Zirconio', 'Disilicato', 'Metalocerámica']),
            ('Estructuras', 'IMP-EST', ['Zirconio', 'Titanio']),
        ],
    ),
    (
        'Incrustaciones',
        'I',
        '#B0307A',
        _CR,
        'Incrustaciones',
        ['Pieza', 'Caras', 'Material', 'Color'],
        [
            ('Metálicas', 'INC-MET', ['Metal']),
            ('Isosit', 'INC-ISO', ['Isosit']),
            ('Disilicato', 'INC-DS', ['Disilicato']),
            ('Zirconio', 'INC-ZR', ['Zirconio']),
        ],
    ),
    (
        'Carillas',
        'V',
        '#B4532A',
        _CR,
        'Carillas',
        ['Piezas', 'Material', 'Color', 'Fotos de la sonrisa'],
        [('Disilicato monolítica', 'CAR-MON', ['Disilicato']), ('Disilicato estratificada', 'CAR-EST', ['Disilicato'])],
    ),
    (
        'Placas',
        'L',
        '#475163',
        _GR,
        'Placas',
        ['Arcada', 'Tipo', 'Espesor'],
        [
            ('Estampada', 'PLA-EST', []),
            ('Termocurada', 'PLA-TER', []),
            ('Blanqueamiento', 'PLA-BLA', []),
            ('Protectora', 'PLA-PRO', []),
        ],
    ),
    (
        'Reparaciones',
        'X',
        '#8A5300',
        _GR,
        'Reparaciones',
        ['Qué se rompió', 'Fotos'],
        [('Reparación de prótesis', 'REP-PRO', [])],
    ),
    (
        'Impresiones 3D',
        'D',
        '#1B50C2',
        _GR,
        'Impresiones 3D',
        ['Archivo', 'Cantidad', 'Material'],
        [('Modelos', '3D-MOD', ['Resina']), ('Maquetas', '3D-MAQ', ['Resina']), ('Encerados', '3D-ENC', ['Resina'])],
    ),
]


@transaction.atomic
def cargar_catalogo(laboratorio):
    """Idempotente: si el laboratorio ya tiene familias, no hace nada."""
    if Familia.objects.filter(laboratorio=laboratorio).exists():
        return False
    rutas = {}
    for nombre, pasos in RUTAS.items():
        plantilla = PlantillaEtapas.objects.create(laboratorio=laboratorio, nombre=nombre)
        for orden, (paso, rol, *consultorio) in enumerate(pasos, start=1):
            PasoPlantilla.objects.create(
                plantilla=plantilla,
                orden=orden,
                nombre=paso,
                rol=rol,
                en_consultorio=bool(consultorio),
            )
        rutas[nombre] = plantilla
    checklists = {
        nombre: PlantillaChecklist.objects.create(laboratorio=laboratorio, nombre=nombre, items=items)
        for nombre, items in CHECKLISTS.items()
    }
    for orden, (nombre, letra, color, ruta, checklist, datos, items) in enumerate(FAMILIAS):
        familia = Familia.objects.create(laboratorio=laboratorio, nombre=nombre, letra=letra, color=color, orden=orden)
        for item, codigo, materiales in items:
            ItemCatalogo.objects.create(
                laboratorio=laboratorio,
                familia=familia,
                nombre=item,
                codigo=codigo,
                materiales=materiales,
                datos_pedidos=datos,
                plantilla_etapas=rutas[ruta],
                plantilla_checklist=checklists[checklist],
            )
    return True
