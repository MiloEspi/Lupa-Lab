import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi, pedir, type Yo } from '../api/cliente'

const CLAVE = ['yo']

/** Quién está adentro. `null` = sin sesión (401). */
export function useYo() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async (): Promise<Yo | null> => {
      try {
        return await pedir(api.GET('/api/auth/yo'))
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
  })
}

export function useGuardarYo() {
  const cliente = useQueryClient()
  return (yo: Yo | null) => cliente.setQueryData(CLAVE, yo)
}

export function puede(yo: Yo | null | undefined, accion: string) {
  return !!yo?.permisos.includes(accion)
}
