"""
Configuración de Lupa Lab.

Todo lo que cambia entre entornos sale de variables de entorno (ver `.env.example`).
En desarrollo el front (Vite, 5173) le pega a la API por el proxy de Vite, así que la
cookie de sesión es del mismo origen y no hace falta CORS con credenciales.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ['localhost', '127.0.0.1']),
    CSRF_TRUSTED_ORIGINS=(list, ['http://localhost:5173', 'http://127.0.0.1:5173']),
    FRONTEND_URL=(str, 'http://localhost:5173'),
)
environ.Env.read_env(BASE_DIR / '.env')

DEBUG = env('DEBUG')
SECRET_KEY = env('SECRET_KEY', default='solo-para-desarrollo-cambiar-en-produccion' if DEBUG else None)
ALLOWED_HOSTS = env('ALLOWED_HOSTS')
CSRF_TRUSTED_ORIGINS = env('CSRF_TRUSTED_ORIGINS')

#: A dónde apuntan los links de los mails (invitación, recuperar contraseña).
FRONTEND_URL = env('FRONTEND_URL').rstrip('/')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'rest_framework',
    'drf_spectacular',
    'comun',
    'cuentas',
    'auditoria',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Después de AuthenticationMiddleware: necesita `request.user`.
    'cuentas.middleware.LaboratorioActivoMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# PostgreSQL siempre, también en los tests: usamos ArrayField y restricciones que
# SQLite no tiene, y probar contra otra base esconde errores.
DATABASES = {
    'default': env.db_url('DATABASE_URL', default='postgres://lupalab:lupalab@localhost:5433/lupalab'),
}
DATABASES['default']['ATOMIC_REQUESTS'] = True

AUTH_USER_MODEL = 'cuentas.Usuario'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es-ar'
TIME_ZONE = 'America/Argentina/Buenos_Aires'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- Sesión ---
# Doce horas: cubre una jornada larga del laboratorio sin pedir la contraseña a la
# mitad, y una PC compartida no queda abierta hasta el día siguiente.
SESSION_COOKIE_AGE = 60 * 60 * 12
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
# El front lee la cookie CSRF para mandarla en el header X-CSRFToken.
CSRF_COOKIE_HTTPONLY = False

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_CONTENT_TYPE_NOSNIFF = True

# --- Mail ---
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='Lupa Lab <no-responder@lupalab.local>')

# --- API ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['cuentas.autenticacion.SesionConEncabezado'],
    # Cerrado por defecto: solo las vistas de ingreso declaran AllowAny.
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_RATES': {
        # Por IP. Un laboratorio entero sale por la misma IP: holgado para 15
        # personas entrando a la mañana, inviable para probar contraseñas.
        'ingresar': '30/hour',
        # Cada pedido manda un mail: es un techo contra usar el endpoint de spam.
        'recuperar': '5/hour',
        'invitacion_publica': '60/hour',
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Lupa Lab API',
    'VERSION': '0.1.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'consola': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['consola'], 'level': 'INFO'},
}
