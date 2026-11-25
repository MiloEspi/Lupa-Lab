import { CalendarClock, Pause } from 'lucide-react'
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import '../cabecera-caso.css'
import { cn } from '../lib/utils'

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
}

type Props = {
  c: DatosCabecera
  frenado: boolean
  /** Botones al lado de la fecha prometida (hoy, el que abre el pedido del odontólogo). */
  acciones?: ReactNode
}

/**
 * Cabecera del caso. Dos filas, cortas a propósito para que el escaneo entre en la primera pantalla:
 *  - Qué es: código (holográfico, con volumen) + tipo en su color + datos del trabajo; a la derecha,
 *    quién pide, quién paga y el paciente.
 *  - Cómo va, en resumen: la etapa actual con quién la tiene y una barra de avance de solo lectura, más la
 *    fecha prometida en una píldora chica. El proceso completo (nombres, comentarios, fotos, cambios) vive
 *    en el tablero de abajo (`ProcesoCaso`), que es el que se toca.
 * El fondo cuenta lo mismo con luz: el color del tipo a la izquierda, el del estado saliendo de la etapa
 * actual (ámbar si está frenado), el del equipo/entrega al otro lado y un verde que crece con el avance.
 */
export function CabeceraCaso({ c, frenado, acciones }: Props) {
  const tarjeta = useRef<HTMLElement>(null)
  const actual = useRef<HTMLSpanElement>(null)
  const total = c.etapas.length
  const termino = c.etapa >= total
  const avance = total > 1 ? Math.min(c.etapa, total - 1) / (total - 1) : 1
  const aviso = frenado || !!c.alerta
  const nombreActual = c.etapas[Math.min(c.etapa, total - 1)] ?? ''

  // La luz del estado sale de la etapa actual: se mide dónde quedó en la barra y se le pasa al fondo.
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
    '--verde': `${Math.round(10 + avance * 30)}%`,
  } as CSSProperties

  const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-ln/80 bg-sf/70 px-2.5 text-[14px] text-ink'

  return (
    <section ref={tarjeta} aria-label="Resumen del caso" style={estilo} className="vidrio-caso grid gap-4 p-5">
      <div aria-hidden className="fondo-caso">
        <i className="fc-tipo" />
        <i className="fc-medio" />
        <i className="fc-avance" />
        <i className="fc-estado" />
        <i className="fc-grano" />
      </div>

      {/* 1. Qué es */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="m-0 flex items-baseline gap-3">
          <span className="cod cod-holo cod-volumen text-[50px]">{c.codigo}</span>
          <span className="display text-[28px] leading-none font-bold tracking-tight text-acT">{c.tipo.nombre}</span>
        </h1>
        <ul aria-label="Datos del trabajo" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          <li className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-ac/45 bg-acS/85 px-3.5 text-acT shadow-[0_1px_0_rgb(255_255_255/.8)_inset]">
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase">Pieza</span>
            <strong className="display text-[26px] leading-none font-bold">{c.pieza}</strong>
          </li>
          {c.material && <li className={chip}>{c.material}</li>}
          {c.soporte && <li className={chip}>{c.soporte}</li>}
          {c.color && (
            <li className={chip}>
              <span aria-hidden className="size-3.5 rounded-full border border-ink/25" style={{ background: c.color.hex }} />
              <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink2 uppercase">Color</span>
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
              <dt className="font-mono text-[10.5px] tracking-[0.1em] text-ink2 uppercase">{k}</dt>
              <dd className="m-0 font-semibold">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 2. Cómo va, en resumen. La barra es solo para mirar: el proceso completo (nombres, comentarios, fotos) está en el tablero de abajo.
          La etapa actual es el rectángulo; si no entra con todo, se achican los tramos, nunca el texto. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="img"
          aria-label={termino ? 'Todas las etapas están hechas' : `Etapa ${c.etapa + 1} de ${total}: ${nombreActual}${frenado ? ', frenada' : ''}, la tiene ${c.responsable}`}
          className="flex min-w-0 flex-[1_1_520px] items-center gap-1 rounded-[18px] border border-ln/70 bg-sf/60 p-1.5"
        >
          {c.etapas.map((e, i) =>
            i === c.etapa ? (
              <span
                key={`${e}-${i}`}
                ref={actual}
                title={e}
                style={{ '--t': frenado ? 'var(--wa)' : 'var(--ac)' } as CSSProperties}
                className="etapa-actual inline-flex min-h-[54px] flex-none items-center gap-3 rounded-[14px] py-1.5 pr-4 pl-3.5 text-white"
              >
                <span className="grid gap-1">
                  <span className="font-mono text-[10.5px] leading-none tracking-[0.12em] uppercase opacity-95">
                    {frenado ? 'Frenado en' : 'Ahora'} · {i + 1}/{total}
                  </span>
                  <span className="display flex items-center gap-1.5 text-[22px] leading-none font-bold tracking-tight whitespace-nowrap">
                    {frenado && <Pause aria-hidden className="size-4" strokeWidth={3} />}
                    {e}
                  </span>
                </span>
                <span aria-hidden className="h-8 w-px bg-white/35" />
                <span className="flex items-center gap-2 text-[14.5px] whitespace-nowrap">
                  <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[12px] font-semibold">{c.responsable[0]}</span>
                  <span>
                    <strong className="font-semibold">{c.responsable}</strong> lo tiene
                  </span>
                </span>
              </span>
            ) : (
              <span
                key={`${e}-${i}`}
                title={e}
                className={cn(
                  'h-2.5 min-w-3 flex-1 rounded-full',
                  i < c.etapa ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ok)_72%,white),var(--ok))] shadow-[0_1px_0_rgb(255_255_255/.5)_inset]' : 'bg-ctl/30',
                )}
              />
            ),
          )}
          {termino && <span className="px-3 text-[15px] font-semibold text-ok">Todas las etapas hechas</span>}
        </div>

        <div className={cn('flex min-h-11 flex-none items-center gap-2.5 rounded-full border py-1 pr-4 pl-1.5', c.alerta ? 'border-wa/60 bg-waS/90' : 'border-ln/80 bg-sf/75')}>
          <span className={cn('grid size-8 place-items-center rounded-full', c.alerta ? 'bg-wa text-white' : 'bg-acS text-acT')}>
            <CalendarClock aria-hidden className="size-4" strokeWidth={2} />
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2 leading-tight">
            <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink2 uppercase">Prometido</span>
            <strong className={cn('text-[15.5px] font-bold', c.alerta ? 'text-wa' : 'text-ink')}>{c.entrega}</strong>
            <span className={cn('text-[13px]', c.alerta ? 'font-semibold text-wa' : 'text-ink2')}>· {c.alerta ?? c.falta}</span>
          </span>
        </div>
        {acciones}
      </div>
    </section>
  )
}
