import { Navigate, Outlet, Route, Routes } from 'react-router'
import { puede, useYo } from './lib/sesion'
import { AceptarInvitacion, ElegirLaboratorio, Ingresar, Recuperar, Restablecer } from './pantallas/cuentas'
import { Equipo } from './pantallas/equipo'
import { Actividad, Inicio, Perfil } from './pantallas/inicio'
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
        <Route index element={<Inicio />} />
        <Route path="perfil" element={<Perfil />} />
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
