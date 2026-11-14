/**
 * Cómo se muestra un caso de la API en las listas (tarjetas, filas, navegador) y el estado de la
 * vista de "Casos" (búsqueda, filtro y modo). La vista vive fuera de las pantallas para que al
 * entrar a un caso y volver la lista siga como estaba.
 */
import { useSyncExternalStore } from 'react'
import type { Esquemas } from '../api/cliente'

export type Caso = Esquemas['Caso']
export type Trabajo = Esquemas['Trabajo']

const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "2026-11-20" -> Date local (sin corrimiento por zona horaria). */
export const fechaLocal = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}
export const fechaCorta = (iso?: string | null) => {
  if (!iso) return 'sin fecha'
  const f = fechaLocal(iso)
  return `${NOMBRE_DIA[f.getDay()]} ${f.getDate()}/${f.getMonth() + 1}`
}

/** Días hábiles (lunes a viernes) entre hoy y la fecha. Negativo si ya pasó. */
export function habilesHasta(iso: string, hoy = new Date()) {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const hasta = fechaLocal(iso)
  const signo = hasta >= desde ? 1 : -1
  let n = 0
  const d = new Date(desde)
  while (signo > 0 ? d < hasta : d > hasta) {
    d.setDate(d.getDate() + signo)
    if (d.getDay() !== 0 && d.getDay() !== 6) n += signo
  }
  return n
}

/** Piezas del primer trabajo: "36", "24 a 26" o "11, 21". */
export function piezasDe(t?: Trabajo) {
  const lista = Object.keys((t?.piezas as Record<string, unknown>) ?? {}).sort()
  if (lista.length === 0) return '—'
  const nums = lista.map(Number)
  const seguidas = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
  return lista.length > 2 && seguidas ? `${lista[0]} a ${lista[lista.length - 1]}` : lista.join(', ')
}

const SOPORTE: Record<string, string> = { munon: ' sobre muñón', implante: ' sobre implante' }
export const tituloTrabajo = (t?: Trabajo) => (t ? `${t.familia} · ${t.item_nombre}${SOPORTE[t.soporte ?? ''] ?? ''}` : 'Sin trabajo')

/** Índice de la etapa actual en la ruta (igual al largo si ya pasó por todas). */
export const indiceEtapa = (t?: Trabajo) => (t?.etapa_actual ? t.etapa_actual.orden - 1 : (t?.etapas.length ?? 0))
export const nombresEtapas = (t?: Trabajo) => t?.etapas.map((e) => e.nombre) ?? []

export type Tono = 'frenado' | 'alerta' | 'normal'

/** Qué se dice de un caso en la lista: lo frenado, si vence pronto, o cuánto falta. */
export function estadoCaso(c: Caso): { texto: string; tono: Tono } {
  if (c.estado === 'entregado') return { texto: 'Entregado', tono: 'normal' }
  if (c.estado === 'cancelado') return { texto: 'Cancelado', tono: 'normal' }
  if (c.cambio_pendiente) return { texto: 'Cambio sin confirmar', tono: 'frenado' }
  if (!c.fecha_prometida) return { texto: 'Sin fecha prometida', tono: 'normal' }
  const faltan = habilesHasta(c.fecha_prometida)
  if (faltan < 0) return { texto: 'Atrasado', tono: 'frenado' }
  if (faltan === 0) return { texto: 'Vence hoy', tono: 'alerta' }
  if (faltan === 1) return { texto: 'Vence mañana', tono: 'alerta' }
  return { texto: `Faltan ${faltan} días hábiles`, tono: 'normal' }
}

const grupoEtapa = (c: Caso) => {
  const rol = c.trabajos[0]?.etapa_actual?.rol
  return rol === 'recepcion' || rol === 'revision' ? 'revision' : rol === 'cad' ? 'diseno' : rol ? 'produccion' : 'listo'
}

export type FiltroCasos = 'todos' | 'urgentes' | 'frenados' | 'revision' | 'diseno' | 'produccion'
export const FILTROS: { id: FiltroCasos; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'urgentes', label: 'Vencen pronto' },
  { id: 'frenados', label: 'Frenados' },
  { id: 'revision', label: 'Revisión' },
  { id: 'diseno', label: 'Diseño' },
  { id: 'produccion', label: 'Producción' },
]
const PASA: Record<FiltroCasos, (c: Caso) => boolean> = {
  todos: () => true,
  urgentes: (c) => estadoCaso(c).tono === 'alerta',
  frenados: (c) => estadoCaso(c).tono === 'frenado',
  revision: (c) => grupoEtapa(c) === 'revision',
  diseno: (c) => grupoEtapa(c) === 'diseno',
  produccion: (c) => grupoEtapa(c) === 'produccion',
}
export const contarFiltro = (casos: Caso[], f: FiltroCasos) => casos.filter(PASA[f]).length

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Todas las palabras tienen que aparecer: número (con o sin guion), pieza, doctor, clínica, trabajo, etapa. */
function coincide(c: Caso, q: string) {
  const palabras = plano(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const t = c.trabajos[0]
  const pajar = plano(
    [c.codigo, c.codigo.replace('-', ''), String(c.numero), piezasDe(t), tituloTrabajo(t), t?.material, t?.color, c.profesional.nombre, c.cliente.nombre, c.paciente, t?.etapa_actual?.nombre].join(' '),
  )
  return palabras.every((p) => pajar.includes(p))
}

/** Orden base: primero lo frenado, después lo que vence pronto, después por número. */
const peso = (c: Caso) => ({ frenado: 0, alerta: 1, normal: 2 })[estadoCaso(c).tono]
export const ordenar = (casos: Caso[]) => [...casos].sort((a, b) => peso(a) - peso(b) || a.numero - b.numero)

export type ModoLista = 'tarjetas' | 'lista'
export type VistaCasos = { filtro: FiltroCasos; q: string; modo: ModoLista }

let vista: VistaCasos = { filtro: 'todos', q: '', modo: 'tarjetas' }
const oyentes = new Set<() => void>()

export const useVistaCasos = () =>
  useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => void oyentes.delete(f)
    },
    () => vista,
  )

export const vistaCasos = {
  poner(parcial: Partial<VistaCasos>) {
    vista = { ...vista, ...parcial }
    oyentes.forEach((f) => f())
  },
}

export const filtrar = (casos: Caso[], v: Pick<VistaCasos, 'filtro' | 'q'>) => casos.filter((c) => PASA[v.filtro](c) && coincide(c, v.q))
