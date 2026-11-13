"""
Administración > Equipo: invitar, cambiar roles, dar de baja. Solo Administración
(`Accion.GESTIONAR_EQUIPO`).
"""

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from auditoria.servicios import registrar

from . import emails
from .models import Invitacion, Membresia, Rol
from .permisos import Accion, LaboratorioScopedMixin, exigir
from .serializers import InvitacionSerializer, MiembroCambioSerializer, MiembroSerializer


class _Equipo(LaboratorioScopedMixin, APIView):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        exigir(self.get_membresia(request), Accion.GESTIONAR_EQUIPO, 'Solo Administración maneja el equipo.')


class MiembrosView(_Equipo):
    @extend_schema(responses=MiembroSerializer(many=True))
    def get(self, request):
        miembros = (
            self.scoped_queryset(request, Membresia)
            .filter(tipo=Membresia.Tipo.EQUIPO)
            .select_related('usuario')
            .order_by('-activa', 'usuario__nombre', 'usuario__email')
        )
        return Response(MiembroSerializer(miembros, many=True).data)


class MiembroView(_Equipo):
    @extend_schema(request=MiembroCambioSerializer, responses=MiembroSerializer)
    def patch(self, request, pk):
        miembro = self.get_scoped_object(request, Membresia, pk=pk, tipo=Membresia.Tipo.EQUIPO)
        datos = MiembroCambioSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        antes = {'roles': list(miembro.roles), 'activa': miembro.activa}
        if 'roles' in datos.validated_data:
            # Sin repetidos y en el orden de Rol, así el historial no muestra cambios falsos.
            pedidos = set(datos.validated_data['roles'])
            miembro.roles = [r.value for r in Rol if r.value in pedidos]
        if 'activa' in datos.validated_data:
            miembro.activa = datos.validated_data['activa']
        self._no_dejar_sin_administracion(request, miembro)
        miembro.save(update_fields=['roles', 'activa', 'actualizado'])
        despues = {'roles': miembro.roles, 'activa': miembro.activa}
        if despues != antes:
            registrar(request, 'miembro_cambiado', miembro, antes=antes, despues=despues)
        return Response(MiembroSerializer(miembro).data)

    def _no_dejar_sin_administracion(self, request, miembro):
        """Siempre queda al menos una persona que puede administrar: si no, nadie puede
        volver a invitar ni dar permisos, y el laboratorio queda trabado."""
        sigue_administrando = miembro.activa and Rol.ADMINISTRACION in miembro.roles
        if sigue_administrando:
            return
        otros = (
            self.scoped_queryset(request, Membresia)
            .filter(activa=True, roles__contains=[Rol.ADMINISTRACION])
            .exclude(pk=miembro.pk)
        )
        if not otros.exists():
            raise ValidationError({'detail': 'Tiene que quedar al menos una persona con Administración.'})


class InvitacionesView(_Equipo):
    @extend_schema(responses=InvitacionSerializer(many=True))
    def get(self, request):
        pendientes = (
            self.scoped_queryset(request, Invitacion)
            .filter(
                aceptada__isnull=True,
                revocada__isnull=True,
                vence__gt=timezone.now(),
            )
            .order_by('-creado')
        )
        return Response(InvitacionSerializer(pendientes, many=True).data)

    @extend_schema(request=InvitacionSerializer, responses={201: InvitacionSerializer})
    def post(self, request):
        datos = InvitacionSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        laboratorio = self.get_laboratorio(request)
        email = datos.validated_data['email']
        if Membresia.objects.filter(laboratorio=laboratorio, usuario__email__iexact=email, activa=True).exists():
            raise ValidationError({'email': ['Esa persona ya está en el equipo.']})
        with transaction.atomic():
            # Una invitación nueva reemplaza a la anterior: el link viejo deja de servir.
            self.scoped_queryset(request, Invitacion).filter(
                email__iexact=email,
                aceptada__isnull=True,
                revocada__isnull=True,
            ).update(revocada=timezone.now())
            invitacion, token = Invitacion.crear(
                laboratorio=laboratorio,
                invitada_por=request.user,
                **datos.validated_data,
            )
        emails.enviar_invitacion(invitacion, token)
        registrar(request, 'invitacion_enviada', invitacion, despues={'email': email, 'roles': invitacion.roles})
        return Response(InvitacionSerializer(invitacion).data, status=status.HTTP_201_CREATED)


class InvitacionView(_Equipo):
    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        invitacion = self.get_scoped_object(request, Invitacion, pk=pk, aceptada__isnull=True)
        invitacion.revocada = timezone.now()
        invitacion.save(update_fields=['revocada', 'actualizado'])
        registrar(request, 'invitacion_revocada', invitacion, despues={'email': invitacion.email})
        return Response(status=status.HTTP_204_NO_CONTENT)
