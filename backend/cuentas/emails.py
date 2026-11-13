"""Mails de cuentas. Texto plano y corto: se leen en el celular."""

from django.conf import settings
from django.core.mail import send_mail


def enviar_invitacion(invitacion, token):
    link = f'{settings.FRONTEND_URL}/invitacion/{token}'
    send_mail(
        subject=f'Te sumaron al equipo de {invitacion.laboratorio.nombre} en Lupa Lab',
        message=(
            f'Hola{" " + invitacion.nombre if invitacion.nombre else ""}:\n\n'
            f'{invitacion.laboratorio.nombre} te dio acceso a Lupa Lab. Entrá a este link para '
            f'elegir tu contraseña:\n\n{link}\n\n'
            f'El link vence en {invitacion.VIGENCIA.days} días y sirve una sola vez. '
            'Si no esperabas este mail, ignoralo.'
        ),
        from_email=None,
        recipient_list=[invitacion.email],
    )


def enviar_restablecer(usuario, uid, token):
    link = f'{settings.FRONTEND_URL}/restablecer/{uid}/{token}'
    send_mail(
        subject='Elegí una contraseña nueva para Lupa Lab',
        message=(
            'Pediste cambiar tu contraseña de Lupa Lab. Entrá a este link para elegir una nueva:\n\n'
            f'{link}\n\nSi no lo pediste vos, ignorá este mail: tu contraseña sigue igual.'
        ),
        from_email=None,
        recipient_list=[usuario.email],
    )
