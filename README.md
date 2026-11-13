# Lupa Lab

Sistema de pedidos y producción para laboratorios de prótesis dental. Cada trabajo es un
**caso** con sus archivos, su conversación, sus cambios y su recorrido por las etapas.
Primer laboratorio: Ocludent (La Plata). Hermano de Lupa Dental y Lupa Clínica.

## Stack

Django 5.2 + DRF + PostgreSQL 16 · React 19 + Vite + TypeScript + Tailwind 4 · tipos del
front generados del esquema OpenAPI · sesión de Django con cookie (sin JWT).

## Levantarlo en desarrollo

Necesitás Docker Desktop, Python 3.12 y Node 22.

```bash
docker compose up -d                      # Postgres en el puerto 5433
cd backend
py -3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # en Linux/Mac: .venv/bin/pip
cp .env.example .env                      # y sumá SEMILLA_PASSWORD=<una clave de prueba>
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py semilla_demo     # Laboratorio Demo, un usuario por rol
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

```bash
cd frontend
npm install
npm run dev                               # http://localhost:5173, la API va por proxy
```

Usuarios de prueba: `admin@demo.lupalab.local`, `recepcion@…`, `revision@…`, `cad@…`,
`produccion@…`, `control@…`, todos con la `SEMILLA_PASSWORD` de tu `.env`. Los mails
(invitaciones, recuperar contraseña) salen por la consola del backend.

## Tests y controles

```bash
cd backend && .venv/Scripts/pytest && .venv/Scripts/ruff check .
cd frontend && npm run lint && npm run build
```

Si cambiás la API: `python manage.py spectacular --file esquema.yml` en `backend/` y
`npm run api` en `frontend/`. El CI falla si el esquema o los tipos quedaron viejos.

## Dónde está cada cosa

| Carpeta | Qué hay |
|---|---|
| `backend/cuentas` | Usuarios, laboratorios (tenant), membresías y roles, ingreso, invitaciones, `permisos.py` |
| `backend/auditoria` | `Evento` (solo se agrega) y `registrar()` |
| `backend/comun` | Ids UUID v7 y modelos base |
| `frontend/src/api` | Cliente tipado y tipos generados |
| `frontend/src/pantallas` | Pantallas |
| `frontend/src/ui` | Componentes (vienen del prototipo) |
