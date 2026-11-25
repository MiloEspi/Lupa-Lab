/**
 * El escaneo de un caso con la forma que usa el panel del prototipo (versiones con capas y notas
 * atadas a cada versión), armado desde la API. El original del odontólogo es la versión inicial:
 * solo lectura. Lo de exocad entra como versión nueva.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, pedir, type Esquemas } from '../api/cliente'
import type { CapaDef, NotaReal, Vista } from '../components/VisorReal'
import { subirArchivo } from './subir'

export type ArchivoCaso = {
  id: string
  nombre: string
  tipo: 'inicial' | 'diseno'
  version: number
  autor: string
  cuando: string
  origen: string
  basadoEn?: string
  bloqueado: boolean
  resumen: string
  formato: string
  capas: CapaDef[]
}
export type NotaCaso = NotaReal & { id: string; archivoId: string; cuando: string; esMia: boolean; etapa?: string }

type Version = Esquemas['Version']
type Archivo = Version['archivos'][number]

const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export function cuando(iso: string) {
  const f = new Date(iso)
  const hoy = new Date()
  const hora = `${f.getHours()}:${String(f.getMinutes()).padStart(2, '0')}`
  if (f.toDateString() === hoy.toDateString()) return `hoy ${hora}`
  return `${NOMBRE_DIA[f.getDay()]} ${f.getDate()}/${f.getMonth() + 1} ${hora}`
}

export const urlContenido = (caso: string, archivo: string) => `/api/casos/${caso}/archivos/${archivo}/contenido`

/** Dónde se ve cada malla y de qué color, según qué es (la categoría que eligió recepción). */
function capaDe(caso: string, a: Archivo, protesis = false): CapaDef {
  const base = { id: a.id, nombre: a.categoria || a.nombre, url: urlContenido(caso, a.id), ext: a.formato }
  if (protesis) return { ...base, color: '#EFC98A', en: ['inferior', 'mordida'] }
  const c = (a.categoria || a.nombre).toLowerCase()
  if (c.includes('superior')) return { ...base, color: '#B7C9E2', en: ['superior', 'mordida'], opMordida: 0.4 }
  if (c.includes('mordida')) return { ...base, color: '#D9CFE8', en: ['mordida'] }
  if (c.includes('inferior') || c.includes('muñón') || c.includes('munon')) return { ...base, color: '#E4DED2', en: ['inferior', 'mordida'] }
  return { ...base, color: '#E4DED2', en: ['inferior', 'superior', 'mordida'] as Vista[] }
}

const MALLAS = new Set(['stl', 'ply', 'obj'])

export function armarEscaneo(caso: string, versiones: Version[]) {
  const inicial = versiones.find((v) => v.origen === 'inicial')
  const capasIniciales = inicial ? inicial.archivos.filter((a) => MALLAS.has(a.formato)).map((a) => capaDe(caso, a)) : []
  const archivos: ArchivoCaso[] = versiones.map((v) => {
    const propias = v.archivos.filter((a) => MALLAS.has(a.formato))
    const esInicial = v.origen === 'inicial'
    const capas = esInicial ? capasIniciales : v.incluye_base ? [...capasIniciales, ...propias.map((a) => capaDe(caso, a, true))] : propias.map((a) => capaDe(caso, a))
    return {
      id: v.id,
      nombre: esInicial ? 'Escaneo inicial' : v.descripcion || (v.incluye_base ? 'Diseño con prótesis' : 'Escena completa de exocad'),
      tipo: esInicial ? 'inicial' : 'diseno',
      version: v.numero - 1,
      autor: v.creada_por,
      cuando: cuando(v.creado),
      origen: esInicial ? 'Del odontólogo' : `exocad · ${propias.map((a) => a.nombre).join(', ')}`,
      basadoEn: esInicial ? undefined : inicial?.id,
      bloqueado: esInicial,
      resumen: v.descripcion,
      formato: [...new Set(v.archivos.map((a) => a.formato.toUpperCase()))].join(', '),
      capas,
    }
  })
  const notas: NotaCaso[] = versiones.flatMap((v) =>
    v.notas.map((n) => ({
      id: n.id,
      n: n.numero,
      archivoId: v.id,
      cuando: cuando(n.creado),
      punto: [Number(n.x), Number(n.y), Number(n.z)] as [number, number, number],
      normal: ((n.normal as number[] | undefined)?.length === 3 ? n.normal : [0, 0, 1]) as [number, number, number],
      texto: n.texto,
      autor: n.autor,
      visibilidad: n.visibilidad ?? 'equipo',
      esMia: n.es_mia,
      etapa: n.etapa,
    })),
  )
  return { archivos, notas }
}

export function useEscaneo(caso: string) {
  const cliente = useQueryClient()
  const clave = ['versiones', caso]
  const consulta = useQuery({ queryKey: clave, queryFn: () => pedir(api.GET('/api/casos/{id}/versiones', { params: { path: { id: caso } } })) })
  const refrescar = () => cliente.invalidateQueries({ queryKey: clave })

  const agregarNota = useMutation({
    mutationFn: (n: { version: string; punto: [number, number, number]; normal: [number, number, number]; texto: string }) =>
      pedir(
        api.POST('/api/casos/{id}/versiones/{version}/notas', {
          params: { path: { id: caso, version: n.version } },
          body: { x: n.punto[0].toFixed(3), y: n.punto[1].toFixed(3), z: n.punto[2].toFixed(3), normal: n.normal, texto: n.texto, visibilidad: 'equipo' },
        }),
      ),
    onSuccess: refrescar,
  })
  const editarNota = useMutation({
    mutationFn: (n: { version: string; id: string; texto: string }) =>
      pedir(api.PATCH('/api/casos/{id}/versiones/{version}/notas/{nota}', { params: { path: { id: caso, version: n.version, nota: n.id } }, body: { texto: n.texto } })),
    onSuccess: refrescar,
  })
  const agregarVersion = useMutation({
    mutationFn: async (v: { archivo: File; incluyeBase: boolean }) => {
      const subido = await subirArchivo(caso, v.archivo, { tipo: 'diseno', categoria: v.incluyeBase ? 'Prótesis' : 'Escena completa' })
      return pedir(
        api.POST('/api/casos/{id}/versiones', {
          params: { path: { id: caso } },
          body: { origen: 'cad', archivos: [subido.id], incluye_base: v.incluyeBase, descripcion: v.incluyeBase ? 'Diseño con prótesis' : 'Escena completa de exocad' },
        }),
      )
    },
    onSuccess: refrescar,
  })

  /** El escaneo del odontólogo (versión 1): se sube en un caso que todavía no lo tiene y después no se reemplaza. */
  const agregarInicial = useMutation({
    mutationFn: async (lista: { archivo: File; categoria: string }[]) => {
      const ids: string[] = []
      for (const a of lista) ids.push((await subirArchivo(caso, a.archivo, { tipo: 'escaneo', categoria: a.categoria })).id)
      return pedir(api.POST('/api/casos/{id}/versiones', { params: { path: { id: caso } }, body: { origen: 'inicial', archivos: ids, incluye_base: true, descripcion: 'Escaneo del odontólogo' } }))
    },
    onSuccess: () => (refrescar(), cliente.invalidateQueries({ queryKey: ['archivos', caso] })),
  })

  const datos = armarEscaneo(caso, consulta.data ?? [])
  return { ...datos, consulta, agregarNota, editarNota, agregarVersion, agregarInicial }
}

/** Descarga la versión en .zip (mallas + notas.csv) que arma el backend (P8). */
export async function descargarVersion(caso: string, version: string) {
  const r = await fetch(`/api/casos/${caso}/versiones/${version}/zip`, { credentials: 'same-origin' })
  if (!r.ok) throw new Error('No se pudo armar el .zip.')
  const nombre = /filename="?([^"]+)"?/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'version.zip'
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return nombre
}

const limpio = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Una malla suelta, tal cual está guardada. */
export async function descargarMalla(url: string, nombre: string, ext: string) {
  const r = await fetch(url, { credentials: 'same-origin' })
  if (!r.ok) throw new Error('No se pudo descargar la malla.')
  const enlace = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = enlace
  a.download = `${limpio(nombre.replace(/\.[a-z0-9]+$/i, ''))}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(enlace), 5000)
}
