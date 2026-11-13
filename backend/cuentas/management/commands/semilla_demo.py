"""
Datos de prueba para desarrollo: un laboratorio de ejemplo con una persona por rol.
Nunca datos reales (docs/13-plan-de-trabajo.md, caja C). Las contraseñas salen de la
variable SEMILLA_PASSWORD, así no quedan escritas en el repo.
"""

import os

from django.core.management.base import BaseCommand, CommandError

from cuentas.models import Laboratorio, Membresia, Rol, Usuario

PERSONAS = [
    ('admin', 'Ada', 'Administración', [Rol.ADMINISTRACION, Rol.SUPERVISION]),
    ('recepcion', 'Rita', 'Recepción', [Rol.RECEPCION]),
    ('revision', 'Raúl', 'Revisión', [Rol.REVISION]),
    ('cad', 'Carla', 'CAD', [Rol.CAD]),
    ('produccion', 'Pedro', 'Producción', [Rol.PRODUCCION]),
    ('control', 'Coco', 'Control', [Rol.CONTROL]),
]


class Command(BaseCommand):
    help = 'Crea el Laboratorio Demo con una persona por rol (mail <rol>@demo.lupalab.local).'

    def handle(self, *args, **opciones):
        password = os.environ.get('SEMILLA_PASSWORD')
        if not password:
            raise CommandError('Definí SEMILLA_PASSWORD con la contraseña de los usuarios de prueba.')
        laboratorio, _ = Laboratorio.objects.get_or_create(nombre='Laboratorio Demo')
        for usuario_mail, nombre, apellido, roles in PERSONAS:
            usuario, creado = Usuario.objects.get_or_create(
                email=f'{usuario_mail}@demo.lupalab.local',
                defaults={'nombre': nombre, 'apellido': apellido},
            )
            if creado:
                usuario.set_password(password)
                usuario.save()
            Membresia.objects.update_or_create(
                usuario=usuario,
                laboratorio=laboratorio,
                defaults={'roles': [r.value for r in roles], 'activa': True},
            )
        self.stdout.write(self.style.SUCCESS(f'Listo: {len(PERSONAS)} personas en {laboratorio}.'))
