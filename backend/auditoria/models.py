"""
Registro de quién hizo qué, cuándo, y cómo estaba antes. Solo se agrega: una fila de
auditoría que se puede editar o borrar no prueba nada.
"""

from django.conf import settings
from django.db import models

from comun.ids import uuid7


class EventoInmutable(Exception):
    pass


class Evento(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    # Nulo solo en lo que no pertenece a un laboratorio (por ejemplo, un ingreso fallido
    # de alguien que todavía no eligió uno).
    laboratorio = models.ForeignKey('cuentas.Laboratorio', on_delete=models.PROTECT, null=True, related_name='+')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    #: El nombre tal como era en ese momento: si la persona cambia de nombre o se va, el
    #: registro sigue diciendo quién fue.
    nombre_usuario = models.CharField(max_length=200, blank=True)
    accion = models.CharField(max_length=60)
    objeto_tipo = models.CharField(max_length=60, blank=True)
    objeto_id = models.CharField(max_length=64, blank=True)
    antes = models.JSONField(null=True, blank=True)
    despues = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    cuando = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-cuando']
        indexes = [
            models.Index(fields=['laboratorio', '-cuando']),
            models.Index(fields=['objeto_tipo', 'objeto_id']),
        ]

    def __str__(self):
        return f'{self.cuando:%d/%m/%Y %H:%M} · {self.nombre_usuario} · {self.accion}'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise EventoInmutable('Un evento de auditoría no se modifica.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise EventoInmutable('Un evento de auditoría no se borra.')
