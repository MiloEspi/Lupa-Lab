import { ArrowRight, CalendarClock, Pause } from 'lucide-react'
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import '../cabecera-caso.css'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

/** Lo que muestra la cabecera, ya armado desde el caso de la API (ver pantallas/caso.tsx). */
export type DatosCabecera = {
  codigo: string
  tipo: { nombre: string; colores?: Record<string, string> }
  pieza: string
  material: string
  soporte: string | null
  color: { nombre: string; hex: string } | null
  pide: string
  paga: string
  paciente: string
  etapas: string[]
  /** Índice de la etapa actual (igual al largo si terminó todas). */
  etapa: number
  responsable: string
  entrega: string
  alerta?: string
  falta: string
  frenado?: string
  /** Si está en revisión técnica, a dónde ir. */
  revision?: string
}

type Props = {
  c: DatosCabecera
  frenado: boolean
  /** Etapa abierta (su detalle se ve debajo de la cabecera). */
  seleccionada?: number | null
  /** Si viene, cada etapa de la franja es un botón que la abre. */
  onElegir?: (i: number) => void
  /** Algo para la fila de abajo, a la derecha (por ejemplo, el selector de vista del recorrido). */
  accion?: ReactNode
}

/**
 * Cabecera del caso (opción C, elegida el 13/11). Dos franjas:
 *  - Arriba, qué es: código (holográfico, con volumen) + tipo en su color + datos del trabajo; a la derecha,
 *    quién pide, quién paga y el paciente.
 *  - Abajo, cómo va: la franja de etapas ES el estado. La etapa actual se abre ("Ahora · 5/9", nombre en
 *    grande y quién la tiene); al lado, la fecha prometida con su ícono.
 * El fondo cuenta lo mismo con luz: el color del tipo arriba a la izquierda, el del estado saliendo de la
 * etapa actual (ámbar si está frenado) y un verde arriba a la derecha que crece cuanto más cerca del final.
 */
export function CabeceraCaso({ c, frenado, seleccionada = null, onElegir, accion }: Props) {
  const tarjeta = useRef<HTMLElement>(null)
  const actual = useRef<HTMLLIElement>(null)
  const total = c.etapas.length
  const avance = total > 1 ? Math.min(c.etapa, total - 1) / (total - 1) : 1
  const aviso = frenado || !!c.alerta

  // La luz del estado sale de la etapa actual: se mide dónde quedó y se le pasa al fondo.
  useLayoutEffect(() => {
    const t = tarjeta.current
    const a = actual.current
    if (!t || !a) return
    const medir = () => {
      const rt = t.getBoundingClientRect()
      const ra = a.getBoundingClientRect()
      t.style.setProperty('--ex', `${ra.left + ra.width / 2 - rt.left}px`)
      t.style.setProperty('--ey', `${ra.top + ra.height / 2 - rt.top}px`)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(t)
    return () => ro.disconnect()
  }, [c.etapa, frenado])

  const estilo = {
    ...c.tipo.colores,
    '--estado': aviso ? '#F2A23A' : '#F0B47C',
    '--verde': `${Math.round(6 + avance * 26)}%`,
  } as CSSProperties

  const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-ln/80 bg-sf/70 px-2.5 text-[14px] text-ink'

  return (
    <section ref={tarjeta} aria-label="Resumen del caso" style={estilo} className="vidrio-caso grid gap-4 p-5">
      <div aria-hidden className="fondo-caso">
        <i className="fc-tipo" />
        <i className="fc-avance" />
        <i className="fc-estado" />
      </div>

      {/* 1. Qué es */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="m-0 flex items-baseline gap-3">
          <span className="cod cod-holo cod-volumen text-[50px]">{c.codigo}</span>
          <span className="display text-[28px] leading-none font-bold tracking-tight text-acT">{c.tipo.nombre}</span>
        </h1>
        <ul aria-label="Datos del trabajo" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          <li className={chip}>
            <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink3 uppercase">Pieza</span>
            <strong className="font-semibold">{c.pieza}</strong>
          </li>
          {c.material && <li className={chip}>{c.material}</li>}
          {c.soporte && <li className={chip}>{c.soporte}</li>}
          {c.color && (
            <li className={chip}>
              <span aria-hidden className="size-3.5 rounded-full border border-ink/25" style={{ background: c.color.hex }} />
              <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink3 uppercase">Color</span>
              <strong className="font-semibold">{c.color.nombre}</strong>
            </li>
          )}
        </ul>
        <dl className="m-0 ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[14.5px]">
          {[
            ['Pide', c.pide],
            ['Paga', c.paga],
            ['Paciente', c.paciente],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5">
              <dt className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">{k}</dt>
              <dd className="m-0 font-semibold">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 2. Cómo va: la franja de etapas es el estado. */}
      <div className="cc-cont">
        <div className="cc-grid">
          <ol aria-label={`Etapas del caso. Va por la ${Math.min(c.etapa + 1, total)} de ${total}`} className="cc-franja m-0 flex min-w-0 list-none items-stretch gap-1 rounded-[18px] border border-ln/70 bg-sf/55 p-1.5">
            {c.etapas.map((e, i) => {
              const elegida = seleccionada === i
              const estado = i < c.etapa ? 'hecha' : i === c.etapa ? (frenado ? 'frenada' : 'en curso') : 'pendiente'
              if (i === c.etapa)
                return (
                  <li key={`${e}-${i}`} ref={actual} className="flex flex-none">
                    <Celda
                      onClick={onElegir && (() => onElegir(i))}
                      elegida={elegida}
                      etiqueta={`${e}, ${estado}, la tiene ${c.responsable}`}
                      style={{ '--t': frenado ? 'var(--wa)' : 'var(--ac)' } as CSSProperties}
                      className={cn('etapa-actual inline-flex min-h-[54px] items-center gap-3 rounded-[14px] py-1.5 pr-4 pl-3.5 text-left text-white', elegida && 'outline-2 outline-offset-2 outline-[var(--t)]')}
                    >
                      <span className="grid gap-1">
                        <span className="font-mono text-[10.5px] leading-none tracking-[0.12em] uppercase opacity-90">
                          {frenado ? 'Frenado en' : 'Ahora'} · {i + 1}/{total}
                        </span>
                        <span className="display flex items-center gap-1.5 text-[22px] leading-none font-bold tracking-tight">
                          {frenado && <Pause className="size-4" strokeWidth={3} />}
                          {e}
                        </span>
                      </span>
                      <span className="h-8 w-px bg-white/35" />
                      <span className="flex items-center gap-2 text-[14.5px]">
                        <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[12px] font-semibold">{c.responsable[0]}</span>
                        <span>
                          <strong className="font-semibold">{c.responsable}</strong> lo tiene
                        </span>
                      </span>
                    </Celda>
                  </li>
                )
              return (
                <li key={`${e}-${i}`} className="flex min-w-0 flex-1">
                  <Celda
                    onClick={onElegir && (() => onElegir(i))}
                    elegida={elegida}
                    etiqueta={`${e}, ${estado}`}
                    className={cn(
                      'grid w-full min-w-0 content-center gap-1.5 rounded-[11px] px-1.5 py-1 text-left transition',
                      onElegir && 'hover:bg-sf/85',
                      elegida && 'bg-sf shadow-[0_1px_0_rgb(255_255_255/.9)_inset,0_6px_14px_-8px_rgb(24_32_44/.4),0_0_0_1.5px_var(--ac)]',
                    )}
                  >
                    <span className={cn('h-1.5 rounded-full', i < c.etapa ? 'bg-ac/75' : 'bg-ctl/25')} />
                    <span className={cn('truncate text-[11.5px] leading-tight', elegida ? 'font-semibold text-acT' : i < c.etapa ? 'text-ink2' : 'text-ink3')}>{e}</span>
                  </Celda>
                </li>
              )
            })}
          </ol>

          <div className={cn('cc-fecha flex items-center gap-3 rounded-[18px] border px-3.5 py-2', c.alerta ? 'border-wa/60 bg-waS/90' : 'border-ln/80 bg-sf/70')}>
            <span className={cn('grid size-10 place-items-center rounded-[12px]', c.alerta ? 'bg-wa text-white' : 'bg-acS text-acT')}>
              <CalendarClock aria-hidden className="size-5" strokeWidth={1.9} />
            </span>
            <span className="grid gap-0.5">
              <span className="font-mono text-[10.5px] leading-none tracking-[0.1em] text-ink3 uppercase">Prometido</span>
              <strong className={cn('text-[19px] leading-tight font-bold', c.alerta ? 'text-wa' : 'text-ink')}>{c.entrega}</strong>
              <span className={cn('text-[12.5px] leading-none', c.alerta ? 'font-semibold text-wa' : 'text-ink2')}>{c.alerta ?? c.falta}</span>
            </span>
          </div>

          <span className="cc-nota flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[14px]">
            {frenado && c.frenado && (
              <span className="text-wa">
                <strong className="font-semibold">Frenado:</strong> {c.frenado.toLowerCase()}
              </span>
            )}
            {onElegir && <span className="text-[13px] text-ink3">Tocá una etapa para ver qué pasó en ella.</span>}
          </span>
          <span className="cc-vista flex flex-wrap items-center justify-end gap-2">
            {c.revision && (
              <Button variant="ink" className="min-h-10 px-3.5 text-[14px]" asChild>
                <Link to={c.revision}>
                  Ir a la revisión técnica
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            )}
            {accion}
          </span>
        </div>
      </div>
    </section>
  )
}

/** Una etapa de la franja: botón si se puede abrir, texto si no. */
function Celda({ onClick, elegida, etiqueta, className, style, children }: { onClick?: () => void; elegida: boolean; etiqueta: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  if (!onClick)
    return (
      <span title={etiqueta} className={className} style={style}>
        <span className="sr-only">{etiqueta}</span>
        <span aria-hidden className="contents">
          {children}
        </span>
      </span>
    )
  return (
    <button type="button" onClick={onClick} aria-pressed={elegida} aria-label={etiqueta} title={etiqueta} className={className} style={style}>
      {children}
    </button>
  )
}
