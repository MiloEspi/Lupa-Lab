"""
Ingreso, sesión, contraseña e invitaciones del equipo (docs/13-plan-de-trabajo.md §4).

Las únicas vistas con AllowAny son las de este archivo que lo declaran: el resto de la
API exige sesión por defecto (REST_FRAMEWORK en config/settings.py).
"""

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.models import Session
from django.db import transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from auditoria.servicios import ip_de, registrar

from . import emails
from .middleware import CLAVE_LABORATORIO, CLAVE_SEGUIDA, membresias_activas, resolver_membresia
from .models import Invitacion, Membresia, SesionDispositivo, Usuario
from .serializers import (
    AceptarInvitacionSerializer,
    CambiarPasswordSerializer,
    ElegirLaboratorioSerializer,
    IngresarSerializer,
    InvitacionPublicaSerializer,
    PasswordNuevaSerializer,
    RecuperarSerializer,
    RestablecerSerializer,
    SesionSerializer,
    YoSerializer,
    datos_yo,
)

_CREDENCIALES_MAL = 'El mail o la contraseña no coinciden.'
_LINK_VENCIDO = 'El link no sirve: venció o ya se usó. Pedí uno nuevo.'


def _abrir_sesion(request, usuario):
    """Inicia sesión y la registra como dispositivo, para poder cerrarla desde otro lado."""
    login(request, usuario, backend='django.contrib.auth.backends.ModelBackend')
    request.session[CLAVE_SEGUIDA] = True
    request.session.save()
    SesionDispositivo.objects.create(
        usuario=usuario,
        clave_sesion=request.session.session_key,
        agente=request.META.get('HTTP_USER_AGENT', '')[:300],
        ip=ip_de(request),
    )
    request.membresia = resolver_membresia(request, usuario)


def _cerrar_sesion(request):
    clave = request.session.session_key
    if clave:
        SesionDispositivo.objects.filter(clave_sesion=clave).delete()
    logout(request)


class SaludView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=inline_serializer('Salud', {'estado': serializers.CharField()}))
    def get(self, request):
        return Response({'estado': 'ok'})


@method_decorator(ensure_csrf_cookie, name='get')
class CsrfView(APIView):
    """El front lo pide al arrancar para tener la cookie CSRF antes del primer POST."""

    permission_classes = [AllowAny]

    @extend_schema(responses={204: None})
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class IngresarView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'ingresar'

    @extend_schema(request=IngresarSerializer, responses=YoSerializer)
    def post(self, request):
        datos = IngresarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        usuario = authenticate(request, email=datos.validated_data['email'], password=datos.validated_data['password'])
        if usuario is None:
            # Sin evento de auditoría: DRF revierte la transacción al contestar con error,
            # y el freno contra probar contraseñas ya es el límite por IP.
            raise ValidationError({'detail': _CREDENCIALES_MAL})
        if not usuario.is_superuser and not membresias_activas(usuario).exists():
            # La contraseña es correcta: decirlo claro evita que piense que se la olvidó.
            raise PermissionDenied('Tu acceso fue desactivado. Hablá con quien administra el laboratorio.')
        _abrir_sesion(request, usuario)
        registrar(request, 'ingreso')
        return Response(datos_yo(request))


class SalirView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        registrar(request, 'salida')
        _cerrar_sesion(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class YoView(APIView):
    @extend_schema(responses=YoSerializer)
    def get(self, request):
        return Response(datos_yo(request))


class ElegirLaboratorioView(APIView):
    @extend_schema(request=ElegirLaboratorioSerializer, responses=YoSerializer)
    def post(self, request):
        datos = ElegirLaboratorioSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        membresia = membresias_activas(request.user).filter(laboratorio_id=datos.validated_data['laboratorio']).first()
        if membresia is None:
            raise NotFound('No trabajás en ese laboratorio.')
        request.session[CLAVE_LABORATORIO] = str(membresia.laboratorio_id)
        request.membresia = membresia
        return Response(datos_yo(request))


class RecuperarView(APIView):
    """Contesta lo mismo exista o no el mail: no le dice a nadie quién tiene cuenta."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'recuperar'

    @extend_schema(request=RecuperarSerializer, responses={204: None})
    def post(self, request):
        datos = RecuperarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        usuario = Usuario.objects.filter(email__iexact=datos.validated_data['email'], is_active=True).first()
        if usuario is not None and usuario.has_usable_password():
            uid = urlsafe_base64_encode(force_bytes(usuario.pk))
            emails.enviar_restablecer(usuario, uid, default_token_generator.make_token(usuario))
        return Response(status=status.HTTP_204_NO_CONTENT)


class RestablecerView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'invitacion_publica'

    @extend_schema(request=RestablecerSerializer, responses={204: None})
    def post(self, request):
        try:
            usuario = Usuario.objects.get(pk=force_str(urlsafe_base64_decode(request.data.get('uid', ''))))
        except (Usuario.DoesNotExist, ValueError, TypeError, OverflowError):
            usuario = None
        if usuario is None or not default_token_generator.check_token(usuario, request.data.get('token', '')):
            raise ValidationError({'detail': _LINK_VENCIDO})
        datos = RestablecerSerializer(data=request.data, context={'usuario': usuario})
        datos.is_valid(raise_exception=True)
        usuario.set_password(datos.validated_data['password'])
        usuario.save(update_fields=['password'])
        # Quien te robó la contraseña no puede seguir adentro con una sesión vieja.
        _cerrar_todas_las_sesiones(usuario)
        registrar(request, 'contrasena_restablecida', usuario=usuario)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _cerrar_todas_las_sesiones(usuario, salvo=None):
    sesiones = SesionDispositivo.objects.filter(usuario=usuario)
    if salvo:
        sesiones = sesiones.exclude(clave_sesion=salvo)
    claves = list(sesiones.values_list('clave_sesion', flat=True))
    Session.objects.filter(session_key__in=claves).delete()
    sesiones.delete()


class CambiarPasswordView(APIView):
    @extend_schema(request=CambiarPasswordSerializer, responses={204: None})
    def post(self, request):
        datos = CambiarPasswordSerializer(data=request.data, context={'usuario': request.user})
        datos.is_valid(raise_exception=True)
        if not request.user.check_password(datos.validated_data['actual']):
            raise ValidationError({'actual': ['La contraseña actual no coincide.']})
        request.user.set_password(datos.validated_data['password'])
        request.user.save(update_fields=['password'])
        clave_vieja = request.session.session_key
        # Rota la clave de la sesión: el dispositivo tiene que seguirla o el middleware
        # la toma por cerrada.
        update_session_auth_hash(request, request.user)
        SesionDispositivo.objects.filter(clave_sesion=clave_vieja).update(clave_sesion=request.session.session_key)
        _cerrar_todas_las_sesiones(request.user, salvo=request.session.session_key)
        registrar(request, 'contrasena_cambiada')
        return Response(status=status.HTTP_204_NO_CONTENT)


class SesionesView(APIView):
    @extend_schema(responses=SesionSerializer(many=True))
    def get(self, request):
        sesiones = SesionDispositivo.objects.filter(usuario=request.user)
        return Response(SesionSerializer(sesiones, many=True, context={'request': request}).data)


class SesionView(APIView):
    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        sesion = SesionDispositivo.objects.filter(usuario=request.user, pk=pk).first()
        if sesion is None:
            raise NotFound()
        Session.objects.filter(session_key=sesion.clave_sesion).delete()
        sesion.delete()
        registrar(request, 'sesion_cerrada', despues={'agente': sesion.agente})
        return Response(status=status.HTTP_204_NO_CONTENT)


def _invitacion_vigente(token):
    invitacion = Invitacion.objects.por_token(token).select_related('laboratorio').first()
    if invitacion is None or not invitacion.vigente or not invitacion.laboratorio.activo:
        raise NotFound(_LINK_VENCIDO)
    return invitacion


class InvitacionPublicaView(APIView):
    """Lo que ve quien abre el link de la invitación, antes de tener usuario."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'invitacion_publica'

    @extend_schema(responses=InvitacionPublicaSerializer)
    def get(self, request, token):
        invitacion = _invitacion_vigente(token)
        return Response(
            InvitacionPublicaSerializer(
                {
                    'laboratorio': invitacion.laboratorio.nombre,
                    'email': invitacion.email,
                    'nombre': invitacion.nombre,
                    'apellido': invitacion.apellido,
                    'ya_tiene_usuario': Usuario.objects.filter(email__iexact=invitacion.email).exists(),
                }
            ).data
        )

    @extend_schema(request=AceptarInvitacionSerializer, responses=YoSerializer)
    def post(self, request, token):
        with transaction.atomic():
            invitacion = _invitacion_vigente(token)
            # Bloquea la fila: dos clics seguidos no crean dos membresías.
            invitacion = Invitacion.objects.select_for_update().get(pk=invitacion.pk)
            if not invitacion.vigente:
                raise NotFound(_LINK_VENCIDO)
            datos = AceptarInvitacionSerializer(data=request.data)
            datos.is_valid(raise_exception=True)
            password = datos.validated_data['password']
            usuario = Usuario.objects.filter(email__iexact=invitacion.email).first()
            if usuario is not None:
                # Ya trabaja en otro laboratorio: con el link solo no alcanza para entrar
                # a su cuenta, tiene que probar que es él.
                if not usuario.check_password(password):
                    raise ValidationError({'password': ['Esa no es la contraseña de tu usuario.']})
            else:
                usuario = Usuario(
                    email=invitacion.email,
                    nombre=datos.validated_data.get('nombre') or invitacion.nombre,
                    apellido=datos.validated_data.get('apellido') or invitacion.apellido,
                )
                verificador = PasswordNuevaSerializer(data={'password': password}, context={'usuario': usuario})
                verificador.is_valid(raise_exception=True)
                usuario.set_password(password)
                usuario.save()
            membresia, _ = Membresia.objects.update_or_create(
                usuario=usuario,
                laboratorio=invitacion.laboratorio,
                defaults={'roles': invitacion.roles, 'activa': True, 'tipo': Membresia.Tipo.EQUIPO},
            )
            invitacion.aceptada = timezone.now()
            invitacion.save(update_fields=['aceptada', 'actualizado'])
        _abrir_sesion(request, usuario)
        request.session[CLAVE_LABORATORIO] = str(invitacion.laboratorio_id)
        request.membresia = membresia
        registrar(request, 'invitacion_aceptada', invitacion, despues={'roles': invitacion.roles})
        return Response(datos_yo(request))
