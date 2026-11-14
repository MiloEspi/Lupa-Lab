import { Navigate, Outlet, Route, Routes } from 'react-router'
import { puede, useYo } from './lib/sesion'
import { AceptarInvitacion, ElegirLaboratorio, Ingresar, Recuperar, Restablecer } from './pantallas/cuentas'
import { CasoDetalle } from './pantallas/caso'
import { Casos } from './pantallas/casos'
import { CatalogoPantalla } from './pantallas/catalogo'
import { Directorio } from './pantallas/directorio'
import { Equipo } from './pantallas/equipo'
import { Actividad, Perfil } from './pantallas/inicio'
import { NuevoCaso } from './pantallas/nuevo-caso'
import { ConSesion } from './ui/con-sesion'
import { Marco } from './ui/marco'

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
        <Route path="casos/:id" element={<CasoDetalle />} />
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
