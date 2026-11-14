import { Camera, Check, ChevronDown, MapPin, MessageSquare, Pause, Send } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '../lib/utils'
import { esImagen } from '../lib/fotos'
import { Avatar, Foto, type FotoData } from './ui/avatar-foto'
import { Badge } from './ui/badge'

export type EtapaRecorrido = { nombre: string; quien: string; cuando: string; texto: string; meta: string; fotos: FotoData[] }
export type ComentarioEtapa = { id: string; ini: string; autor: string; rol: string; hora: string; texto: string; odontologo: boolean; respuestas: number }

type Props = {
  etapas: EtapaRecorrido[]
  /** Índice de la etapa en curso. Las de antes están hechas; las de después, pendientes. */
  actual: number
  frenada: boolean
  /** Lo que se comentó en cada etapa (misma lista que la conversación, vista por etapa). */
  comentarios: ComentarioEtapa[][]
  /** Cuántas notas sobre el escaneo se hicieron en cada etapa. */
  notas: number[]
  onFoto: (etapa: number, f: File) => void
  onComentar: (etapa: number, texto: string) => void
  onAbrirFoto: (f: FotoData) => void
}

/**
 * Recorrido del caso en vertical: una fila por etapa con quién, cuándo y cuánto llevó. Al abrirla se ve todo
 * lo que pasó ahí: el resumen, los comentarios del equipo, cuántas notas hay en el escaneo y las fotos del
 * avance (se pueden subir). La etapa en curso arranca abierta. Es la historia del caso en un solo lugar.
 */
export function RecorridoCaso({ etapas, actual, frenada, comentarios, notas, onFoto, onComentar, onAbrirFoto }: Props) {
  const [abiertas, setAbiertas] = useState<number[]>([actual])
  const alternar = (i: number) => setAbiertas((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]))
  return (
    <ol className="m-0 grid list-none p-0">
      {etapas.map((e, i) => (
        <ItemEtapa
          key={e.nombre}
          e={e}
          i={i}
          ultima={i === etapas.length - 1}
          actual={actual}
          frenada={frenada}
          abierta={abiertas.includes(i)}
          onAlternar={() => alternar(i)}
          comentarios={comentarios[i] ?? []}
          notas={notas[i] ?? 0}
          onFoto={(f) => onFoto(i, f)}
          onComentar={(t) => onComentar(i, t)}
          onAbrirFoto={onAbrirFoto}
        />
      ))}
    </ol>
  )
}

function Contador({ icono: Icono, n, etiqueta }: { icono: typeof Camera; n: number; etiqueta: string }) {
  if (!n) return null
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-ink2" title={`${n} ${etiqueta}`}>
      <Icono aria-hidden className="size-3.5" />
      {n}
      <span className="sr-only">{etiqueta}</span>
    </span>
  )
}

function ItemEtapa({
  e,
  i,
  ultima,
  actual,
  frenada,
  abierta,
  onAlternar,
  comentarios,
  notas,
  onFoto,
  onComentar,
  onAbrirFoto,
}: {
  e: EtapaRecorrido
  i: number
  ultima: boolean
  actual: number
  frenada: boolean
  abierta: boolean
  onAlternar: () => void
  comentarios: ComentarioEtapa[]
  notas: number
  onFoto: (f: File) => void
  onComentar: (texto: string) => void
  onAbrirFoto: (f: FotoData) => void
}) {
  const id = useId()
  const hecha = i < actual
  const esta = i === actual
  const bloq = esta && frenada
  const pendiente = i > actual
  const estado = hecha ? 'Hecha' : esta ? (bloq ? 'Frenada' : 'En curso') : 'Pendiente'

  return (
    <li className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
      {/* Riel: el tramo de arriba y el de abajo de cada nodo, verde hasta donde llegó el caso. */}
      <span aria-hidden className={cn('absolute top-0 left-[18.5px] h-5 w-[3px]', i === 0 ? 'bg-transparent' : i <= actual ? 'bg-ok' : 'bg-ln')} />
      <span aria-hidden className={cn('absolute top-5 bottom-0 left-[18.5px] w-[3px]', ultima ? 'bg-transparent' : i < actual ? 'bg-ok' : 'bg-ln')} />
      <span
        aria-hidden
        className={cn(
          'relative z-10 mt-0 grid size-10 place-items-center rounded-full border-2 text-[14px] font-bold',
          hecha && 'border-ok bg-ok text-white',
          esta && !bloq && 'latido border-ac bg-acS text-acT',
          bloq && 'border-wa bg-waS text-wa',
          pendiente && 'border-ctl bg-sf text-ink2',
        )}
      >
        {hecha ? <Check className="size-5" strokeWidth={3} /> : bloq ? <Pause className="size-4" strokeWidth={3} /> : esta ? '•' : i + 1}
      </span>

      <div className="min-w-0 pb-3">
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={id}
          onClick={onAlternar}
          className={cn('grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[14px] px-2.5 py-1.5 text-left transition hover:bg-bg2/70', abierta && 'bg-bg2/60')}
        >
          <span className="grid min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <strong className={cn('text-[16px] font-semibold', pendiente && 'text-ink2')}>{e.nombre}</strong>
              <span className={cn('font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase', hecha && 'text-ok', esta && !bloq && 'text-acT', bloq && 'text-wa', pendiente && 'text-ink3')}>{estado}</span>
            </span>
            <span className={cn('truncate text-[13px]', bloq ? 'font-medium text-wa' : 'text-ink3')}>{[e.quien, e.cuando, e.meta].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="flex items-center gap-2.5">
            <Contador icono={MessageSquare} n={comentarios.length} etiqueta="comentarios" />
            <Contador icono={MapPin} n={notas} etiqueta="notas en el escaneo" />
            <Contador icono={Camera} n={e.fotos.length} etiqueta="fotos" />
            <ChevronDown aria-hidden className={cn('size-4 text-ink3 transition-transform duration-200', abierta && 'rotate-180')} />
          </span>
        </button>

        {abierta && (
          <DetalleEtapa id={id} e={e} pendiente={pendiente} comentarios={comentarios} notas={notas} onFoto={onFoto} onComentar={onComentar} onAbrirFoto={onAbrirFoto} className="mt-1.5" />
        )}
      </div>
    </li>
  )
}

/**
 * Lo que pasó en una etapa: resumen, notas del escaneo, comentarios (con su campo) y fotos del avance.
 * Se usa en la lista vertical (debajo de cada etapa) y en la franja de la cabecera (`ancho`: en dos columnas).
 */
export function DetalleEtapa({
  id,
  e,
  pendiente,
  comentarios,
  notas,
  onFoto,
  onComentar,
  onAbrirFoto,
  ancho = false,
  className,
}: {
  id?: string
  e: EtapaRecorrido
  pendiente: boolean
  comentarios: ComentarioEtapa[]
  notas: number
  onFoto: (f: File) => void
  onComentar: (texto: string) => void
  onAbrirFoto: (f: FotoData) => void
  ancho?: boolean
  className?: string
}) {
  const propio = useId()
  id = id ?? propio
  const [borrador, setBorrador] = useState('')
  const enviar = () => {
    if (!borrador.trim()) return
    onComentar(borrador.trim())
    setBorrador('')
  }
  return (
    <div id={id} className={cn('grid gap-3 rounded-[16px] bg-sf2 p-3.5', ancho && 'gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start', className)}>
      <div className="grid gap-3">
      <p className={cn('m-0 text-[15px] leading-snug', pendiente && 'text-ink2')}>{e.texto}</p>

      {notas > 0 && (
        <a href="#escaneo-caso" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-acT">
          <MapPin aria-hidden className="size-4" />
          {notas} {notas === 1 ? 'nota' : 'notas'} sobre el escaneo en esta etapa · Ver en el escaneo
        </a>
      )}

      {!pendiente && (
        <div className="grid gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">Comentarios de la etapa</span>
          {comentarios.length === 0 ? (
            <p className="m-0 text-[14px] text-ink3">Todavía no hay comentarios en esta etapa.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {comentarios.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <Avatar ini={c.ini} className="size-8 text-[12px]" />
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <strong className="text-[14.5px] font-semibold">{c.autor}</strong>
                      <span className="text-[12.5px] text-ink3">
                        {c.rol}, {c.hora}
                      </span>
                      {c.odontologo && <Badge tone="ok" className="text-[11px]">Lo ve el odontólogo</Badge>}
                    </div>
                    <p className="m-0 text-[14.5px] leading-snug">{c.texto}</p>
                    {c.respuestas > 0 && (
                      <a href="#conversacion-caso" className="text-[12.5px] text-acT">
                        {c.respuestas} {c.respuestas === 1 ? 'respuesta' : 'respuestas'} en la conversación
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-com`} className="sr-only">
              Comentar en {e.nombre}
            </label>
            <input
              id={`${id}-com`}
              value={borrador}
              onChange={(ev) => setBorrador(ev.target.value)}
              onKeyDown={(ev) => ev.key === 'Enter' && enviar()}
              placeholder={`Comentar en ${e.nombre}`}
              className="campo min-h-10 w-full px-3 text-[14.5px]"
            />
            <button type="button" aria-label="Enviar comentario" onClick={enviar} disabled={!borrador.trim()} className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ac text-acI shadow-boton transition enabled:hover:-translate-y-0.5 disabled:opacity-40">
              <Send aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      )}

      </div>

      {!pendiente && (
        <div className="grid gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">Fotos del avance</span>
          <div className="flex flex-wrap gap-2">
            {e.fotos.map((f) => (
              <Foto key={f.nombre + (f.src ?? '')} {...f} onAbrir={() => onAbrirFoto(f)} className="h-[84px] w-[116px]" />
            ))}
            {/* Sube una foto de verdad: en el celular abre la cámara. */}
            <label className="focus-within:outline-fo flex h-[84px] w-[116px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-ctl bg-sf text-[13.5px] font-medium text-ink transition hover:-translate-y-0.5 hover:bg-acS focus-within:outline-3 focus-within:outline-offset-2">
              <Camera aria-hidden className="size-5 text-acT" strokeWidth={1.7} />
              Agregar foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(ev) => {
                  const f = ev.target.files?.[0]
                  if (f && esImagen(f)) onFoto(f)
                  ev.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
