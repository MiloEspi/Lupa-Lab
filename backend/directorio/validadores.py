from django.core.exceptions import ValidationError


def normalizar_cuit(valor: str) -> str:
    """Acepta '20-12345678-9', '20 12345678 9' o '20123456789' y devuelve solo los dígitos."""
    return ''.join(c for c in (valor or '') if c.isdigit())


def validar_cuit(cuit: str):
    """Dígito verificador de AFIP: frena los errores de tipeo al cargar un cliente nuevo."""
    if not cuit:
        return
    if len(cuit) != 11:
        raise ValidationError('El CUIT tiene 11 números.')
    pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    resto = sum(int(d) * p for d, p in zip(cuit[:10], pesos, strict=True)) % 11
    verificador = {0: 0, 1: 9}.get(resto, 11 - resto)
    if verificador != int(cuit[10]):
        raise ValidationError('El CUIT no es válido: revisá los números.')
