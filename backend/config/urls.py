from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from archivos import views as ar
from auditoria.views import EventosView
from casos import views as cs
from casos import views_tablero as vt
from catalogo import views as ct
from cuentas import views as c
from cuentas import views_equipo as e
from directorio import views as d
from hilo.views import MencionablesView, MensajesView

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
    path('vistas/mis-cajas', vt.MisCajasView.as_view()),
    path('vistas/tablero', vt.TableroView.as_view()),
    path('casos', cs.CasosView.as_view()),
    path('casos/carga', cs.CargaView.as_view()),
    path('casos/<uuid:pk>', cs.CasoView.as_view()),
    path('casos/<uuid:pk>/trabajos/<uuid:trabajo>/avanzar', cs.AvanzarView.as_view()),
    path('casos/<uuid:pk>/trabajos/<uuid:trabajo>/iniciar', cs.IniciarView.as_view()),
    path('casos/<uuid:pk>/trabajos/<uuid:trabajo>/problema', cs.ProblemaView.as_view()),
    path('casos/<uuid:pk>/entregar', cs.EntregarView.as_view()),
    path('casos/<uuid:pk>/cancelar', cs.CancelarView.as_view()),
    path('casos/<uuid:pk>/pausar', cs.PausarView.as_view()),
    path('casos/<uuid:pk>/reanudar', cs.ReanudarView.as_view()),
    path('casos/<uuid:pk>/cambios', cs.CambiosView.as_view()),
    path('casos/<uuid:pk>/cambios/confirmar', cs.ConfirmarCambioView.as_view()),
    path('casos/<uuid:pk>/fichas', cs.FichasView.as_view()),
    path('casos/<uuid:pk>/revision', cs.RevisionView.as_view()),
    path('casos/<uuid:pk>/revision/llego', cs.LlegoView.as_view()),
    path('casos/<uuid:pk>/archivos', ar.ArchivosView.as_view()),
    path('casos/<uuid:pk>/archivos/<uuid:archivo>/confirmar', ar.ConfirmarArchivoView.as_view()),
    path('casos/<uuid:pk>/archivos/<uuid:archivo>/descarga', ar.DescargaView.as_view()),
    path('casos/<uuid:pk>/archivos/<uuid:archivo>/contenido', ar.ContenidoView.as_view()),
    path('casos/<uuid:pk>/mensajes', MensajesView.as_view()),
    path('casos/<uuid:pk>/mencionables', MencionablesView.as_view()),
    path('casos/<uuid:pk>/versiones', ar.VersionesView.as_view()),
    path('casos/<uuid:pk>/versiones/<uuid:version>/notas', ar.NotasView.as_view()),
    path('casos/<uuid:pk>/versiones/<uuid:version>/notas/<uuid:nota>', ar.NotaView.as_view()),
    path('casos/<uuid:pk>/versiones/<uuid:version>/zip', ar.ZipVersionView.as_view()),
    path('archivos/local/descarga/<str:token>', ar.DescargaLocalView.as_view()),
    path('archivos/local/<str:token>', ar.SubidaLocalView.as_view()),
    path('esquema', SpectacularAPIView.as_view(), name='esquema'),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(api)),
]
