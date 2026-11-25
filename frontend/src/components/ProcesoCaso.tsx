import { Camera, Check, MapPin, MessageSquare, Pause, PenLine, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Tablero del proceso: la fila de etapas del caso, en horizontal. Es el lugar donde se mira "cómo va":
 * cada etapa es una tarjeta con su estado en color (hecha, ahora, frenada, pendiente), el nombre completo,
 * quién la hizo y cuándo, y cuántos comentarios, fotos, notas del escaneo y cambios de ficha hubo en ella.
 * Al tocar una etapa se abre su detalle justo debajo (`children`), con una flecha que apunta a ella.
 * La barra chica de la cabecera es solo un resumen; esta es la que se usa.
 */
export type EtapaProceso = {
  nombre: string
  quien: string
  cuando: string
  meta: string
  comentarios: number
  fotos: number
  notas: number
  cambios: number
}

type Estado = 'hecha' | 'ahora' | 'frenada' | 'pendiente'

type Props = {
  etapas: EtapaProceso[]
  /** Índice de la etapa en curso (igual al largo si terminó todas). */
  actual: number
  frenado: boolean
  responsable: string
  seleccionada: number | null
  onElegir: (i: number) => void
  /** Botones de arriba a la derecha (registrar un cambio, terminar la etapa, vista). */
  acciones?: ReactNode
  /** Detalle de la etapa elegida. */
  children?: ReactNode
}

/** Lo que se cuenta en cada etapa: cada cosa con su ícono y su color propio (nunca solo color: va con ícono y número). */
const CONTADORES = {
  comentarios: { icono: MessageSquare, uno: 'comentario', varios: 'comentarios', clase: 'bg-[#E4EBFB] text-[#1A4BB5]' },
  fotos: { icono: Camera, uno: 'foto', varios: 'fotos', clase: 'bg-[#D9EFF3] text-[#08586F]' },
  notas: { icono: MapPin, uno: 'nota en el escaneo', varios: 'notas en el escaneo', clase: 'bg-[#F6E3EE] text-[#8A2760]' },
  cambios: { icono: PenLine, uno: 'cambio de ficha', varios: 'cambios de ficha', clase: 'bg-waS text-wa' },
} as const satisfies Record<string, { icono: LucideIcon; uno: string; varios: string; clase: string }>

type TipoContador = keyof typeof CONTADORES

function Conteo({ tipo, n, sobreColor = false, grande = false }: { tipo: TipoContador; n: number; sobreColor?: boolean; grande?: boolean }) {
  const { icono: Icono, uno, varios, clase } = CONTADORES[tipo]
  const nombre = n === 1 ? uno : varios
  return (
    <span
      title={`${n} ${nombre}`}
      className={cn('inline-flex items-center gap-1 rounded-full font-semibold', grande ? 'min-h-8 px-3 text-[14px]' : 'min-h-6 px-2 text-[12.5px]', sobreColor ? 'bg-white/22 text-white' : clase)}
    >
      <Icono aria-hidden className={grande ? 'size-4' : 'size-3.5'} strokeWidth={2.2} />
      {n}
      <span className="sr-only">{nombre}</span>
    </span>
  )
}

const ESTILO: Record<Estado, { tarjeta: string; rotulo: string; texto: string; nombre: string; barra: string; nodo: string }> = {
  // Hecha: verde suave pero con cuerpo. Texto en tinta (>= 10:1 sobre el verde claro) y rótulo en --ok (>= 5:1).
  hecha: {
    tarjeta: 'border-ok/45 bg-[linear-gradient(170deg,color-mix(in_srgb,var(--ok)_17%,white),color-mix(in_srgb,var(--ok)_7%,var(--sf)))] shadow-[0_1px_0_rgb(255_255_255/.8)_inset] hover:border-ok/75',
    rotulo: 'Hecha',
    texto: 'text-ok',
    nombre: 'text-ink',
    barra: 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ok)_72%,white),var(--ok))] shadow-[0_1px_0_rgb(255_255_255/.5)_inset]',
    nodo: 'bg-ok text-white',
  },
  ahora: { tarjeta: 'etapa-actual border-transparent text-white', rotulo: 'Ahora', texto: 'text-white', nombre: 'text-white', barra: 'pc-barra-viva', nodo: 'latido bg-ac text-white' },
  frenada: { tarjeta: 'etapa-actual border-transparent text-white', rotulo: 'Frenada', texto: 'text-white', nombre: 'text-white', barra: 'pc-barra-viva', nodo: 'bg-wa text-white' },
  pendiente: {
    tarjeta: 'border-dashed border-ctl/55 bg-sf/55 hover:border-ctl hover:bg-sf/85',
    rotulo: 'Pendiente',
    texto: 'text-ink2',
    nombre: 'text-ink2',
    barra: 'bg-ctl/25',
    nodo: 'border-2 border-ctl/70 bg-sf text-ink2',
  },
}

export function ProcesoCaso({ etapas, actual, frenado, responsable, seleccionada, onElegir, acciones, children }: Props) {
  const total = etapas.length
  const lista = useRef<HTMLOListElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [flecha, setFlecha] = useState<number | null>(null)

  const estadoDe = (i: number): Estado => (i < actual ? 'hecha' : i === actual ? (frenado ? 'frenada' : 'ahora') : 'pendiente')
  const suma = (k: TipoContador) => etapas.reduce((s, e) => s + e[k], 0)
  const hayDetalle = seleccionada !== null && !!children

  // Al entrar, la etapa actual queda a la vista aunque la fila no entre entera (notebook, celular).
  useEffect(() => {
    const ol = lista.current
    const li = ol?.children[Math.min(actual, total - 1)] as HTMLElement | undefined
    if (!ol || !li) return
    ol.scrollLeft = Math.max(0, li.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2)
  }, [actual, total])

  // La flecha del detalle apunta al centro de la etapa elegida.
  useLayoutEffect(() => {
    const c = caja.current
    const li = seleccionada === null ? undefined : (lista.current?.children[seleccionada] as HTMLElement | undefined)
    if (!c || !li) return setFlecha(null)
    const medir = () => {
      const rc = c.getBoundingClientRect()
      const rl = li.getBoundingClientRect()
      setFlecha(rl.left + rl.width / 2 - rc.left)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(c)
    lista.current?.addEventListener('scroll', medir, { passive: true })
    const ol = lista.current
    return () => {
      ro.disconnect()
      ol?.removeEventListener('scroll', medir)
    }
  }, [seleccionada, total, hayDetalle])

  return (
    <section id="proceso-caso" aria-label="Proceso del caso" data-tono="base" className="lamina proceso-caso grid scroll-mt-4 gap-3.5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="grid gap-0.5">
          <h2 className="m-0 text-[20px] leading-tight font-bold">Proceso del caso</h2>
          <span className="text-[14px] text-ink2">
            Va por la etapa {Math.min(actual + 1, total)} de {total}, {Math.min(actual, total)} {actual === 1 ? 'hecha' : 'hechas'}. Tocá una etapa para ver sus comentarios, fotos y cambios.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">{acciones}</div>
      </div>

      <div ref={caja} className="relative grid gap-0">
        <ol
          ref={lista}
          aria-label={`Etapas del caso. Va por la ${Math.min(actual + 1, total)} de ${total}`}
          className="pc-fila m-0 grid list-none gap-2 overflow-x-auto p-1.5 pb-3"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(122px, 1fr))` } as CSSProperties}
        >
          {etapas.map((e, i) => {
            const estado = estadoDe(i)
            const s = ESTILO[estado]
            const elegida = seleccionada === i
            const sobre = estado === 'ahora' || estado === 'frenada'
            const pendiente = estado === 'pendiente'
            const quien = estado === 'ahora' || estado === 'frenada' ? responsable : e.quien
            return (
              <li key={`${e.nombre}-${i}`} className="flex min-w-0 flex-col" style={estado === 'frenada' ? ({ '--t': 'var(--wa)' } as CSSProperties) : estado === 'ahora' ? ({ '--t': 'var(--ac)' } as CSSProperties) : undefined}>
                {/* Riel: las piezas se tocan y forman una sola barra de progreso; el nodo marca cada etapa. */}
                <span aria-hidden className="relative -mx-1 flex h-9 items-center">
                  <span className={cn('h-3 w-full', i === 0 && 'ml-1 rounded-l-full', i === total - 1 && 'mr-1 rounded-r-full', s.barra)} />
                  <span className={cn('absolute left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full text-[14px] font-bold ring-[3px] ring-[color-mix(in_srgb,var(--sf)_92%,white)]', s.nodo)}>
                    {estado === 'hecha' ? <Check className="size-[18px]" strokeWidth={3} /> : estado === 'frenada' ? <Pause className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onElegir(i)}
                  aria-pressed={elegida}
                  style={estado === 'frenada' ? ({ '--t': 'var(--wa)' } as CSSProperties) : estado === 'ahora' ? ({ '--t': 'var(--ac)' } as CSSProperties) : undefined}
                  aria-label={`${e.nombre}, etapa ${i + 1} de ${total}, ${s.rotulo.toLowerCase()}. ${[quien, e.cuando].filter(Boolean).join(', ')}. ${e.comentarios} comentarios, ${e.fotos} fotos, ${e.notas} notas en el escaneo, ${e.cambios} cambios de ficha.`}
                  className={cn(
                    'pc-etapa relative mx-0.5 flex min-h-[132px] min-w-0 flex-1 flex-col gap-2 rounded-[18px] border p-2.5 text-left transition duration-200 hover:-translate-y-0.5',
                    s.tarjeta,
                    elegida && 'outline-[3px] outline-offset-2 outline-ink',
                  )}
                >
                  <span className={cn('font-mono text-[11.5px] font-semibold tracking-[0.1em] uppercase', s.texto)}>{s.rotulo}</span>

                  <strong className={cn('display text-[16.5px] leading-[1.15] font-bold tracking-tight [text-wrap:balance]', s.nombre)}>{e.nombre}</strong>

                  <span className={cn('grid gap-0.5 text-[13px] leading-tight', sobre ? 'text-white/95' : 'text-ink2')}>
                    <span className="font-semibold [overflow-wrap:break-word]">{quien}</span>
                    <span className="[overflow-wrap:break-word]">{[e.cuando, e.meta].filter(Boolean).join(' · ')}</span>
                  </span>

                  <span className="mt-auto flex flex-wrap gap-1 pt-0.5">
                    {e.comentarios > 0 && <Conteo tipo="comentarios" n={e.comentarios} sobreColor={sobre} />}
                    {e.fotos > 0 && <Conteo tipo="fotos" n={e.fotos} sobreColor={sobre} />}
                    {e.notas > 0 && <Conteo tipo="notas" n={e.notas} sobreColor={sobre} />}
                    {e.cambios > 0 && <Conteo tipo="cambios" n={e.cambios} sobreColor={sobre} />}
                    {!pendiente && !e.comentarios && !e.fotos && !e.notas && !e.cambios && <span className={cn('text-[12.5px]', sobre ? 'text-white/85' : 'text-ink2')}>Sin novedades</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {hayDetalle && (
          <div className="entra relative mt-2.5 rounded-[18px] border border-ln bg-sf/90 p-3.5 shadow-[0_14px_30px_-20px_rgb(24_32_44/.4)] sm:p-4">
            {flecha !== null && (
              <span
                aria-hidden
                className="absolute -top-[8px] size-4 rotate-45 rounded-[4px] border-t border-l border-ln bg-sf"
                style={{ left: Math.max(24, flecha - 8) }}
              />
            )}
            {children}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ln/70 pt-3">
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink2 uppercase">En todo el caso</span>
        <Conteo tipo="comentarios" n={suma('comentarios')} grande />
        <Conteo tipo="fotos" n={suma('fotos')} grande />
        <Conteo tipo="notas" n={suma('notas')} grande />
        <Conteo tipo="cambios" n={suma('cambios')} grande />
      </div>
    </section>
  )
}
