from django.contrib import admin

from .models import Evento


@admin.register(Evento)
class EventoAdmin(admin.ModelAdmin):
    """Solo lectura: la auditoría no se toca ni desde el admin."""

    list_display = ['cuando', 'laboratorio', 'nombre_usuario', 'accion', 'objeto_tipo']
    list_filter = ['accion', 'laboratorio']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
