from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from auditoria.views import EventosView
from casos import views as cs
from catalogo import views as ct
from cuentas import views as c
from cuentas import views_equipo as e
from directorio import views as d

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
    path('clientes', d.ClientesView.as_view()),
    path('clientes/<uuid:pk>', d.ClienteView.as_view()),
    path('profesionales', d.ProfesionalesView.as_view()),
    path('profesionales/<uuid:pk>', d.ProfesionalView.as_view()),
    path('catalogo', ct.CatalogoView.as_view()),
    path('catalogo/familias', ct.FamiliasView.as_view()),
    path('catalogo/familias/<uuid:pk>', ct.FamiliaView.as_view()),
    path('catalogo/items', ct.ItemsView.as_view()),
    path('catalogo/items/<uuid:pk>', ct.ItemView.as_view()),
    path('catalogo/rutas', ct.PlantillasEtapasView.as_view()),
    path('catalogo/rutas/<uuid:pk>', ct.PlantillaEtapasView.as_view()),
    path('catalogo/checklists', ct.PlantillasChecklistView.as_view()),
    path('catalogo/checklists/<uuid:pk>', ct.PlantillaChecklistView.as_view()),
    path('casos', cs.CasosView.as_view()),
    path('casos/<uuid:pk>', cs.CasoView.as_view()),
    path('casos/<uuid:pk>/trabajos/<uuid:trabajo>/avanzar', cs.AvanzarView.as_view()),
    path('casos/<uuid:pk>/entregar', cs.EntregarView.as_view()),
    path('casos/<uuid:pk>/cancelar', cs.CancelarView.as_view()),
    path('esquema', SpectacularAPIView.as_view(), name='esquema'),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(api)),
]
