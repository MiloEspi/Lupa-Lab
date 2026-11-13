"""
Quién es quién: usuarios, laboratorios (el tenant) y la membresía que los une.

Un usuario puede pertenecer a más de un laboratorio (el técnico que trabaja en dos, o
vos dando soporte); lo que puede hacer en cada uno lo dicen los roles de SU membresía,
nunca el usuario. Qué habilita cada rol se decide en un solo lugar: `cuentas.permisos`.
"""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone

from comun.ids import uuid7
from comun.modelos import ModeloBase


class Rol(models.TextChoices):
    RECEPCION = 'recepcion', 'Recepción'
    REVISION = 'revision', 'Revisión técnica'
    CAD = 'cad', 'CAD'
    PRODUCCION = 'produccion', 'Producción'
    CONTROL = 'control', 'Control'
    SUPERVISION = 'supervision', 'Supervisión'
    ADMINISTRACION = 'administracion', 'Administración'


class UsuarioManager(BaseUserManager):
    use_in_migrations = True

    def _crear(self, email, password, **extra):
        if not email:
            raise ValueError('El usuario necesita un mail.')
        usuario = self.model(email=self.normalize_email(email).lower(), **extra)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario

    def create_user(self, email, password=None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._crear(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra['is_staff'] = True
        extra['is_superuser'] = True
        return self._crear(email, password, **extra)

    def get_by_natural_key(self, email):
        # El mail se compara sin mayúsculas: "Ana@Lab.com" y "ana@lab.com" son la misma persona.
        return self.get(email__iexact=email)


class Usuario(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    # Se guarda siempre en minúsculas (ver save), así el único simple ya evita duplicados.
    email = models.EmailField('mail', unique=True)
    nombre = models.CharField(max_length=80, blank=True)
    apellido = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField('activo', default=True)
    # Solo para entrar al admin de Django (soporte). No tiene nada que ver con los roles
    # del laboratorio.
    is_staff = models.BooleanField('acceso al admin', default=False)
    creado = models.DateTimeField(default=timezone.now)

    objects = UsuarioManager()

    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.nombre_visible

    def save(self, *args, **kwargs):
        self.email = (self.email or '').strip().lower()
        super().save(*args, **kwargs)

    @property
    def nombre_visible(self) -> str:
        completo = f'{self.nombre} {self.apellido}'.strip()
        return completo or self.email


class Laboratorio(ModeloBase):
    nombre = models.CharField(max_length=120)
    zona_horaria = models.CharField(max_length=60, default='America/Argentina/Buenos_Aires')
    #: Trabajos por día hábil que el laboratorio puede sacar (Ocludent: ~70). Lo usan el
    #: tablero y la fecha sugerida.
    capacidad_diaria = models.PositiveIntegerField(default=70)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre


class Membresia(ModeloBase):
    class Tipo(models.TextChoices):
        EQUIPO = 'equipo', 'Equipo del laboratorio'
        # Etapa 2: el odontólogo y sus asistentes, que entran con código por mail.
        ODONTOLOGO = 'odontologo', 'Odontólogo'

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='membresias')
    laboratorio = models.ForeignKey(Laboratorio, on_delete=models.CASCADE, related_name='membresias')
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.EQUIPO)
    roles = ArrayField(models.CharField(max_length=20, choices=Rol.choices), default=list, blank=True)
    # Una baja se desactiva, nunca se borra: lo que hizo esa persona sigue a su nombre.
    activa = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['usuario', 'laboratorio'], name='membresia_unica_por_laboratorio'),
        ]

    def __str__(self):
        return f'{self.usuario} en {self.laboratorio}'

    def tiene_rol(self, rol) -> bool:
        return rol in self.roles


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class InvitacionQuerySet(models.QuerySet):
    def por_token(self, token: str):
        return self.filter(token_hash=_hash_token(token))


class Invitacion(ModeloBase):
    """
    Alta de una persona del equipo. En la base se guarda solo el hash del token: quien
    lea la tabla no puede usar los links que están dando vueltas.
    """

    VIGENCIA = timedelta(days=7)

    laboratorio = models.ForeignKey(Laboratorio, on_delete=models.CASCADE, related_name='invitaciones')
    email = models.EmailField()
    nombre = models.CharField(max_length=80, blank=True)
    apellido = models.CharField(max_length=80, blank=True)
    roles = ArrayField(models.CharField(max_length=20, choices=Rol.choices), default=list)
    token_hash = models.CharField(max_length=64, unique=True, editable=False)
    invitada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    vence = models.DateTimeField()
    aceptada = models.DateTimeField(null=True, blank=True)
    revocada = models.DateTimeField(null=True, blank=True)

    objects = InvitacionQuerySet.as_manager()

    @classmethod
    def crear(cls, **campos) -> tuple['Invitacion', str]:
        """Devuelve la invitación y el token en claro, que solo viaja en el mail."""
        token = secrets.token_urlsafe(32)
        invitacion = cls.objects.create(
            token_hash=_hash_token(token),
            vence=timezone.now() + cls.VIGENCIA,
            **campos,
        )
        return invitacion, token

    @property
    def vigente(self) -> bool:
        return self.aceptada is None and self.revocada is None and self.vence > timezone.now()


class SesionDispositivo(models.Model):
    """
    Una sesión abierta en un dispositivo, para listarlas en "Mis dispositivos" y poder
    cerrar la de un celular perdido. La sesión en sí la sigue manejando Django; esta
    fila se borra al salir o al cerrarla desde otro lado.
    """

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sesiones')
    clave_sesion = models.CharField(max_length=40, unique=True)
    agente = models.CharField(max_length=300, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    creada = models.DateTimeField(auto_now_add=True)
    ultimo_uso = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-ultimo_uso']

    def __str__(self):
        return f'{self.usuario} · {self.agente[:40]}'
