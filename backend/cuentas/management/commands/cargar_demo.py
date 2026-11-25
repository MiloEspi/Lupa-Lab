"""
Carga en una base vacía los casos de demostración que viven en `backend/demo/`: el
Laboratorio Demo con sus casos, escaneos, conversación y revisiones, y copia los archivos
(.ply, fotos) a ARCHIVOS_DIR. Sirve para mostrar la app en otra computadora con los mismos
casos. Todo son datos de ejemplo, nunca reales.

Las contraseñas no viajan en el repo: se ponen desde SEMILLA_PASSWORD, igual que en
semilla_demo.
"""

import json
import os
import shutil
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from cuentas.models import Laboratorio, Usuario

DEMO_DIR = Path(settings.BASE_DIR) / 'demo'


class Command(BaseCommand):
    help = 'Carga los casos de demostración de backend/demo/ en una base vacía.'

    def handle(self, *args, **opciones):
        password = os.environ.get('SEMILLA_PASSWORD')
        if not password:
            raise CommandError('Definí SEMILLA_PASSWORD con la contraseña de los usuarios de prueba.')
        # Los datos traen sus propios ids: sobre una base con otro laboratorio quedarían
        # mezclados o chocarían, así que solo se cargan en una base recién migrada.
        if Laboratorio.objects.exists():
            raise CommandError(
                'La base ya tiene datos. Cargá la demo en una base vacía (sin correr semilla_demo antes).'
            )

        call_command('loaddata', str(DEMO_DIR / 'datos.json'))

        emails = [
            o['fields']['email']
            for o in json.loads((DEMO_DIR / 'datos.json').read_text(encoding='utf-8'))
            if o['model'] == 'cuentas.usuario'
        ]
        for usuario in Usuario.objects.filter(email__in=emails):
            usuario.set_password(password)
            usuario.save(update_fields=['password'])

        shutil.copytree(DEMO_DIR / 'archivos', settings.ARCHIVOS_DIR, dirs_exist_ok=True)

        self.stdout.write(
            self.style.SUCCESS(f'Demo cargada: {len(emails)} usuarios y archivos copiados a {settings.ARCHIVOS_DIR}.')
        )
