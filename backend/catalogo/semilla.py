"""
Catálogo inicial de Ocludent: las secciones y los trabajos son los del tarifario real
(https://ocludent.ar/tarifario/, valores de octubre de 2026). Lo que el tarifario NO trae
sigue siendo BORRADOR, a confirmar en la reunión de relevamiento y corregir como datos
(desde la pantalla Catálogo), sin tocar código:

- los códigos (el tarifario no tiene; son abreviaturas nuestras),
- las rutas de etapas: salen del flujo habitual de laboratorio de cada tipo de trabajo
  (bibliografía de prótesis y guías de fabricantes), no de cómo trabaja Ocludent. Las
  pruebas en el consultorio son la hipótesis más frágil: cada laboratorio decide cuáles pide,
- los checklists, los días mínimos (el tarifario dice que las fechas salen "según orden de
  ingreso") y las letras y colores de cada tipo de trabajo.

Los precios del tarifario todavía no se cargan: el modelo no tiene dónde guardarlos.
"""

from django.db import transaction

from cuentas.models import Rol

from .models import Familia, ItemCatalogo, PasoPlantilla, PlantillaChecklist, PlantillaEtapas

REC, REV, CAD, PROD, CTRL = Rol.RECEPCION, Rol.REVISION, Rol.CAD, Rol.PRODUCCION, Rol.CONTROL

# Nombres de las rutas (se usan de clave abajo, en los trabajos).
CAD_CAM = 'Coronas e incrustaciones (CAD/CAM)'
ZIRCONIO_EST = 'Zirconio estratificada (CAD/CAM)'
FRESADO = 'Fresado y terminación (PMMA, titanio)'
COLADO = 'Colado metálico'
METALOCERAMICA = 'Metalocerámica'
REMOVIBLE = 'Prótesis removible'
INMEDIATA = 'Prótesis removible inmediata'
NYLON = 'Prótesis de nylon (inyectada)'
CROMO_ARMAZON = 'Armazón de cromo'
CROMO_IMPRESO = 'Armazón de cromo impreso'
CROMO_DIENTES = 'Prótesis de cromo con dientes'
PPR_PMMA = 'PPR fresada en PMMA'
HIB_ACRILICO = 'Híbrida metal-acrílico'
HIB_CERAMICA = 'Híbrida metal-cerámica'
HIB_PMMA = 'Híbrida PMMA fresado'
HIB_ZIRCONIO = 'Híbrida zirconio monolítica'
RODETE = 'Rodete, cubeta y llave'
PLACA_TERMOFORMADA = 'Placa estampada (termoformada)'
PLACA_TERMOCURADA = 'Placa termocurada'
REPARACION = 'Reparación de prótesis'
REBASADO = 'Rebasado'
IMPRESION_3D = 'Impresión 3D'
GENERICA = 'Genérica (a relevar)'

_ENTRADA = ('Recepción', REC)
_REVISION = ('Revisión técnica', REV)
_CONTROL = ('Control final', CTRL)
_LISTO = ('Listo para retirar', REC)
_PRUEBA_RODETES = ('Prueba de rodetes', REC, True)
_PRUEBA_DIENTES = ('Prueba de dientes', REC, True)

RUTAS = {
    CAD_CAM: [
        _ENTRADA,
        _REVISION,
        ('Diseño exocad', CAD),
        ('Fresado', PROD),
        ('Sinterizado', PROD),
        ('Maquillaje y glaseado', PROD),
        _CONTROL,
        _LISTO,
    ],
    ZIRCONIO_EST: [
        _ENTRADA,
        _REVISION,
        ('Diseño exocad', CAD),
        ('Fresado', PROD),
        ('Sinterizado', PROD),
        ('Estratificado cerámico', PROD),
        ('Maquillaje y glaseado', PROD),
        _CONTROL,
        _LISTO,
    ],
    FRESADO: [
        _ENTRADA,
        _REVISION,
        ('Diseño exocad', CAD),
        ('Fresado', PROD),
        ('Terminación y pulido', PROD),
        _CONTROL,
        _LISTO,
    ],
    COLADO: [
        _ENTRADA,
        _REVISION,
        ('Encerado', PROD),
        ('Colado', PROD),
        ('Terminación del metal', PROD),
        _CONTROL,
        _LISTO,
    ],
    METALOCERAMICA: [
        _ENTRADA,
        _REVISION,
        ('Encerado y colado', PROD),
        ('Ajuste del casquete', PROD),
        ('Opaquer y bizcochado', PROD),
        ('Prueba de bizcocho', REC, True),
        ('Glaseado', PROD),
        _CONTROL,
        _LISTO,
    ],
    REMOVIBLE: [
        _ENTRADA,
        ('Modelos', PROD),
        _PRUEBA_RODETES,
        ('Enfilado', PROD),
        _PRUEBA_DIENTES,
        ('Acrilizado', PROD),
        ('Terminación', PROD),
        ('Control', CTRL),
    ],
    INMEDIATA: [
        _ENTRADA,
        ('Modelos y cirugía del modelo', PROD),
        ('Enfilado', PROD),
        _PRUEBA_DIENTES,
        ('Acrilizado', PROD),
        ('Terminación', PROD),
        ('Control', CTRL),
    ],
    NYLON: [
        _ENTRADA,
        ('Modelos', PROD),
        _PRUEBA_RODETES,
        ('Enfilado y encerado', PROD),
        _PRUEBA_DIENTES,
        ('Enmuflado', PROD),
        ('Inyección', PROD),
        ('Terminación y pulido', PROD),
        ('Control', CTRL),
    ],
    CROMO_ARMAZON: [
        _ENTRADA,
        ('Modelos', PROD),
        ('Diseño del armazón', CAD),
        ('Duplicado y colado', PROD),
        ('Terminación del metal', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    CROMO_IMPRESO: [
        _ENTRADA,
        ('Modelos', PROD),
        ('Diseño del armazón', CAD),
        ('Impresión y colado', PROD),
        ('Terminación del metal', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    CROMO_DIENTES: [
        _ENTRADA,
        ('Modelos', PROD),
        ('Diseño del armazón', CAD),
        ('Duplicado y colado', PROD),
        ('Terminación del metal', PROD),
        ('Prueba del armazón', REC, True),
        ('Enfilado', PROD),
        _PRUEBA_DIENTES,
        ('Acrilizado', PROD),
        ('Terminación', PROD),
        ('Control', CTRL),
    ],
    PPR_PMMA: [
        _ENTRADA,
        _REVISION,
        ('Diseño exocad', CAD),
        ('Fresado', PROD),
        ('Terminación y pulido', PROD),
        _CONTROL,
        _LISTO,
    ],
    HIB_ACRILICO: [
        _ENTRADA,
        ('Modelos', PROD),
        _PRUEBA_RODETES,
        ('Enfilado', PROD),
        _PRUEBA_DIENTES,
        ('Diseño de la barra', CAD),
        ('Colado de la barra', PROD),
        ('Prueba de la barra', REC, True),
        ('Acrilizado', PROD),
        ('Terminación', PROD),
        ('Control', CTRL),
    ],
    HIB_CERAMICA: [
        _ENTRADA,
        ('Modelos', PROD),
        _PRUEBA_RODETES,
        ('Enfilado', PROD),
        _PRUEBA_DIENTES,
        ('Diseño de la estructura', CAD),
        ('Colado de la estructura', PROD),
        ('Prueba de la estructura', REC, True),
        ('Opaquer y cerámica', PROD),
        ('Glaseado', PROD),
        ('Control', CTRL),
    ],
    HIB_PMMA: [
        _ENTRADA,
        ('Modelos', PROD),
        _PRUEBA_RODETES,
        _PRUEBA_DIENTES,
        ('Diseño exocad', CAD),
        ('Fresado de barra y PMMA', PROD),
        ('Prueba de la estructura', REC, True),
        ('Terminación y pulido', PROD),
        ('Control', CTRL),
    ],
    HIB_ZIRCONIO: [
        _ENTRADA,
        ('Modelos', PROD),
        _PRUEBA_RODETES,
        _PRUEBA_DIENTES,
        ('Diseño exocad', CAD),
        ('Fresado de la barra', PROD),
        ('Fresado del zirconio', PROD),
        ('Sinterizado', PROD),
        ('Prueba de la estructura', REC, True),
        ('Maquillaje y glaseado', PROD),
        ('Control', CTRL),
    ],
    RODETE: [
        _ENTRADA,
        ('Modelos', PROD),
        ('Confección', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    PLACA_TERMOFORMADA: [
        _ENTRADA,
        ('Modelos', PROD),
        ('Estampado', PROD),
        ('Recorte y pulido', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    PLACA_TERMOCURADA: [
        _ENTRADA,
        ('Modelos', PROD),
        ('Encerado', PROD),
        ('Enflascado y curado', PROD),
        ('Terminación y pulido', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    REPARACION: [
        _ENTRADA,
        ('Preparación de la prótesis', PROD),
        ('Reparación', PROD),
        ('Terminación y pulido', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    REBASADO: [
        _ENTRADA,
        ('Remarginado y preparación', PROD),
        ('Rebasado', PROD),
        ('Terminación y pulido', PROD),
        ('Control', CTRL),
        _LISTO,
    ],
    IMPRESION_3D: [
        _ENTRADA,
        ('Preparación del archivo', CAD),
        ('Impresión', PROD),
        ('Lavado y poscurado', PROD),
        ('Retiro de soportes y terminación', PROD),
        _CONTROL,
        _LISTO,
    ],
    GENERICA: [
        _ENTRADA,
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
    'Genérico': ['Orden firmada'],
}

# Los datos que pide el pedido, por tipo de trabajo (guía para recepción).
D_CORONA = [
    'Pieza',
    'Muñón o implante',
    'Marca, diámetro y conexión',
    'Material',
    'Color y guía',
    'Fecha prometida',
    'Escaneo',
    'Orden firmada',
]
D_REMOVIBLE = [
    'Piezas',
    'Tipo de prótesis',
    'Color de dientes y encía',
    'Fecha de cada prueba',
    'Impresión o escaneo',
    'Orden firmada',
]
D_PERNO = ['Pieza', 'Tipo de perno', 'Impresión o patrón del conducto', 'Orden firmada']
D_IMPLANTE = ['Pieza', 'Marca', 'Diámetro', 'Conexión', 'Material', 'Color']
D_INCRUSTACION = ['Pieza', 'Caras', 'Material', 'Color']
D_CARILLA = ['Piezas', 'Material', 'Color', 'Fotos de la sonrisa']
D_HIBRIDA = ['Piezas', 'Tipo de barra', 'Material', 'Color de dientes y encía', 'Impresión o escaneo', 'Orden firmada']
D_RODETE = ['Arcada', 'Tipo de base', 'Impresión o escaneo']
D_PLACA = ['Arcada', 'Tipo', 'Espesor']
D_REPARACION = ['Qué se rompió', 'Fotos']
D_3D = ['Archivo', 'Cantidad', 'Material']
D_TITANIO = ['Pieza o arcada', 'Marca y conexión', 'Escaneo']

# Cada familia sigue una sección del tarifario. Una familia tiene una ruta por defecto; un
# ítem puede traer la suya como cuarto elemento (si no, usa la de la familia).
# nombre, letra, color, ruta, checklist, datos, días mínimos, [(ítem, código, materiales[, ruta])]
FAMILIAS = [
    (
        'Prótesis fija',
        'F',
        '#7A5C2E',
        COLADO,
        'Genérico',
        D_PERNO,
        3,
        [
            ('Perno método directo', 'PER-DIR', []),
            ('Perno método indirecto', 'PER-IND', []),
            ('Perno pasante', 'PER-PAS', []),
            ('Perno cromo níquel', 'PER-CRN', ['Cromo níquel']),
            ('Perno bola con teflón', 'PER-BOL', []),
        ],
    ),
    (
        'Incrustaciones',
        'I',
        '#B0307A',
        CAD_CAM,
        'Incrustaciones',
        D_INCRUSTACION,
        3,
        [
            ('Metálica', 'INC-MET', ['Metal'], COLADO),
            ('Resina fresada', 'INC-RES', ['Resina']),
            ('Disilicato', 'INC-DS', ['Disilicato']),
            ('Zirconio', 'INC-ZR', ['Zirconio']),
        ],
    ),
    (
        'Implantes',
        'M',
        '#0B6F8C',
        COLADO,
        'Implantes',
        D_IMPLANTE,
        3,
        [
            ('Colado de UCLA calcinable', 'IMP-UCL', []),
            ('Barra sobre implantes', 'IMP-BAR', []),
            ('Contra-barra', 'IMP-CBA', []),
            ('Tallado de pilar macizo', 'IMP-TPM', [], GENERICA),
            ('Pilar personalizado (sintron)', 'IMP-PPS', [], FRESADO),
            ('Cubeta para implantes', 'IMP-CUB', [], RODETE),
            ('Llave de comprobación', 'IMP-LLA', [], RODETE),
            ('Prótesis sobre implantes', 'IMP-PRO', [], REMOVIBLE),
        ],
    ),
    (
        'Coronas metalocerámicas',
        'C',
        '#5A48D0',
        METALOCERAMICA,
        'Coronas',
        D_CORONA,
        3,
        [
            ('Casquete metálico', 'COR-CAS', ['Metal'], COLADO),
            ('Bizcochado de porcelana', 'COR-BIZ', ['Porcelana']),
            ('Bizcochado con encía rosa', 'COR-BEP', ['Porcelana']),
        ],
    ),
    (
        'Coronas libres de metal',
        'C',
        '#6B3FA0',
        CAD_CAM,
        'Coronas',
        D_CORONA,
        3,
        [
            ('Corona provisoria (PMMA)', 'COR-PRV', ['PMMA'], FRESADO),
            ('Zirconio estratificada', 'COR-ZE', ['Zirconio'], ZIRCONIO_EST),
            ('Disilicato de litio', 'COR-DS', ['Disilicato']),
            ('Monolítica de zirconio', 'COR-ZM', ['Zirconio']),
        ],
    ),
    (
        'Carillas',
        'V',
        '#B4532A',
        CAD_CAM,
        'Carillas',
        D_CARILLA,
        5,
        [
            ('Monolítica', 'CAR-MON', ['Disilicato']),
            ('Estratificada', 'CAR-EST', ['Disilicato']),
        ],
    ),
    (
        'Prótesis híbrida',
        'H',
        '#8C2F39',
        HIB_ACRILICO,
        'Genérico',
        D_HIBRIDA,
        5,
        [
            ('Metal-acrílico', 'HIB-MAC', []),
            ('Metal-cerámica', 'HIB-MCE', [], HIB_CERAMICA),
            ('PMMA con barra colada en cromo cobalto', 'HIB-PCC', ['PMMA'], HIB_PMMA),
            ('PMMA con barra de titanio', 'HIB-PTI', ['PMMA'], HIB_PMMA),
            ('Monolítica de zirconio con barra colada en cromo cobalto', 'HIB-ZCC', ['Zirconio'], HIB_ZIRCONIO),
            ('Monolítica de zirconio con barra de titanio', 'HIB-ZTI', ['Zirconio'], HIB_ZIRCONIO),
        ],
    ),
    (
        'Rodete de registro',
        'R',
        '#66701F',
        RODETE,
        'Genérico',
        D_RODETE,
        2,
        [
            ('Rodete con base plate', 'ROD-BPL', []),
            ('Rodete con base acrílica', 'ROD-BAC', ['Acrílico']),
            ('Rodete con base foto curada', 'ROD-BFC', []),
            ('Rodete de fijación', 'ROD-FIJ', []),
        ],
    ),
    (
        'Prótesis de acrílico',
        'R',
        '#66701F',
        REMOVIBLE,
        'Prótesis',
        D_REMOVIBLE,
        5,
        [
            ('Completa', 'ACR-COM', ['Acrílico']),
            ('Parcial', 'ACR-PAR', ['Acrílico']),
            ('Completa inmediata', 'ACR-CIN', ['Acrílico'], INMEDIATA),
            ('Parcial inmediata', 'ACR-PIN', ['Acrílico'], INMEDIATA),
        ],
    ),
    (
        'Prótesis de nylon (Deflex)',
        'R',
        '#4F7A2B',
        NYLON,
        'Prótesis',
        D_REMOVIBLE,
        5,
        [
            ('Completa', 'NYL-COM', ['Nylon']),
            ('Parcial', 'NYL-PAR', ['Nylon']),
            ('Unilateral', 'NYL-UNI', ['Nylon']),
            ('Completa inmediata', 'NYL-CIN', ['Nylon']),
            ('Parcial inmediata', 'NYL-PIN', ['Nylon']),
        ],
    ),
    (
        'Prótesis de cromo',
        'R',
        '#5B6B33',
        CROMO_DIENTES,
        'Prótesis',
        D_REMOVIBLE,
        5,
        [
            ('Armazón de cromo impreso', 'CRO-AIM', ['Cromo'], CROMO_IMPRESO),
            ('Armazón de cromo', 'CRO-ARM', ['Cromo'], CROMO_ARMAZON),
            ('Hasta 6 dientes', 'CRO-D06', ['Cromo']),
            ('Hasta 8 dientes', 'CRO-D08', ['Cromo']),
        ],
    ),
    (
        'PPR fresadas en PMMA',
        'R',
        '#3F7A52',
        PPR_PMMA,
        'Prótesis',
        D_REMOVIBLE,
        5,
        [
            ('Hasta 4 dientes', 'PPR-D04', ['PMMA']),
            ('Hasta 6 dientes', 'PPR-D06', ['PMMA']),
            ('Hasta 8 dientes', 'PPR-D08', ['PMMA']),
        ],
    ),
    (
        'Placas',
        'L',
        '#475163',
        PLACA_TERMOFORMADA,
        'Placas',
        D_PLACA,
        2,
        [
            ('Placa estampada', 'PLA-EST', []),
            ('Placa termocurada', 'PLA-TER', [], PLACA_TERMOCURADA),
            ('Protector bucal', 'PLA-PRO', []),
            ('Placa de blanqueamiento', 'PLA-BLA', []),
            ('Placa de bruxismo fresada en PMMA', 'PLA-BRU', ['PMMA'], FRESADO),
        ],
    ),
    (
        'Reparaciones',
        'X',
        '#8A5300',
        REPARACION,
        'Reparaciones',
        D_REPARACION,
        2,
        [
            ('Reparación', 'REP-PRO', []),
            ('Agregado de diente', 'REP-DIE', []),
            ('Agregado de retenedor', 'REP-RET', []),
            ('Rebasado', 'REP-REB', [], REBASADO),
        ],
    ),
    (
        'Impresiones 3D',
        'D',
        '#1B50C2',
        IMPRESION_3D,
        'Impresiones 3D',
        D_3D,
        3,
        [
            ('Modelos impresos (ambas arcadas)', '3D-MOD', ['Resina']),
            ('Maqueta para híbrida', '3D-MAH', ['Resina']),
            ('Maqueta para monolítica', '3D-MAM', ['Resina']),
            ('Encerado de diagnóstico', '3D-ENC', ['Resina']),
            ('Resina con carga cerámica para provisorios', '3D-PRV', ['Resina']),
            ('Guía quirúrgica', '3D-GUI', ['Resina']),
        ],
    ),
    (
        'Estructuras en titanio',
        'T',
        '#2F5F7A',
        FRESADO,
        'Genérico',
        D_TITANIO,
        5,
        [
            ('Pilar personalizado o Ti-base', 'TIT-PIL', ['Titanio']),
            ('Barra de arcada completa', 'TIT-BAR', ['Titanio']),
        ],
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
    for orden, (nombre, letra, color, ruta, checklist, datos, dias, items) in enumerate(FAMILIAS):
        familia = Familia.objects.create(laboratorio=laboratorio, nombre=nombre, letra=letra, color=color, orden=orden)
        for item, codigo, materiales, *ruta_propia in items:
            ItemCatalogo.objects.create(
                laboratorio=laboratorio,
                familia=familia,
                nombre=item,
                codigo=codigo,
                materiales=materiales,
                datos_pedidos=datos,
                plantilla_etapas=rutas[ruta_propia[0] if ruta_propia else ruta],
                plantilla_checklist=checklists[checklist],
                dias_minimos=dias,
            )
    return True
