from drf_spectacular.authentication import SessionScheme
from rest_framework.authentication import SessionAuthentication


class SesionConEncabezado(SessionAuthentication):
    """
    Sin esto DRF contesta 403 a quien no inició sesión (SessionAuthentication no define
    un WWW-Authenticate). El front necesita distinguir "no entraste" (401: ir al
    ingreso) de "entraste pero tu rol no puede" (403). Mismo arreglo que en Lupa Dental.
    """

    def authenticate_header(self, request):
        return 'Session'


class EsquemaSesion(SessionScheme):
    """Para que el esquema OpenAPI documente la cookie de sesión."""

    target_class = 'cuentas.autenticacion.SesionConEncabezado'
