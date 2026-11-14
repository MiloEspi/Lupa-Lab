import { CalendarClock, Check, ChevronDown, FileStack, FileText } from 'lucide-react'
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import '../cabecera-caso.css'
import { MiniOdontograma } from './ui/mini-odontograma'
import { describirPieza } from '../lib/casos'
import { cn } from '../lib/utils'

export type Marca = 'ok' | 'falta' | 'duda' | ''
export type DecisionRevision = 'aprobar' | 'consulta' | 'pedir'

/** Lo que muestra la cabecera, ya armado desde el caso de la API (ver pantallas/revision.tsx). */
export type DatosRevision = {
  codigo: string
  tipo: { nombre: string; colores?: Record<string, string> }
  material: string
  soporte: string | null
  color: { nombre: string; hex: string } | null
  pide: string
  clinica: string
  matricula: string
  paciente: string
  orden: { codigo: string; estado: string } | null
  archivos: string
  piezas: string[]
  entrega: string
  falta: string
  alerta?: string
  /** Quién revisa (la persona con la sesión). */
  revisa: string
}

type Props = {
  c: DatosRevision
  /** Cómo está cada punto del checklist. */
  marcas: Marca[]
  /** Si ya se decidió, qué. */
  decidido?: DecisionRevision
  verArchivos: boolean
  onVerArchivos: () => void
  /** Botones (ver la ficha, hablar con el odontólogo). */
  acciones?: ReactNode
  /** A la derecha de la fila de abajo: el tamaño del escaneo. */
  accion?: ReactNode
  /** Lo que se despliega dentro de la tarjeta (el detalle de los archivos). */
  children?: ReactNode
}

const PUNTO: Record<Marca, string> = { ok: 'bg-[#7EE2A8]', falta: 'bg-[#FF9C94]', duda: 'bg-[#FFD27A]', '': 'bg-white/30' }
const TONO_DECISION: Record<DecisionRevision, string> = { aprobar: 'var(--ok)', consulta: 'var(--wa)', pedir: 'var(--ba)' }
const TEXTO_DECISION: Record<DecisionRevision, string> = { aprobar: 'Aprobado', consulta: 'Aprobado con nota', pedir: 'En espera' }

/**
 * Cabecera de la revisión técnica con la misma lógica que la del caso (opción C):
 *  1. Qué es: código holográfico + tipo en su color + material, soporte y color de la guía.
 *  2. De quién: odontólogo, clínica, matrícula, paciente; la orden y los archivos.
 *  3. Cómo va la revisión: los tres pasos en una franja; el actual se abre (en el checklist, con un punto
 *     por ítem: verde bien, rojo falta, ámbar duda) y al lado la fecha de entrega.
 *  A la derecha, la pieza en el odontograma. El fondo: tipo arriba a la izquierda, luz cálida que sale del
 *  paso actual (ámbar si vence pronto) y verde que crece a medida que se completa el checklist.
 */
export function CabeceraRevision({ c, marcas, decidido, verArchivos, onVerArchivos, acciones, accion, children }: Props) {
  const tipo = c.tipo
  const pieza = c.piezas[0] ?? '—'
  const hechos = marcas.filter(Boolean).length
  const pasos = [
    { n: '01', t: 'Mirar el escaneo', listo: true },
    { n: '02', t: 'Checklist', listo: hechos === marcas.length },
    { n: '03', t: 'Decidir', listo: !!decidido },
  ]
  const actualI = decidido ? 2 : pasos.findIndex((p) => !p.listo)
  const avance = decidido ? 1 : marcas.length ? hechos / marcas.length : 0

  const tarjeta = useRef<HTMLElement>(null)
  const actual = useRef<HTMLLIElement>(null)
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
  }, [actualI])

  const estilo = {
    ...tipo.colores,
    '--estado': c.alerta ? '#F2A23A' : '#F0B47C',
    '--verde': `${Math.round(6 + avance * 30)}%`,
  } as CSSProperties
  const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-ln/80 bg-sf/70 px-2.5 text-[14px] text-ink'
  const rotulo = 'font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase'

  return (
    <section ref={tarjeta} aria-label="Caso en revisión" style={estilo} className="vidrio-caso grid gap-4 p-5">
      <div aria-hidden className="fondo-caso">
        <i className="fc-tipo" />
        <i className="fc-avance" />
        <i className="fc-estado" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_236px]">
        <div className="grid min-w-0 content-start gap-3.5">
          {/* 1. Qué es */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <h1 className="m-0 flex items-baseline gap-3">
              <span className="cod cod-holo cod-volumen text-[50px]">{c.codigo}</span>
              <span className="display text-[28px] leading-none font-bold tracking-tight text-acT">{tipo.nombre}</span>
            </h1>
            <ul aria-label="Datos del trabajo" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
              {c.material && <li className={chip}>{c.material}</li>}
              {c.soporte && <li className={chip}>{c.soporte}</li>}
              {c.color && (
                <li className={chip}>
                  <span aria-hidden className="size-3.5 rounded-full border border-ink/25" style={{ background: c.color.hex }} />
                  <span className={rotulo}>Color</span>
                  <strong className="font-semibold">{c.color.nombre}</strong>
                </li>
              )}
            </ul>
          </div>

          {/* 2. De quién, orden y archivos */}
          <dl className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[14.5px]">
            <div className="flex items-baseline gap-1.5">
              <dt className={rotulo}>Pide</dt>
              <dd className="m-0 font-semibold">{c.pide}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={rotulo}>Clínica</dt>
              <dd className="m-0 font-semibold">{c.clinica}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={rotulo}>M.P.</dt>
              <dd className="m-0 font-mono text-[13.5px]">{c.matricula || '—'}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={rotulo}>Paciente</dt>
              <dd className="m-0 font-semibold">
                {c.paciente} <span className="text-[12.5px] font-normal text-ink3">solo iniciales</span>
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={cn(rotulo, 'flex items-center gap-1 self-center')}>
                <FileText aria-hidden className="size-3.5 text-acT" />
                Orden
              </dt>
              <dd className="m-0 font-semibold">
                {c.orden ? (
                  <>
                    {c.orden.codigo} <span className="text-[13px] font-medium text-ok">{c.orden.estado}</span>
                  </>
                ) : (
                  <span className="font-medium text-ink3">sin orden</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={cn(rotulo, 'flex items-center gap-1 self-center')}>
                <FileStack aria-hidden className="size-3.5 text-acT" />
                Archivos
              </dt>
              <dd className="m-0">
                <button type="button" aria-expanded={verArchivos} aria-controls="archivos-pedido" onClick={onVerArchivos} className="-my-1 inline-flex min-h-8 items-center gap-1 rounded-lg font-semibold text-acT hover:underline">
                  {c.archivos} · {verArchivos ? 'ocultar' : 'ver detalle'}
                  <ChevronDown aria-hidden className={cn('size-4 transition-transform duration-200', verArchivos && 'rotate-180')} />
                </button>
              </dd>
            </div>
          </dl>

          {/* 3. Cómo va la revisión: los pasos son el estado */}
          <div className="cc-cont">
            <div className="cc-grid">
              <ol aria-label={`Pasos de la revisión. Va por el ${actualI + 1} de 3`} className="cc-franja m-0 flex min-w-0 list-none items-stretch gap-1 rounded-[18px] border border-ln/70 bg-sf/55 p-1.5">
                {pasos.map((p, i) => {
                  if (i === actualI)
                    return (
                      <li key={p.n} ref={actual} aria-current="step" className="flex flex-none">
                        <span
                          style={{ '--t': decidido ? TONO_DECISION[decidido] : 'var(--ac)' } as CSSProperties}
                          className="etapa-actual inline-flex min-h-[54px] items-center gap-3 rounded-[14px] py-1.5 pr-4 pl-3.5 text-white"
                        >
                          <span className="grid gap-1">
                            <span className="font-mono text-[10.5px] leading-none tracking-[0.12em] uppercase opacity-90">
                              {decidido ? 'Revisión hecha' : `Ahora · ${i + 1}/3`}
                            </span>
                            <span className="display text-[22px] leading-none font-bold tracking-tight">
                              {decidido ? TEXTO_DECISION[decidido] : p.n === '02' ? `Checklist ${hechos}/${marcas.length}` : p.t}
                            </span>
                          </span>
                          {!decidido && p.n === '02' && (
                            <span aria-hidden className="flex gap-1" title="Bien · falta · con duda · sin revisar">
                              {marcas.map((m, j) => (
                                <span key={j} className={cn('h-5 w-1.5 rounded-full', PUNTO[m])} />
                              ))}
                            </span>
                          )}
                          <span className="h-8 w-px bg-white/35" />
                          <span className="flex items-center gap-2 text-[14.5px]">
                            <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[12px] font-semibold">{c.revisa.slice(0, 1).toUpperCase()}</span>
                            <span>
                              <strong className="font-semibold">{c.revisa}</strong> revisa
                            </span>
                          </span>
                        </span>
                      </li>
                    )
                  const hecho = i < actualI || p.listo
                  return (
                    <li key={p.n} className="grid min-w-0 flex-1 content-center gap-1.5 rounded-[11px] px-2 py-1">
                      <span className={cn('h-1.5 rounded-full', hecho ? 'bg-ok/70' : 'bg-ctl/25')} />
                      <span className={cn('flex items-center gap-1 truncate text-[12px] leading-tight', hecho ? 'text-ok' : 'text-ink3')}>
                        {hecho ? <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={3} /> : <span className="font-mono text-[10.5px]">{p.n}</span>}
                        {p.t}
                        <span className="sr-only">{hecho ? ', hecho' : ', pendiente'}</span>
                      </span>
                    </li>
                  )
                })}
              </ol>

              <div className={cn('cc-fecha flex items-center gap-3 rounded-[18px] border px-3.5 py-2', c.alerta ? 'border-wa/60 bg-waS/90' : 'border-ln/80 bg-sf/70')}>
                <span className={cn('grid size-10 place-items-center rounded-[12px]', c.alerta ? 'bg-wa text-white' : 'bg-acS text-acT')}>
                  <CalendarClock aria-hidden className="size-5" strokeWidth={1.9} />
                </span>
                <span className="grid gap-0.5">
                  <span className={cn(rotulo, 'leading-none')}>Entrega</span>
                  <strong className={cn('text-[19px] leading-tight font-bold', c.alerta ? 'text-wa' : 'text-ink')}>{c.entrega}</strong>
                  <span className={cn('text-[12.5px] leading-none', c.alerta ? 'font-semibold text-wa' : 'text-ink2')}>{c.alerta ?? c.falta}</span>
                </span>
              </div>

              <span className="cc-vista flex flex-wrap items-center justify-end gap-2">{accion}</span>
            </div>
          </div>
        </div>

        {/* La pieza: número grande y dónde está en la boca. Debajo, las acciones del caso. */}
        <div className="grid content-between gap-2.5">
        <div className="grid content-center gap-2 rounded-[18px] border border-ln/70 bg-sf/60 p-3.5 shadow-[0_1px_0_rgb(255_255_255/.8)_inset] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <span className={rotulo}>Pieza a trabajar</span>
            <span className="cod cod-holo text-[42px]">{pieza}</span>
          </div>
          <MiniOdontograma piezas={c.piezas} />
          <span className="text-[13px] leading-snug text-ink2">{describirPieza(pieza)}</span>
        </div>
        {acciones && <div className="grid gap-2 [&>*]:w-full [&>*]:justify-center">{acciones}</div>}
        </div>
      </div>

      {children}
    </section>
  )
}
