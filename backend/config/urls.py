from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from auditoria.views import EventosView
from cuentas import views as c
from cuentas import views_equipo as e

api = [
    path('salud', c.SaludView.as_view()),
    path('auth/csrf', c.CsrfView.as_view()),
    path('auth/ingresar', c.IngresarView.as_view()),
    path('auth/salir', c.SalirView.as_view()),
    path('auth/yo', c.YoView.as_view()),
    path('auth/laboratorio', c.ElegirLaboratorioView.as_view()),
    path('auth/recuperar', c.RecuperarView.as_view()),
    path('auth/restablecer', c.RestablecerView.as_view()),
    path('auth/contrasena', c.CambiarPasswordView.as_view()),
    path('auth/sesiones', c.SesionesView.as_view()),
    path('auth/sesiones/<uuid:pk>', c.SesionView.as_view()),
    path('auth/invitaciones/<str:token>', c.InvitacionPublicaView.as_view()),
    path('equipo/miembros', e.MiembrosView.as_view()),
    path('equipo/miembros/<uuid:pk>', e.MiembroView.as_view()),
    path('equipo/invitaciones', e.InvitacionesView.as_view()),
    path('equipo/invitaciones/<uuid:pk>', e.InvitacionView.as_view()),
    path('auditoria/eventos', EventosView.as_view()),
    path('esquema', SpectacularAPIView.as_view(), name='esquema'),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(api)),
]
