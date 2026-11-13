from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Invitacion, Laboratorio, Membresia, SesionDispositivo, Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    ordering = ['email']
    list_display = ['email', 'nombre', 'apellido', 'is_active', 'is_staff']
    search_fields = ['email', 'nombre', 'apellido']
    fieldsets = [
        (None, {'fields': ['email', 'password']}),
        ('Datos', {'fields': ['nombre', 'apellido']}),
        ('Acceso', {'fields': ['is_active', 'is_staff', 'is_superuser']}),
    ]
    add_fieldsets = [(None, {'classes': ['wide'], 'fields': ['email', 'password1', 'password2']})]
    filter_horizontal = []
    list_filter = ['is_active', 'is_staff']


class MembresiaInline(admin.TabularInline):
    model = Membresia
    extra = 0
    raw_id_fields = ['usuario']


@admin.register(Laboratorio)
class LaboratorioAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'capacidad_diaria', 'activo']
    inlines = [MembresiaInline]


@admin.register(Invitacion)
class InvitacionAdmin(admin.ModelAdmin):
    list_display = ['email', 'laboratorio', 'vence', 'aceptada', 'revocada']
    readonly_fields = ['token_hash']


@admin.register(SesionDispositivo)
class SesionDispositivoAdmin(admin.ModelAdmin):
    list_display = ['usuario', 'agente', 'ip', 'ultimo_uso']
