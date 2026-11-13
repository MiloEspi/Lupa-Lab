"""
Datos de prueba para desarrollo: un laboratorio de ejemplo con una persona por rol.
Nunca datos reales (docs/13-plan-de-trabajo.md, caja C). Las contraseñas salen de la
variable SEMILLA_PASSWORD, así no quedan escritas en el repo.
"""

import os

from django.core.management.base import BaseCommand, CommandError

from catalogo.semilla import cargar_catalogo
from cuentas.models import Laboratorio, Membresia, Rol, Usuario
from directorio.models import Cliente, Profesional

PERSONAS = [
    ('admin', 'Ada', 'Administración', [Rol.ADMINISTRACION, Rol.SUPERVISION]),
    ('recepcion', 'Rita', 'Recepción', [Rol.RECEPCION]),
    ('revision', 'Raúl', 'Revisión', [Rol.REVISION]),
    ('cad', 'Carla', 'CAD', [Rol.CAD]),
    ('produccion', 'Pedro', 'Producción', [Rol.PRODUCCION]),
    ('control', 'Coco', 'Control', [Rol.CONTROL]),
]

CLIENTES = [
    ('Consultorio Ejemplo Norte', [('Julia', 'Pérez', 'MP 1001')]),
    ('Clínica Ejemplo Sur', [('Martín', 'Gómez', 'MP 1002'), ('Lucía', 'Fernández', 'MP 1003')]),
    ('Odontología Ejemplo Centro', [('Tomás', 'Ruiz', 'MP 1004')]),
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
        cargar_catalogo(laboratorio)
        # Clientes y profesionales inventados (nunca datos reales).
        for razon, profesionales in CLIENTES:
            cliente, _ = Cliente.objects.get_or_create(laboratorio=laboratorio, razon_social=razon)
            for nombre, apellido, matricula in profesionales:
                profesional, _ = Profesional.objects.get_or_create(
                    laboratorio=laboratorio,
                    nombre=nombre,
                    apellido=apellido,
                    defaults={'matricula': matricula},
                )
                profesional.clientes.add(cliente)
        self.stdout.write(self.style.SUCCESS(f'Listo: {len(PERSONAS)} personas, catálogo y clientes en {laboratorio}.'))
