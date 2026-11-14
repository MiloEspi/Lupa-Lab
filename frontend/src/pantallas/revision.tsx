/**
 * Revisión técnica (S12): la bandeja y la pantalla de revisión del prototipo con datos reales.
 * El checklist sale de la plantilla del ítem del catálogo; las reglas (todo marcado, "Falta" no
 * deja aprobar, "pedir" deja el caso en espera) las vuelve a chequear el backend.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, ArrowDown, ArrowRight, CalendarClock, Check, CheckCheck, CircleHelp, Clock3, FileBox, FileText, Hourglass, Image as ImageIcon, Info, LayoutList, MessageSquareWarning, PackageCheck, Stethoscope, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, pedir, type Esquemas } from '../api/cliente'
import { CabeceraRevision, type DatosRevision, type DecisionRevision, type Marca } from '../components/CabeceraRevision'
import { PanelEscaneo } from '../components/PanelEscaneo'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { BarraFlotante, Rotulo } from '../components/ui/flotante'
import { Segmented } from '../components/ui/segmented'
import { coloresDeFamilia, estadoCaso, fechaCorta, habilesHasta, piezasDe, TONOS_VITA, type Caso } from '../lib/casos'
import { cuando, useEscaneo } from '../lib/escaneo'
import { useYo } from '../lib/sesion'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'

type EstadoRevision = Esquemas['EstadoRevision']

type TamanoEscaneo = 'lado' | 'ancho' | 'foco'
const CLAVE_TAM = 'ocludent.revision.tamano-escaneo.v2'
const TAMANOS: { id: TamanoEscaneo; label: string; ayuda: string; alto: string }[] = [
  { id: 'lado', label: 'Al lado', ayuda: 'Escaneo y checklist juntos, para revisar y marcar sin scrollear.', alto: 'clamp(480px, calc(100vh - 220px), 760px)' },
  { id: 'ancho', label: 'Ancho', ayuda: 'El escaneo usa todo el ancho y más alto; el checklist y la decisión quedan abajo, lado a lado.', alto: 'clamp(520px, 78vh, 860px)' },
  { id: 'foco', label: 'Enfoque', ayuda: 'Escaneo a pantalla alta y sin panel de notas (las marcas siguen sobre el escaneo). El checklist está abajo.', alto: 'max(560px, calc(100vh - 150px))' },
]

const ESTADO: Record<Marca, { texto: string; clase: string }> = {
  ok: { texto: 'Bien', clase: 'text-ok' },
  falta: { texto: 'Falta', clase: 'text-ba' },
  duda: { texto: 'Con duda', clase: 'text-wa' },
  '': { texto: 'Sin revisar', clase: 'text-ink3' },
}

type Tono = 'ok' | 'wa' | 'ba'
const OPCIONES: { id: DecisionRevision; t: string; s: string; tono: Tono; Icono: typeof CheckCheck }[] = [
  { id: 'aprobar', t: 'Aprobar y pasar a diseño', s: 'Entra a la bandeja de CAD con tus marcas sobre el escaneo.', tono: 'ok', Icono: CheckCheck },
  { id: 'consulta', t: 'Aprobar con nota técnica', s: 'Pasa a diseño; la duda queda marcada en el escaneo para CAD.', tono: 'wa', Icono: MessageSquareWarning },
  { id: 'pedir', t: 'Pedir lo que falta', s: 'Queda en espera del odontólogo hasta que llegue.', tono: 'ba', Icono: Hourglass },
]
const BOTON: Record<DecisionRevision, string> = { aprobar: 'Aprobar y pasar a diseño', pedir: 'Pedir por WhatsApp y dejar en espera', consulta: 'Aprobar con nota técnica' }
const RESULTADO: Record<DecisionRevision, { titulo: string; detalle: string; tono: Tono }> = {
  aprobar: { titulo: 'Aprobado: pasó a la bandeja de diseño', detalle: 'CAD lo ve con tus marcas sobre el escaneo.', tono: 'ok' },
  consulta: { titulo: 'Aprobado con nota técnica: pasó a diseño', detalle: 'CAD ve la duda marcada en el escaneo y en el caso.', tono: 'wa' },
  pedir: { titulo: 'En espera del odontólogo', detalle: 'El caso no avanza hasta que llegue lo que falta.', tono: 'ba' },
}

const ORIGEN: Record<string, string> = { papel: 'Papel', caja: 'En la caja', digital: 'Digital' }

/** Los casos con algún trabajo en Revisión técnica: la bandeja. */
const enRevision = (c: Caso) => c.estado === 'abierto' && c.trabajos.some((t) => t.etapa_actual?.rol === 'revision')
const urgente = (c: Caso) => !c.en_espera && estadoCaso(c).tono !== 'normal'

function useCola() {
  const pedido = useQuery({
    queryKey: ['casos', 'abiertos'],
    queryFn: () => pedir(api.GET('/api/casos', { params: { query: { estado: 'abierto', limit: 500 } } })),
  })
  const cola = useMemo(() => (pedido.data?.results ?? []).filter(enRevision).sort((a, b) => a.numero - b.numero), [pedido.data])
  return { pedido, cola }
}

const tituloDe = (c: Caso) => {
  const t = c.trabajos[0]
  return t ? `${t.familia} · ${t.item_nombre}` : 'Caso'
}

const TONO_COLA = { frenado: 'font-semibold text-ba', alerta: 'font-semibold text-wa', normal: 'text-ink3' } as const

function CodigoColor({ c, className }: { c: Caso; className?: string }) {
  const [letra, numero] = c.codigo.split('-')
  return (
    <span className={cn('display inline-flex items-baseline leading-none font-bold tracking-tight', className)}>
      <span style={{ color: coloresDeFamilia(c.trabajos[0]?.color_familia)?.['--acT'] }}>{letra}-</span>
      {numero}
    </span>
  )
}

function TarjetaCola({ c }: { c: Caso }) {
  const estado = estadoCaso(c)
  const alerta = urgente(c)
  return (
    <Link
      to={`/revision/${c.id}`}
      className={cn('lamina group grid gap-3 p-4 text-ink no-underline transition duration-200 hover:-translate-y-1', alerta && 'shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--wa)_55%,transparent),var(--shadow-ficha)]')}
      data-tono={alerta ? 'calido' : 'base'}
    >
      <span className="flex items-start justify-between gap-3">
        <CodigoColor c={c} className="text-[34px]" />
        <span className="grid min-w-[52px] justify-items-center rounded-[14px] bg-gradient-to-b from-[color-mix(in_srgb,var(--ac)_80%,white)] to-ac px-2.5 py-1.5 text-acI shadow-boton">
          <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase opacity-85">Pieza</span>
          <span className="display text-[22px] leading-none font-bold">{piezasDe(c.trabajos[0])}</span>
        </span>
      </span>

      <span className="grid gap-0.5">
        <strong className="text-[16px] leading-snug font-semibold">{tituloDe(c)}</strong>
        <span className="flex items-center gap-1.5 text-[14px] text-ink2">
          <Stethoscope aria-hidden className="size-3.5 shrink-0 text-acT" />
          {c.profesional.nombre} · {c.cliente.nombre}
        </span>
      </span>

      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ln pt-2.5 text-[13.5px]">
        <span className={cn('flex items-center gap-1.5', TONO_COLA[estado.tono])}>
          {estado.tono === 'normal' ? <Clock3 aria-hidden className="size-4" /> : <AlarmClock aria-hidden className="size-4" />}
          {estado.texto}
        </span>
        <span className="flex items-center gap-1.5 text-ink2">
          <CalendarClock aria-hidden className="size-4 text-ink3" />
          Entrega {fechaCorta(c.fecha_prometida)}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-acT">
        {c.en_espera ? 'Ver la revisión' : 'Revisar'}
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
  )
}

/** Bandeja de la revisión técnica: todos los casos que esperan, los que vencen pronto primero. */
export function ColaRevision() {
  const { pedido, cola } = useCola()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  if (pedido.isPending) return <p className="text-ink3">Cargando…</p>
  if (pedido.error) return <Aviso>{pedido.error.message}</Aviso>
  const pendientes = cola.filter((c) => !c.en_espera)
  const urgentes = pendientes.filter(urgente)
  const resto = pendientes.filter((c) => !urgente(c))
  const enEspera = cola.filter((c) => c.en_espera)
  const primero = urgentes[0] ?? pendientes[0]

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-1">
        <div className="grid gap-2.5">
          <Rotulo>Revisión técnica · ¿se puede diseñar?</Rotulo>
          <h1 className="m-0 text-[clamp(38px,5vw,60px)] leading-none font-bold tracking-tight">Casos para revisar</h1>
          <p className="m-0 max-w-[560px] text-[17px] text-ink2">
            {pendientes.length ? (
              <>
                <strong className="font-semibold text-ink">{pendientes.length === 1 ? '1 caso' : `${pendientes.length} casos`}</strong> {pendientes.length === 1 ? 'espera' : 'esperan'} una decisión
                {urgentes.length > 0 && (
                  <>
                    , <strong className="font-semibold text-wa">{urgentes.length} vencen pronto</strong>
                  </>
                )}
                . Elegí uno: adentro vas a ver el escaneo y el checklist juntos.
              </>
            ) : (
              'No hay casos esperando revisión. Cuando recepción cargue uno, aparece acá.'
            )}
          </p>
        </div>
        {primero && (
          <Button variant="ink" size="lg" asChild>
            <Link to={`/revision/${primero.id}`}>
              {urgentes.length ? 'Empezar por el más urgente' : 'Empezar por el primero'}
              <ArrowRight aria-hidden className="size-5" />
            </Link>
          </Button>
        )}
      </header>

      {urgentes.length > 0 && (
        <section aria-label="Vencen pronto" className="grid gap-3">
          <Rotulo className="text-wa">Vencen pronto · {urgentes.length}</Rotulo>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
            {urgentes.map((c) => (
              <TarjetaCola key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {resto.length > 0 && (
        <section aria-label="En orden de llegada" className="grid gap-3">
          <Rotulo>En orden de llegada · {resto.length}</Rotulo>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
            {resto.map((c) => (
              <TarjetaCola key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {enEspera.length > 0 && (
        <section aria-label="En espera del odontólogo" className="grid gap-3">
          <Rotulo className="text-ba">En espera del odontólogo · {enEspera.length}</Rotulo>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
            {enEspera.map((c) => (
              <TarjetaCola key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function Pasos({ hechos, total, decidido }: { hechos: number; total: number; decidido: boolean }) {
  const pasos = [
    { n: '01', t: 'Mirar el escaneo', listo: true },
    { n: '02', t: `Checklist ${hechos}/${total}`, listo: hechos === total },
    { n: '03', t: 'Decidir', listo: decidido },
  ]
  const actual = pasos.findIndex((p) => !p.listo)
  return (
    <ol aria-label="Pasos de la revisión" className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0">
      {pasos.map((p, i) => (
        <li key={p.n} className="flex items-center gap-2" aria-current={i === actual ? 'step' : undefined}>
          {i > 0 && <span aria-hidden className="h-px w-5 bg-ctl/60" />}
          <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px] transition', i === actual ? 'bg-ink font-semibold text-bg shadow-[0_8px_16px_-8px_var(--ink)]' : p.listo ? 'bg-okS text-ok' : 'text-ink3')}>
            {p.listo ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <span className="font-mono text-[12px]">{p.n}</span>}
            {p.t}
            <span className="sr-only">{p.listo ? ', hecho' : i === actual ? ', en curso' : ', pendiente'}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Selector de caso, arriba de todo: el actual y los más urgentes; "Ver los N" abre la bandeja. */
function TiraCola({ actual, cola }: { actual: string; cola: Caso[] }) {
  const orden = [...cola].sort((a, b) => Number(urgente(b)) - Number(urgente(a)) || Number(a.en_espera) - Number(b.en_espera))
  const visibles = orden.slice(0, 4)
  const este = cola.find((c) => c.id === actual)
  if (este && !visibles.includes(este)) visibles[visibles.length - 1] = este
  if (cola.length < 2) return null
  const pendientes = cola.filter((c) => !c.en_espera).length
  return (
    <nav aria-label="Casos para revisar" className="flex items-stretch gap-3">
      <div className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto px-0.5 pt-1 pb-2">
        {visibles.map((c) => {
          const es = c.id === actual
          const est = estadoCaso(c)
          return (
            <Link
              key={c.id}
              to={`/revision/${c.id}`}
              aria-current={es ? 'page' : undefined}
              data-tono={es ? 'tinte' : urgente(c) ? 'calido' : 'base'}
              className={cn('lamina grid min-w-[200px] flex-1 content-between gap-1.5 rounded-[18px] px-3.5 py-2.5 text-ink no-underline transition duration-200 hover:-translate-y-1', es && 'shadow-[0_0_0_2px_var(--ac),0_16px_30px_-16px_var(--ac)]')}
            >
              <span className="flex items-baseline justify-between gap-2">
                <CodigoColor c={c} className="text-[27px]" />
                <span className="rounded-md bg-bg2/80 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-ink2">{piezasDe(c.trabajos[0])}</span>
              </span>
              <span className="truncate text-[14px] text-ink2" title={`${tituloDe(c)} · ${c.profesional.nombre}`}>
                {c.trabajos[0]?.material || c.trabajos[0]?.item_nombre} · {c.profesional.nombre}
              </span>
              <span className={cn('text-[13px]', es ? 'font-semibold text-acT' : TONO_COLA[est.tono])}>{es && !c.en_espera ? 'Revisando ahora' : est.texto}</span>
            </Link>
          )
        })}
      </div>
      <Link to="/revision" className="my-1 mb-2.5 inline-flex shrink-0 flex-col items-start justify-center gap-0.5 rounded-[18px] border border-dashed border-ctl px-4 text-[14px] font-semibold text-acT no-underline transition hover:bg-acS">
        <LayoutList aria-hidden className="size-5" />
        Ver los {cola.length}
        <span className="text-[12px] font-normal text-ink3">{pendientes} sin revisar</span>
      </Link>
    </nav>
  )
}

function datosRevision(c: Caso, estado: EstadoRevision, archivos: number, revisa: string): DatosRevision {
  const t = c.trabajos[0]
  const est = estadoCaso(c)
  const faltan = c.fecha_prometida ? habilesHasta(c.fecha_prometida) : null
  return {
    codigo: c.codigo,
    tipo: { nombre: t?.familia ?? 'Caso', colores: coloresDeFamilia(t?.color_familia) },
    // 'Zirconio monolítica · Zirconio' repite: el material va solo si el ítem no lo dice.
    material: t?.material && !t.item_nombre.toLowerCase().includes(t.material.toLowerCase()) ? `${t.item_nombre} · ${t.material}` : (t?.item_nombre ?? ''),
    soporte: t?.soporte === 'implante' ? 'Implante' : t?.soporte === 'munon' ? 'Muñón' : null,
    color: t?.color ? { nombre: t.color, hex: TONOS_VITA[t.color] ?? '#EAD9B8' } : null,
    pide: c.profesional.nombre,
    clinica: c.cliente.nombre,
    matricula: estado.matricula,
    paciente: c.paciente || '—',
    orden: c.orden_origen ? { codigo: c.orden_numero || ORIGEN[c.orden_origen] || 'Orden', estado: c.orden_firmada ? 'firmada' : 'sin firma' } : null,
    archivos: archivos === 1 ? '1 archivo' : `${archivos} archivos`,
    piezas: Object.keys((t?.piezas as Record<string, unknown>) ?? {}).sort(),
    entrega: fechaCorta(c.fecha_prometida),
    falta: faltan === null ? 'Sin fecha' : faltan === 1 ? 'Falta 1 día hábil' : `Faltan ${faltan} días hábiles`,
    alerta: est.tono !== 'normal' ? est.texto : undefined,
    revisa,
  }
}

/** Revisión técnica de un caso: la tira de casos, la cabecera compacta y, enseguida, escaneo y checklist. */
export function Revision() {
  const { id = '' } = useParams()
  const caso = useQuery({ queryKey: ['caso', id], queryFn: () => pedir(api.GET('/api/casos/{id}', { params: { path: { id } } })) })
  const estado = useQuery({ queryKey: ['revision', id], queryFn: () => pedir(api.GET('/api/casos/{id}/revision', { params: { path: { id } } })) })
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])
  if (caso.isPending || estado.isPending) return <p className="text-ink3">Cargando…</p>
  if (caso.error || estado.error) return <Aviso>{(caso.error ?? estado.error)?.message}</Aviso>
  // key: al cambiar de caso (o de pasada) arranca con el checklist y la decisión en blanco.
  return <RevisionCaso key={`${id}-${estado.data.revisiones.length}`} c={caso.data} estado={estado.data} />
}

function RevisionCaso({ c, estado }: { c: Caso; estado: EstadoRevision }) {
  const cliente = useQueryClient()
  const { data: yo } = useYo()
  const { cola } = useCola()
  const archivos = useQuery({ queryKey: ['archivos', c.id], queryFn: () => pedir(api.GET('/api/casos/{id}/archivos', { params: { path: { id: c.id } } })) })
  const { archivos: versiones } = useEscaneo(c.id)
  const inicial = versiones.find((v) => v.tipo === 'inicial')?.id

  const ITEMS = estado.checklist
  const ultima = estado.revisiones[0]
  // Lo registrado se ve si ya no queda nada por revisar (pasó a diseño) o si está en espera.
  const revision = !estado.en_revision || estado.en_espera ? ultima : undefined
  const puedeRevisar = !!yo?.permisos.includes('revisar')
  const puedeMarcarLlegada = puedeRevisar || !!yo?.permisos.includes('registrar_cambio')
  const nombre = yo?.usuario.nombre_visible ?? ''

  const [marcas, setMarcas] = useState<Marca[]>(() => ITEMS.map(() => ''))
  const [elegida, setElegida] = useState<DecisionRevision | ''>('')
  const [verArchivos, setVerArchivos] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [mensajePropio, setMensajePropio] = useState<string | null>(null)
  // Cuánto espacio se le da al escaneo: se recuerda entre casos, porque depende de la pantalla y de cómo trabaja cada uno.
  const [tam, setTam] = useState<TamanoEscaneo>(() => {
    try {
      const v = localStorage.getItem(CLAVE_TAM)
      return v === 'lado' || v === 'foco' ? v : 'ancho'
    } catch {
      return 'ancho'
    }
  })
  const elegirTam = (t: TamanoEscaneo) => {
    setTam(t)
    try {
      localStorage.setItem(CLAVE_TAM, t)
    } catch {
      // sin almacenamiento: queda solo para esta pantalla
    }
    // Al agrandarlo se lleva el escaneo arriba de todo, para no tener que buscarlo.
    if (t !== 'lado') requestAnimationFrame(() => document.getElementById('escaneo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // La barra flotante con el código solo aparece cuando la cabecera se fue de la pantalla: arriba no se repite.
  const cabecera = useRef<HTMLDivElement>(null)
  const [flotante, setFlotante] = useState(false)
  useEffect(() => {
    const el = cabecera.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const o = new IntersectionObserver(([e]) => setFlotante(!e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' })
    o.observe(el)
    return () => o.disconnect()
  }, [])

  const refrescar = () => {
    for (const k of [['caso', c.id], ['revision', c.id], ['mensajes', c.id], ['casos']]) cliente.invalidateQueries({ queryKey: k })
  }

  const t = c.trabajos[0]
  const total = ITEMS.length
  const poner = (i: number, v: Exclude<Marca, ''>) => setMarcas((ms) => ms.map((m, j) => (j === i ? (m === v ? '' : v) : m)))
  const hechos = marcas.filter(Boolean).length
  const faltan = ITEMS.filter((_, i) => marcas[i] === 'falta')
  const dudas = ITEMS.filter((_, i) => marcas[i] === 'duda')
  const sugerida: DecisionRevision = faltan.length ? 'pedir' : dudas.length ? 'consulta' : 'aprobar'
  const decision = elegida || sugerida
  const opcion = OPCIONES.find((o) => o.id === decision) ?? OPCIONES[0]
  const sugerido = `Hola ${c.profesional.nombre}, para ${t ? `el trabajo de la ${piezasDe(t)}` : 'el caso'}${c.paciente ? ` de ${c.paciente}` : ''} (${c.codigo}) nos falta: ${faltan.map((f) => f.toLowerCase()).join(', ') || 'un dato'}. ¿Nos lo podés mandar? El caso queda en espera hasta que llegue.`
  const mensaje = mensajePropio ?? sugerido
  const telefono = estado.whatsapp.replace(/\D/g, '')
  const sinTerminar = ITEMS.filter((_, i) => !marcas[i])
  // Las mismas reglas que el backend: hay que revisar todos los puntos y no se aprueba con algo en "Falta".
  const motivoBloqueo = sinTerminar.length
    ? `Marcá los ${total} puntos para decidir. Falta revisar: ${sinTerminar.join(', ').toLowerCase()}.`
    : decision === 'aprobar' && faltan.length
      ? `No se aprueba con puntos en "Falta" (${faltan.join(', ').toLowerCase()}). Pedilos o aprobá con nota técnica.`
      : decision === 'pedir' && !mensaje.trim()
        ? 'Escribí qué le pedís al odontólogo.'
        : ''

  const revisar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/revision', { params: { path: { id: c.id } }, body: { marcas, decision, mensaje: decision === 'pedir' ? mensaje.trim() : '' } })),
    onSuccess: refrescar,
  })
  const llego = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/revision/llego', { params: { path: { id: c.id } } })),
    onSuccess: refrescar,
  })

  const confirmar = () => {
    if (motivoBloqueo) return
    // WhatsApp se abre en el clic (si no, el navegador lo bloquea) y se le pone la dirección cuando el caso quedó en espera.
    // El aviso va por un enlace wa.me: abre WhatsApp con el texto listo y lo envía una persona (D15).
    const ventana = decision === 'pedir' && telefono ? window.open('', '_blank') : null
    revisar.mutate(undefined, {
      onSuccess: () => {
        if (ventana) {
          ventana.opener = null
          ventana.location.href = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje.trim())}`
        }
      },
      onError: () => ventana?.close(),
    })
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setCopiado(false)
    }
  }

  const cuenta = { ok: marcas.filter((m) => m === 'ok').length, falta: faltan.length, duda: dudas.length }
  const listaArchivos = (archivos.data ?? []).filter((a) => a.estado === 'listo')
  const datos = datosRevision(c, estado, listaArchivos.length, nombre)
  const marcasCabecera: Marca[] = revision ? (revision.items.map((x) => x.marca) as Marca[]) : marcas

  return (
    <>
      {/* Alto cero: no empuja nada. Aparece pegada arriba solo al hacer scroll. */}
      <div className="sticky top-3 z-40 -mb-4 h-0" aria-hidden={!flotante}>
        <div className={cn('absolute inset-x-0 top-0 transition duration-200', flotante ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0')}>
          <BarraFlotante className="static">
            <span className="flex min-w-0 items-baseline gap-3">
              <span className="display text-[22px] leading-none font-bold tracking-tight">{c.codigo}</span>
              <span className="truncate text-[15px] text-ink2">
                {tituloDe(c)} · pieza {piezasDe(t)}
                {t?.color ? ` · ${t.color}` : ''} · {c.profesional.nombre}
              </span>
            </span>
            <span className="ml-auto">
              <Pasos hechos={revision ? total : hechos} total={total} decidido={!!revision} />
            </span>
          </BarraFlotante>
        </div>
      </div>

      <TiraCola actual={c.id} cola={cola} />

      {/* Cabecera con la lógica de la del caso (opción C): qué es, de quién, cómo va la revisión y la pieza. */}
      <div ref={cabecera}>
        <CabeceraRevision
          c={datos}
          marcas={marcasCabecera}
          decidido={revision?.decision}
          verArchivos={verArchivos}
          onVerArchivos={() => setVerArchivos(!verArchivos)}
          acciones={
            <>
              <Button variant="secondary" className="min-h-10 px-3.5 text-[14px]" asChild>
                <Link to={`/casos/${c.id}`}>
                  <FileText aria-hidden className="size-4" />
                  Ver la ficha
                </Link>
              </Button>
              <Button variant="ink" className="min-h-10 px-3.5 text-[14px]" asChild>
                <Link to={`/casos/${c.id}#conversacion-caso`}>
                  Hablar con el odontólogo
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            </>
          }
          accion={
            <>
              {tam !== 'lado' && (
                <a
                  href="#checklist-revision"
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById('checklist-revision')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-[12px] px-2.5 text-[14px] font-semibold text-acT no-underline hover:bg-acS"
                >
                  Ir al checklist
                  <ArrowDown aria-hidden className="size-4" />
                </a>
              )}
              <span className="flex items-center gap-2" title={TAMANOS.find((x) => x.id === tam)?.ayuda}>
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">Escaneo</span>
                <Segmented label="Tamaño del escaneo" value={tam} onChange={elegirTam} compacto className="w-[260px]" options={TAMANOS.map(({ id, label }) => ({ id, label }))} />
              </span>
            </>
          }
        >
          {verArchivos && (
            <ul id="archivos-pedido" aria-label="Archivos que mandó el odontólogo, con la categoría y el comentario de recepción" className="m-0 grid list-none gap-2 border-t border-ln/70 p-0 pt-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
              {listaArchivos.length === 0 && <li className="text-[14px] text-ink3">Este caso no tiene archivos.</li>}
              {listaArchivos.map((a) => {
                const Icono = a.tipo === 'foto' ? ImageIcon : a.tipo === 'escaneo' || a.tipo === 'diseno' ? FileBox : FileText
                return (
                  <li key={a.id} className="chip grid grid-cols-[auto_1fr] items-start gap-3 rounded-[16px] p-3">
                    <span className="grid size-10 place-items-center rounded-[12px] bg-gradient-to-br from-acS to-[color-mix(in_srgb,var(--acS)_45%,var(--sf))] text-acT shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ac)_22%,transparent)]">
                      <Icono aria-hidden className="size-5" />
                    </span>
                    <span className="grid min-w-0 gap-0.5 text-left">
                      <strong className="truncate text-[15px] font-semibold">{a.categoria || a.tipo}</strong>
                      {a.comentario && <span className="text-[13.5px] text-ink2">{a.comentario}</span>}
                      <span className="truncate font-mono text-[11.5px] text-ink3">{a.nombre}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CabeceraRevision>
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <section id="escaneo" aria-label="Escaneo" className={cn('min-w-0 scroll-mt-4', tam === 'lado' ? 'flex-[999_1_480px]' : 'basis-full')}>
          <Card className="p-5">
            <PanelEscaneo
              key={inicial ?? 'sin-escaneo'}
              casoId={c.id}
              autor={nombre}
              archivoInicial={inicial}
              permitirVersiones={false}
              titulo="Escaneo del odontólogo"
              etiquetaMarcar="Marcar en el escaneo"
              alto={TAMANOS.find((x) => x.id === tam)?.alto}
              panelPorDefecto={tam !== 'foco'}
            />
          </Card>
        </section>

        <section id="checklist-revision" aria-label="Checklist y decisión" className={cn('grid min-w-0 scroll-mt-4 gap-4', tam === 'lado' ? 'flex-[1_1_470px]' : 'basis-full lg:grid-cols-2 lg:items-start')}>
          {/* 02 · Checklist */}
          <Card className="grid gap-3 p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3">
              <div className="grid gap-1">
                <Rotulo n="02">Checklist</Rotulo>
                <h2 className="m-0 text-[22px] leading-tight font-semibold tracking-tight">{t ? `${t.item_nombre}${datos.soporte ? ` sobre ${datos.soporte.toLowerCase()}` : ''}` : 'Checklist'}</h2>
              </div>
              <span className="display text-[32px] leading-none font-bold tracking-tight">
                {revision ? total : hechos}
                <span className="text-[19px] text-ink3">/{total}</span>
              </span>
            </div>

            {total === 0 ? (
              <p className="m-0 text-[15px] text-ink2">Este ítem del catálogo no tiene checklist. Cargalo en Catálogo para que la revisión tenga puntos.</p>
            ) : revision ? (
              <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Checklist de la revisión registrada">
                {revision.items.map((x) => (
                  <li key={x.texto} data-estado={x.marca} className="fila-check flex items-center justify-between gap-3 py-2 pr-3 pl-3.5">
                    <span className="text-[15px] leading-tight font-medium">{x.texto}</span>
                    <span className={cn('text-[13px] font-semibold', ESTADO[x.marca as Marca].clase)}>{ESTADO[x.marca as Marca].texto}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {/* Un tramo por punto, del color de su estado: se ve de un vistazo cómo va la revisión. */}
                <div aria-hidden className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
                  {marcas.map((m, i) => (
                    <span
                      key={i}
                      className={cn('h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]', m === 'ok' && 'bg-ok shadow-[0_4px_8px_-3px_var(--ok)]', m === 'falta' && 'bg-ba shadow-[0_4px_8px_-3px_var(--ba)]', m === 'duda' && 'bg-wa shadow-[0_4px_8px_-3px_var(--wa)]', !m && 'bg-ctl/30')}
                    />
                  ))}
                </div>
                <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink2">
                  <span className="text-ok"><strong className="font-semibold">{cuenta.ok}</strong> bien</span>
                  <span className="text-ba"><strong className="font-semibold">{cuenta.falta}</strong> {cuenta.falta === 1 ? 'falta' : 'faltan'}</span>
                  <span className="text-wa"><strong className="font-semibold">{cuenta.duda}</strong> con duda</span>
                  <span className="text-ink3"><strong className="font-semibold">{total - hechos}</strong> sin revisar</span>
                </p>

                <ul className="m-0 grid list-none gap-1.5 p-0">
                  {ITEMS.map((label, i) => {
                    const m = marcas[i] ?? ''
                    const { texto, clase } = ESTADO[m]
                    return (
                      <li key={label} data-estado={m} className="fila-check flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1.5 pr-2.5 pl-3.5">
                        <span className="flex min-w-[150px] flex-1 items-center gap-2.5">
                          <span
                            key={m}
                            aria-hidden
                            className={cn(
                              'burbuja grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11.5px] font-semibold text-white',
                              m === 'ok' && 'bg-gradient-to-b from-[color-mix(in_srgb,var(--ok)_80%,white)] to-ok shadow-[0_6px_12px_-5px_var(--ok)]',
                              m === 'falta' && 'bg-gradient-to-b from-[color-mix(in_srgb,var(--ba)_80%,white)] to-ba shadow-[0_6px_12px_-5px_var(--ba)]',
                              m === 'duda' && 'bg-gradient-to-b from-[color-mix(in_srgb,var(--wa)_80%,white)] to-wa shadow-[0_6px_12px_-5px_var(--wa)]',
                              !m && 'border border-dashed border-ctl bg-sf/60 text-ink3',
                            )}
                          >
                            {m === 'ok' && <Check className="size-4" strokeWidth={3} />}
                            {m === 'falta' && <X className="size-4" strokeWidth={3} />}
                            {m === 'duda' && <CircleHelp className="size-4" strokeWidth={2.6} />}
                            {!m && String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="grid gap-0">
                            <span className="text-[15px] leading-tight font-medium">{label}</span>
                            <span className={cn('text-[12.5px] font-medium', clase)}>{texto}</span>
                          </span>
                        </span>
                        <Segmented<Exclude<Marca, ''>>
                          label={label}
                          value={m as 'ok'}
                          onChange={(v) => poner(i, v)}
                          compacto
                          className="w-full sm:w-[196px]"
                          options={[
                            { id: 'ok', label: 'Bien', tono: 'ok', icon: <Check aria-hidden className="size-3.5" strokeWidth={3} /> },
                            { id: 'falta', label: 'Falta', tono: 'ba', icon: <X aria-hidden className="size-3.5" strokeWidth={3} /> },
                            { id: 'duda', label: 'Duda', tono: 'wa', icon: <CircleHelp aria-hidden className="size-3.5" strokeWidth={2.8} /> },
                          ]}
                        />
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </Card>

          {/* 03 · Decisión */}
          <Card tono="calido" className="grid gap-4 p-4 sm:p-5">
            <div className="grid gap-1.5">
              <Rotulo n="03">Decisión</Rotulo>
              <h2 className="m-0 text-[22px] leading-tight font-semibold tracking-tight">{revision ? 'Decisión registrada' : estado.en_revision ? '¿Qué hacemos con el caso?' : 'No está en revisión'}</h2>
            </div>

            {revision ? (
              <div className="grid gap-4" role="status">
                <div data-tono={RESULTADO[revision.decision].tono} className="boton-tono grid gap-1 rounded-[18px] p-4">
                  <strong className="display text-[21px] leading-tight font-semibold">{RESULTADO[revision.decision].titulo}</strong>
                  <span className="text-white/92">{RESULTADO[revision.decision].detalle}</span>
                  <span className="font-mono text-[12px] text-white/80">
                    {revision.por} · {cuando(revision.creado)} · queda en el recorrido del caso
                  </span>
                </div>
                {revision.mensaje && (
                  <div className="grid gap-1.5 rounded-[16px] bg-sf2 p-3.5">
                    <Rotulo>Mensaje enviado al odontólogo</Rotulo>
                    <p className="m-0 leading-normal">{revision.mensaje}</p>
                    {telefono && (
                      <a href={`https://wa.me/${telefono}?text=${encodeURIComponent(revision.mensaje)}`} target="_blank" rel="noopener noreferrer" className="justify-self-start text-[14px] font-semibold text-acT">
                        Abrir WhatsApp otra vez
                      </a>
                    )}
                  </div>
                )}
                {estado.en_espera && puedeMarcarLlegada && (
                  <Button disabled={llego.isPending} onClick={() => llego.mutate()} className="justify-between">
                    <span className="flex items-center gap-2">
                      <PackageCheck aria-hidden className="size-5" />
                      Llegó lo que faltaba: revisar de nuevo
                    </span>
                    <ArrowRight aria-hidden className="size-4" />
                  </Button>
                )}
                {llego.error && <Aviso>{llego.error.message}</Aviso>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="ink" asChild>
                    <Link to="/revision">
                      Volver a la bandeja <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  </Button>
                  <Button variant="secondary" asChild>
                    <Link to={`/casos/${c.id}`}>Ir al caso</Link>
                  </Button>
                </div>
              </div>
            ) : !estado.en_revision ? (
              <p className="m-0 text-[15px] text-ink2">
                Este caso está en {t?.etapa_actual?.nombre ?? 'otra etapa'}: la revisión técnica se hace cuando le toca. <Link to={`/casos/${c.id}`}>Ver el caso</Link>.
              </p>
            ) : !puedeRevisar ? (
              <p className="m-0 text-[15px] text-ink2">La decisión la toma Revisión técnica. Podés mirar el escaneo y el checklist, pero no marcarlo.</p>
            ) : (
              <>
                <div role="radiogroup" aria-label="Decisión" className="grid gap-2.5">
                  {OPCIONES.map((o) => {
                    const on = o.id === decision
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={on} data-tono={o.tono} onClick={() => setElegida(o.id)} className="opcion">
                        <span className="opcion-icono">
                          <o.Icono aria-hidden className="size-6" strokeWidth={2.1} />
                        </span>
                        <span className="grid gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="display text-[18px] font-semibold">{o.t}</strong>
                            {o.id === sugerida && <span className={cn('rounded-full px-2 py-px font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase', on ? 'bg-white/25 text-white' : 'bg-ink text-bg')}>Sugerida</span>}
                          </span>
                          <span className="opcion-sub text-[14px] text-ink2">{o.s}</span>
                        </span>
                        <span aria-hidden className={cn('grid size-6 place-items-center rounded-full border-2 transition', on ? 'border-white bg-white/25' : 'border-ctl')}>
                          {on && <Check className="size-3.5 text-white" strokeWidth={3.5} />}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {decision === 'pedir' && (
                  <div className="grid gap-2 rounded-[18px] rounded-tl-[6px] bg-gradient-to-br from-[#DCF8C6] to-[#C9EFB0] p-3.5 text-[#14301C] shadow-[0_10px_20px_-14px_rgb(20_60_30/.6)]">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="mensaje-pedido" className="font-mono text-[10.5px] font-semibold tracking-[0.1em] uppercase">
                        Mensaje de WhatsApp para {c.profesional.nombre}
                      </label>
                      <button type="button" onClick={() => void copiar()} className="min-h-9 rounded-[10px] bg-white/60 px-2.5 text-[13px] font-semibold hover:bg-white/90">
                        {copiado ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <textarea
                      id="mensaje-pedido"
                      value={mensaje}
                      onChange={(e) => setMensajePropio(e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-[12px] border border-[#14301C]/15 bg-white/55 p-2.5 leading-normal text-[#14301C]"
                    />
                    <span className="text-[12.5px] opacity-80">
                      {telefono ? 'Se abre WhatsApp con el texto listo; lo envía una persona. Queda también en la conversación del caso.' : 'El odontólogo no tiene WhatsApp cargado en Clientes: copiá el mensaje y mandalo vos. Queda en la conversación del caso.'}
                    </span>
                  </div>
                )}

                {motivoBloqueo && (
                  <p role="status" className="m-0 flex items-start gap-2 rounded-[14px] bg-waS p-3 text-[14px] text-ink">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-wa" />
                    {motivoBloqueo}
                  </p>
                )}
                {c.cambio_pendiente && <Aviso>Hay un cambio de ficha sin confirmar: primero tiene que leerlo Revisión técnica, desde el caso.</Aviso>}
                {revisar.error && <Aviso>{revisar.error.message}</Aviso>}
                <button type="button" data-tono={opcion.tono} disabled={!!motivoBloqueo || revisar.isPending || total === 0} onClick={confirmar} className="boton-tono flex min-h-[58px] w-full items-center justify-between rounded-[18px] px-5 text-[17px] font-semibold disabled:pointer-events-none disabled:opacity-45">
                  {revisar.isPending ? 'Guardando…' : BOTON[decision]}
                  <ArrowRight aria-hidden className="flecha size-5" />
                </button>
              </>
            )}
          </Card>
        </section>
      </div>
    </>
  )
}
