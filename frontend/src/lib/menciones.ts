import { useQuery } from '@tanstack/react-query'
import { api, pedir } from '../api/cliente'

export type Mencionable = {
  id: string
  nombre: string
  rol: string
  /** El odontólogo del caso: elegirlo cambia el destino a "Al odontólogo" (con aviso por WhatsApp). */
  odontologo?: boolean
}

/** Quién del equipo se puede etiquetar en el caso. */
export function useMencionables(casoId: string) {
  return useQuery({
    queryKey: ['mencionables', casoId],
    queryFn: () => pedir(api.GET('/api/casos/{id}/mencionables', { params: { path: { id: casoId } } })),
    staleTime: 5 * 60_000,
  })
}

/** Sin tildes ni mayúsculas, para que "jose" encuentre a "José". */
export const llano = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const SIN_LETRA_DESPUES = '(?![\\p{L}\\p{N}])'

/** Ids de a quién se etiquetó en el texto (solo gente del equipo: el odontólogo no es una membresía). */
export function idsMencionados(texto: string, opciones: Mencionable[]) {
  return opciones.filter((o) => !o.odontologo && new RegExp(`(?:^|\\s)@${escapar(o.nombre)}${SIN_LETRA_DESPUES}`, 'u').test(texto)).map((o) => o.id)
}
