from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Invitacion, Laboratorio, Membresia, Rol, SesionDispositivo, Usuario
from .permisos import permisos_de


class LaboratorioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Laboratorio
        fields = ['id', 'nombre']


class MembresiaPropiaSerializer(serializers.ModelSerializer):
    laboratorio = LaboratorioSerializer()

    class Meta:
        model = Membresia
        fields = ['id', 'laboratorio', 'tipo', 'roles']
        read_only_fields = fields


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ['id', 'email', 'nombre', 'apellido', 'nombre_visible']
        read_only_fields = fields


class RolDisponibleSerializer(serializers.Serializer):
    valor = serializers.CharField()
    nombre = serializers.CharField()


class YoSerializer(serializers.Serializer):
    usuario = UsuarioSerializer()
    membresias = MembresiaPropiaSerializer(many=True)
    #: Con más de un laboratorio y ninguno elegido, viene nulo: el front pide elegir.
    membresia_activa = MembresiaPropiaSerializer(allow_null=True)
    permisos = serializers.ListField(child=serializers.CharField())
    roles_disponibles = RolDisponibleSerializer(many=True)


def datos_yo(request):
    from .middleware import membresias_activas

    membresia = getattr(request, 'membresia', None)
    return YoSerializer(
        {
            'usuario': request.user,
            'membresias': list(membresias_activas(request.user)),
            'membresia_activa': membresia,
            'permisos': permisos_de(membresia),
            'roles_disponibles': [{'valor': r.value, 'nombre': r.label} for r in Rol],
        }
    ).data


class IngresarSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class ElegirLaboratorioSerializer(serializers.Serializer):
    laboratorio = serializers.UUIDField()


class RecuperarSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordNuevaSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_password(self, valor):
        validate_password(valor, user=self.context.get('usuario'))
        return valor


class RestablecerSerializer(PasswordNuevaSerializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class CambiarPasswordSerializer(PasswordNuevaSerializer):
    actual = serializers.CharField(trim_whitespace=False, write_only=True)


class SesionSerializer(serializers.ModelSerializer):
    esta = serializers.SerializerMethodField(help_text='Es la sesión desde la que se hace el pedido.')

    class Meta:
        model = SesionDispositivo
        fields = ['id', 'agente', 'ip', 'creada', 'ultimo_uso', 'esta']
        read_only_fields = fields

    def get_esta(self, sesion) -> bool:
        return sesion.clave_sesion == self.context['request'].session.session_key


class InvitacionPublicaSerializer(serializers.Serializer):
    laboratorio = serializers.CharField()
    email = serializers.EmailField()
    nombre = serializers.CharField()
    apellido = serializers.CharField()
    #: Si ya tiene usuario (trabaja en otro laboratorio), acepta con su contraseña actual.
    ya_tiene_usuario = serializers.BooleanField()


class AceptarInvitacionSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=80, required=False, allow_blank=True)
    apellido = serializers.CharField(max_length=80, required=False, allow_blank=True)
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class MiembroSerializer(serializers.ModelSerializer):
    usuario = UsuarioSerializer(read_only=True)

    class Meta:
        model = Membresia
        fields = ['id', 'usuario', 'tipo', 'roles', 'activa', 'creado']
        read_only_fields = ['id', 'usuario', 'tipo', 'creado']


class MiembroCambioSerializer(serializers.Serializer):
    roles = serializers.ListField(child=serializers.ChoiceField(choices=Rol.choices), required=False)
    activa = serializers.BooleanField(required=False)


class InvitacionSerializer(serializers.ModelSerializer):
    roles = serializers.ListField(child=serializers.ChoiceField(choices=Rol.choices), allow_empty=False)
    vigente = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invitacion
        fields = ['id', 'email', 'nombre', 'apellido', 'roles', 'vence', 'aceptada', 'vigente', 'creado']
        read_only_fields = ['id', 'vence', 'aceptada', 'vigente', 'creado']

    def validate_email(self, valor):
        return valor.lower()
