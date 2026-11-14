"""
Conversación del caso (S11). Un hilo por caso, no un chat general: todo mensaje cuelga del
caso y queda en la etapa en la que se escribió, así el recorrido muestra cada comentario donde
pasó. Un mensaje nunca cambia la ficha: un cambio se registra como cambio (S7) y deja acá un
mensaje del sistema.
"""

from django.db import models

from comun.modelos import ModeloBase


class Mensaje(ModeloBase):
    class Tipo(models.TextChoices):
        # Solo el laboratorio.
        EQUIPO = 'equipo', 'Solo el equipo'
        # Lo ve también el odontólogo (desde la Etapa 2; hoy recepción copia lo de WhatsApp).
        ODONTOLOGO = 'odontologo', 'También el odontólogo'
        # Registro automático: cambios, etapas, archivos.
        SISTEMA = 'sistema', 'Sistema'

    caso = models.ForeignKey('casos.Caso', on_delete=models.CASCADE, related_name='mensajes')
    autor = models.ForeignKey('cuentas.Membresia', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    tipo = models.CharField(max_length=12, choices=Tipo.choices, default=Tipo.EQUIPO)
    texto = models.TextField()
    #: De dónde vino lo que se copió ("Copiado del WhatsApp por Ana").
    nota = models.CharField(max_length=120, blank=True)
    #: Si el mensaje acompaña un cambio de ficha, qué versión dejó.
    version_ficha = models.PositiveIntegerField(null=True, blank=True)
    etapa = models.CharField(max_length=80, blank=True)
    #: Posición de esa etapa en la ruta (0 = la primera), para agrupar por etapa.
    etapa_orden = models.PositiveSmallIntegerField(null=True, blank=True)
    respuesta_a = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='respuestas')
    adjuntos = models.ManyToManyField('archivos.Archivo', blank=True, related_name='mensajes')

    class Meta:
        ordering = ['creado']

    def __str__(self):
        return f'{self.caso_id}: {self.texto[:40]}'
