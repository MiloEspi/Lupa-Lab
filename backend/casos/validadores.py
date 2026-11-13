"""
Reglas fijas que valida el sistema antes de que una persona confirme (regla 1 de CLAUDE.md
de ocludent): pieza FDI válida, color de la guía, vocabulario del odontograma de Lupa.
"""

from rest_framework import serializers

#: Notación FDI: cuadrante 1 a 4 y pieza 1 a 8 (11-18, 21-28, 31-38, 41-48).
PIEZAS_FDI = frozenset(f'{c}{p}' for c in range(1, 5) for p in range(1, 9))

#: Guía VITA classical, la que usan casi todos los odontólogos, más los blanqueados.
#: Si el laboratorio usa otra (3D-Master), se pasa a dato del laboratorio.
COLORES_VITA = frozenset(
    [
        'A1',
        'A2',
        'A3',
        'A3.5',
        'A4',
        'B1',
        'B2',
        'B3',
        'B4',
        'C1',
        'C2',
        'C3',
        'C4',
        'D2',
        'D3',
        'D4',
        'BL1',
        'BL2',
        'BL3',
        'BL4',
    ],
)

#: Vocabulario del odontograma de Lupa v2.10 (ocludent/docs/07-integracion-lupa.md).
VALORES_PIEZA = {
    'toothSelection': {'tooth-base', 'implant', 'none'},
    'toothSubstrate': {'natural', 'crownprep'},
    'restorationType': {'none', 'crown', 'inlay', 'veneer', 'bridge'},
    'restorationMaterial': {'zircon', 'emax', 'metal-ceramic', 'metal'},
}


def validar_piezas(piezas):
    if not isinstance(piezas, dict):
        raise serializers.ValidationError('Las piezas van como un objeto {"36": {...}}.')
    malas = sorted(p for p in piezas if p not in PIEZAS_FDI)
    if malas:
        raise serializers.ValidationError(f'Pieza inexistente: {", ".join(malas)}. Van de 11 a 48 (notación FDI).')
    for pieza, datos in piezas.items():
        if not isinstance(datos, dict):
            raise serializers.ValidationError(f'La pieza {pieza} tiene que traer sus datos como objeto.')
        for clave, permitidos in VALORES_PIEZA.items():
            if clave in datos and datos[clave] not in permitidos:
                raise serializers.ValidationError(f'Pieza {pieza}: "{datos[clave]}" no es un valor válido de {clave}.')
    return piezas


def normalizar_color(color: str) -> str:
    color = (color or '').strip().upper().replace(',', '.')
    if color and color not in COLORES_VITA:
        raise serializers.ValidationError(f'"{color}" no es un color de la guía VITA (A1 a D4).')
    return color
