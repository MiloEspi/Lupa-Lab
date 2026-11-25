# Demo: casos y escaneos de ejemplo

Copia del Laboratorio Demo con sus 5 casos, sus escaneos, fotos, conversación y
revisiones, para mostrar la app en otra computadora. Todo son datos de ejemplo.

- `datos.json`: la base exportada (sin contraseñas ni sesiones).
- `archivos/`: los archivos de los casos, con la misma estructura que `archivos-locales/`.

## Cargarla en otra computadora

Con la base recién creada y **sin** correr `semilla_demo`:

```bash
docker compose up -d
cd backend
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py cargar_demo     # usa SEMILLA_PASSWORD del .env
```

Entrás con `admin@demo.lupalab.local` (o `recepcion@`, `revision@`, `cad@`,
`produccion@`, `control@`) y la `SEMILLA_PASSWORD` de tu `.env`.

## Qué escaneo tiene cada caso

Son todos coronas de zirconio. Hay tres modelos 3D reales, que se repiten entre casos:
la arcada inferior, la arcada superior y la corona.

| Caso | Paciente | Pieza | Escaneo del odontólogo | Diseño (CAD) | Fotos |
|---|---|---|---|---|---|
| C-0001 | J. G. | 36 | `escaneo 33423.ply` (**vacío**, no se ve) | `arcada-inferior.ply`, `corona-36.ply`, `arcada-inferior-exocad.ply` (versión "Escena completa de exocad") | radiografía periapical, boca frontal |
| C-0002 | J. G. | 36 | `arcada-inferior.ply` + `arcada-superior.ply` | `corona.ply` (versión "Diseño con prótesis") | foto de avance |
| C-0003 | M. L. | 46 | `arcada-inferior.ply` + `arcada-superior.ply` | — | — |
| C-0004 | S13 | 36 | — | — | — |
| C-0005 | J. G. | 36 | — | — | — |

**El más completo para mostrar es C-0002**: tiene escaneo de las dos arcadas y la corona
diseñada encima.

## Escaneos sueltos para subir en vivo

En `frontend/public/ejemplos/` están los mismos modelos para subir a un caso nuevo o a
C-0004 / C-0005 durante la demo (con el front andando también se bajan de
`http://localhost:5173/ejemplos/<archivo>`):

| Archivo | Qué es | Dónde se sube |
|---|---|---|
| `arcada-inferior.ply` | Arcada inferior (29 mil vértices) | Escaneo del odontólogo, categoría "Arcada inferior" |
| `arcada-superior.ply` | Arcada superior (32 mil vértices) | Escaneo del odontólogo, categoría "Arcada superior" |
| `corona.ply` | Corona de la 36 | Diseño (CAD), categoría "Prótesis" |
| `corona-v2.ply` | Otra versión de la corona | Diseño (CAD), para mostrar una segunda versión |
