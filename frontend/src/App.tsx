import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { puede, useYo } from './lib/sesion'
import { AceptarInvitacion, ElegirLaboratorio, Ingresar, Recuperar, Restablecer } from './pantallas/cuentas'
import { Casos } from './pantallas/casos'
import { CatalogoPantalla } from './pantallas/catalogo'
import { Directorio } from './pantallas/directorio'
import { Equipo } from './pantallas/equipo'
import { Actividad, Perfil } from './pantallas/inicio'
import { MisCajasPantalla } from './pantallas/mis-cajas'
import { NuevoCaso } from './pantallas/nuevo-caso'
import { Cargando, ConSesion } from './ui/con-sesion'
import { Marco } from './ui/marco'

// El caso trae el visor 3D (three.js): se carga aparte, solo cuando se abre un caso.
const CasoDetalle = lazy(() => import('./pantallas/caso').then((m) => ({ default: m.CasoDetalle })))
const Etiqueta = lazy(() => import('./pantallas/etiqueta').then((m) => ({ default: m.Etiqueta })))
const Produccion = lazy(() => import('./pantallas/produccion').then((m) => ({ default: m.Produccion })))
const CajaProduccion = lazy(() => import('./pantallas/produccion').then((m) => ({ default: m.CajaProduccion })))
const Tablero = lazy(() => import('./pantallas/tablero').then((m) => ({ default: m.TableroPantalla })))
const Revision = lazy(() => import('./pantallas/revision').then((m) => ({ default: m.Revision })))
const ColaRevision = lazy(() => import('./pantallas/revision').then((m) => ({ default: m.ColaRevision })))

/** Una ruta que pide un permiso: sin él, vuelve al inicio (el backend igual lo rechaza). */
function ConPermiso({ accion }: { accion: string }) {
  const { data: yo } = useYo()
  return puede(yo, accion) ? <Outlet /> : <Navigate to="/" replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/restablecer/:uid/:token" element={<Restablecer />} />
      <Route path="/invitacion/:token" element={<AceptarInvitacion />} />
      <Route
        path="/elegir-laboratorio"
        element={
          <ConSesion>
            <ElegirLaboratorio />
          </ConSesion>
        }
      />
      <Route
        element={
          <ConSesion>
            <Marco>
              <Outlet />
            </Marco>
          </ConSesion>
        }
      >
        <Route index element={<Navigate to="/casos" replace />} />
        <Route path="casos" element={<Casos />} />
        <Route path="casos/:id" element={<Suspense fallback={<Cargando />}><CasoDetalle /></Suspense>} />
        <Route path="casos/:id/etiqueta" element={<Suspense fallback={<Cargando />}><Etiqueta /></Suspense>} />
        {/* Lo que abre el QR de la caja: `/p/<id>`. */}
        <Route path="p" element={<Suspense fallback={<Cargando />}><Produccion /></Suspense>} />
        <Route path="p/:id" element={<Suspense fallback={<Cargando />}><CajaProduccion /></Suspense>} />
        <Route path="mis-cajas" element={<MisCajasPantalla />} />
        <Route element={<ConPermiso accion="ver_tablero" />}>
          <Route path="tablero" element={<Suspense fallback={<Cargando />}><Tablero /></Suspense>} />
        </Route>
        <Route path="revision" element={<Suspense fallback={<Cargando />}><ColaRevision /></Suspense>} />
        <Route path="revision/:id" element={<Suspense fallback={<Cargando />}><Revision /></Suspense>} />
        <Route element={<ConPermiso accion="crear_caso" />}>
          <Route path="nuevo" element={<NuevoCaso />} />
        </Route>
        <Route path="perfil" element={<Perfil />} />
        <Route path="clientes" element={<Directorio />} />
        <Route path="catalogo" element={<CatalogoPantalla />} />
        <Route element={<ConPermiso accion="gestionar_equipo" />}>
          <Route path="equipo" element={<Equipo />} />
        </Route>
        <Route element={<ConPermiso accion="ver_auditoria" />}>
          <Route path="actividad" element={<Actividad />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
