from django.contrib import admin

from .models import Mensaje


@admin.register(Mensaje)
class MensajeAdmin(admin.ModelAdmin):
    list_display = ['creado', 'caso', 'tipo', 'etapa', 'texto']
    list_filter = ['tipo']
