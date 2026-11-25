import { CalendarClock, Check, Timer } from 'lucide-react'
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import '../cabecera-caso.css'
import { cn } from '../lib/utils'

/** Un paso de la carga: coincide con una sección del formulario (`id` es el ancla a la que lleva). */
export type PasoCarga = { id: string; texto: string; ok: boolean }

export type DatosNuevoCaso = {
  letra: string
  /** Familia elegida ("Coronas"); sin elegir, la cabecera dice "Nuevo caso". */
  tipo: string | null
  colores?: Record<string, string>
  pieza: string
  material: string
  soporte: string | null
  color: { nombre: string; hex: string } | null
  pide: string
  paga: string
  paciente: string
  pasos: PasoCarga[]
  /** Datos obligatorios que todavía faltan (hay más datos que pasos: el odontólogo y el paciente son dos). */
  faltan: number
  reloj: string
  entrega: string | null
  entregaNota: string
  entregaAviso: boolean
}

type Props = {
  c: DatosNuevoCaso
  completo: boolean
  onIr: (id: string) => void
}

/**
 * Cabecera del caso nuevo: es la misma de un caso ya creado (CabeceraCaso), pero que se arma a medida
 * que se carga el pedido. El código todavía no tiene número, el color de la familia aparece cuando se
 * elige el trabajo, y la barra de avance cuenta los pasos del formulario en vez de las etapas del taller:
 * lo hecho en verde, el paso que toca como rectángulo y lo que sigue en gris. Cada tramo lleva a su sección.
 */
export function CabeceraNuevoCaso({ c, completo, onIr }: Props) {
  const tarjeta = useRef<HTMLElement>(null)
  const actual = useRef<HTMLButtonElement>(null)
  const total = c.pasos.length
  const hechos = c.pasos.filter((p) => p.ok).length
  const idx = c.pasos.findIndex((p) => !p.ok)
  const paso = idx >= 0 ? c.pasos[idx] : null

  // La luz del estado sale del paso actual: se mide dónde quedó en la barra y se le pasa al fondo.
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
  }, [idx, paso?.texto])

  const estilo = {
    ...c.colores,
    '--estado': completo ? '#6FD3A0' : c.entregaAviso ? '#F2A23A' : '#F0B47C',
    '--verde': `${Math.round(10 + (total ? hechos / total : 0) * 30)}%`,
  } as CSSProperties

  const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-ln/80 bg-sf/70 px-2.5 text-[14px] text-ink'

  return (
    <section ref={tarjeta} aria-label="Resumen del pedido" style={estilo} className="vidrio-caso grid gap-4 p-5">
      <div aria-hidden className="fondo-caso">
        <i className="fc-tipo" />
        <i className="fc-medio" />
        <i className="fc-avance" />
        <i className="fc-estado" />
        <i className="fc-grano" />
      </div>

      {/* 1. Qué se está cargando */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="m-0 flex items-baseline gap-3">
          {/* El número se asigna al crearlo: la letra ya es del tipo, el resto son puntos hasta entonces. */}
          <span className="inline-flex items-baseline" title="El número se asigna al crearlo">
            <span className="cod cod-holo cod-volumen text-[50px]">{c.letra}-</span>
            <span aria-label="sin número todavía" className="cod text-[50px] tracking-[0.08em] text-ink3/45">····</span>
          </span>
          <span className={cn('display text-[28px] leading-none font-bold tracking-tight', c.tipo ? 'text-acT' : 'text-ink2')}>{c.tipo ?? 'Nuevo caso'}</span>
        </h1>
        <ul aria-label="Datos del trabajo" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          {c.pieza ? (
            <li className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-ac/45 bg-acS/85 px-3.5 text-acT shadow-[0_1px_0_rgb(255_255_255/.8)_inset]">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase">Pieza</span>
              <strong className="display text-[26px] leading-none font-bold">{c.pieza}</strong>
            </li>
          ) : (
            <li className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-dashed border-ctl/70 bg-sf/40 px-3.5 text-ink3">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase">Pieza</span>
              <span className="display text-[22px] leading-none font-bold">—</span>
            </li>
          )}
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
              <dd className={cn('m-0', v ? 'font-semibold' : 'text-ink3')}>{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 2. Cómo va la carga. El paso que toca es el rectángulo; si no entra con todo, se achican los tramos, nunca el texto. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div role="group" aria-label={completo ? 'Todos los pasos están cargados' : `Paso ${idx + 1} de ${total}: ${paso?.texto}`} className="flex min-w-0 flex-[1_1_520px] items-center gap-1 rounded-[18px] border border-ln/70 bg-sf/60 p-1.5">
          {c.pasos.map((p, i) =>
            i === idx ? (
              <button
                key={p.id}
                ref={actual}
                type="button"
                onClick={() => onIr(p.id)}
                aria-current="step"
                aria-label={`${p.texto}: ir a este paso`}
                style={{ '--t': 'var(--ac)' } as CSSProperties}
                className="etapa-actual inline-flex min-h-[54px] flex-none cursor-pointer items-center gap-3 rounded-[14px] border-0 py-1.5 pr-4 pl-3.5 text-left text-white"
              >
                <span className="grid gap-1">
                  <span className="font-mono text-[10.5px] leading-none tracking-[0.12em] uppercase opacity-95">
                    Ahora · {i + 1}/{total}
                  </span>
                  <span className="display text-[22px] leading-none font-bold tracking-tight whitespace-nowrap">{p.texto}</span>
                </span>
                <span aria-hidden className="h-8 w-px bg-white/35" />
                <span className="flex items-center gap-2 text-[14.5px] whitespace-nowrap">
                  <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[12px] font-semibold">{c.faltan}</span>
                  <span>
                    <strong className="font-semibold">{c.faltan === 1 ? 'Falta 1 dato' : `Faltan ${c.faltan} datos`}</strong>
                  </span>
                </span>
              </button>
            ) : (
              <button key={p.id} type="button" onClick={() => onIr(p.id)} title={p.texto} aria-label={`${p.texto}: ${p.ok ? 'listo' : 'pendiente'}`} className="group grid h-11 min-w-3 flex-1 cursor-pointer place-items-center border-0 bg-transparent p-0">
                <span
                  aria-hidden
                  className={cn(
                    'h-2.5 w-full rounded-full transition duration-200 group-hover:scale-y-150',
                    p.ok ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ok)_72%,white),var(--ok))] shadow-[0_1px_0_rgb(255_255_255/.5)_inset]' : 'bg-ctl/30 group-hover:bg-ctl/50',
                  )}
                />
              </button>
            ),
          )}
          {completo && (
            <span className="flex items-center gap-1.5 px-3 text-[15px] font-semibold whitespace-nowrap text-ok">
              <Check aria-hidden className="size-4" strokeWidth={3} />
              Está todo
            </span>
          )}
        </div>

        <div className={cn('flex min-h-11 flex-none items-center gap-2.5 rounded-full border py-1 pr-4 pl-1.5', c.entregaAviso ? 'border-wa/60 bg-waS/90' : 'border-ln/80 bg-sf/75')}>
          <span className={cn('grid size-8 place-items-center rounded-full', c.entregaAviso ? 'bg-wa text-white' : 'bg-acS text-acT')}>
            <CalendarClock aria-hidden className="size-4" strokeWidth={2} />
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2 leading-tight">
            <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink2 uppercase">Prometido</span>
            <strong className={cn('text-[15.5px] font-bold', c.entregaAviso ? 'text-wa' : c.entrega ? 'text-ink' : 'font-semibold text-ink3')}>{c.entrega ?? 'Elegí el día'}</strong>
            {c.entrega && <span className={cn('text-[13px]', c.entregaAviso ? 'font-semibold text-wa' : 'text-ink2')}>· {c.entregaNota}</span>}
          </span>
        </div>

        <span className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full border border-ln/80 bg-sf/75 px-3 font-mono text-[13px] text-ink2" title="Cuánto llevás cargando este pedido">
          <Timer aria-hidden className="size-4 text-acT" />
          {c.reloj}
        </span>

      </div>
    </section>
  )
}
