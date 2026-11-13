# Lupa Lab — manual para Claude Code

El diseño, las decisiones y el plan viven fuera de este repo, en
`../ocludent/` (carpeta de trabajo con copia de Notion). Antes de una sesión de desarrollo
leé `../ocludent/docs/13-plan-de-trabajo.md` (qué sesión toca) y solo los docs que diga.

## Reglas del código

- **Multi-laboratorio**: todo modelo de datos de un laboratorio hereda `ModeloDeLaboratorio`
  y toda vista que los toca usa `LaboratorioScopedMixin` (`scoped_queryset`,
  `get_scoped_object`). Nunca `Modelo.objects.get(pk=...)` a secas en una vista. Un objeto
  de otro laboratorio da 404.
- **Permisos**: solo `puede(membresia, Accion.X)` / `exigir(...)` de `cuentas/permisos.py`.
  Una acción nueva se suma a `Accion`, a `_PERMISOS` y a la tabla de `tests_permisos.py`.
- **Auditoría**: toda acción que cambia algo llama a `auditoria.servicios.registrar` después
  de guardar.
- **Ids**: UUID v7 en URLs y API. El número correlativo del caso solo se muestra.
- **Sesión** de Django con cookie + CSRF; `ATOMIC_REQUESTS` activo.
- **Lo propio de un laboratorio** (etapas, checklist, códigos) va como datos, nunca en el código.
- Tests contra PostgreSQL (`docker compose up -d`). Las reglas del dominio llevan tests
  antes que pantalla.
- Textos de la interfaz y comentarios en castellano rioplatense, voz activa. Comentarios
  que expliquen por qué.
- Accesibilidad: texto ≥ 4,5:1, foco visible, táctiles ≥ 44 px (48 en producción).
- Si cambiás la API, regenerá `backend/esquema.yml` y `frontend/src/api/esquema.d.ts`.
