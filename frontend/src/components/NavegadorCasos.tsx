import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, pedir } from '../api/cliente'
import '../cabecera-caso.css'
import { coloresDeFamilia, estadoCaso, FILTROS, filtrar, indiceEtapa, nombresEtapas, ordenar, piezasDe, useVistaCasos, type Caso } from '../lib/casos'
import { cn } from '../lib/utils'

const TONO = { frenado: 'font-semibold text-wa', alerta: 'font-semibold text-wa', normal: 'text-ink3' } as const
const href = (c: Caso) => `/casos/${c.id}`
const descripcion = (c: Caso) => {
  const t = c.trabajos[0]
  return `${t?.item_nombre ?? ''}${t?.color ? ` · ${t.color}` : ''} · pieza ${piezasDe(t)} · ${c.profesional.nombre}`
}

/**
 * Barra para cambiar de caso sin volver a la lista: "‹ Casos" vuelve (con el mismo filtro y búsqueda),
 * las flechas pasan al anterior o siguiente DENTRO de lo que se filtró, y el selector del medio abre
 * un buscador con todos los casos y la etapa de cada uno.
 */
export function NavegadorCasos({ actual }: { actual: string }) {
  const vista = useVistaCasos()
  const navegar = useNavigate()
  const idMenu = useId()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const raiz = useRef<HTMLDivElement>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const pedido = useQuery({
    queryKey: ['casos', 'abiertos'],
    queryFn: () => pedir(api.GET('/api/casos', { params: { query: { estado: 'abierto', limit: 500 } } })),
  })
  const todos = ordenar(pedido.data?.results ?? [])

  // El contexto es lo que se filtró en la lista; si el caso quedó afuera, se recorren todos.
  const filtrada = filtrar(todos, vista)
  const enFiltro = filtrada.some((c) => c.id === actual)
  const contexto = enFiltro ? filtrada : todos
  const i = contexto.findIndex((c) => c.id === actual)
  const ant = contexto[i - 1]
  const sig = contexto[i + 1]
  const actualCaso = contexto[i]

  // Al abrir, el foco va al buscador. Esc o un clic afuera lo cierran.
  useEffect(() => {
    if (!abierto) return
    buscador.current?.focus()
    const afuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])
  useEffect(() => setAbierto(false), [actual])

  const opciones = q.trim() ? filtrar(todos, { filtro: 'todos', q }) : contexto
  const nombreFiltro = FILTROS.find((f) => f.id === vista.filtro)?.label ?? ''
  const donde = enFiltro ? (vista.filtro === 'todos' && !vista.q ? 'todos los activos' : `filtro: ${nombreFiltro.toLowerCase()}${vista.q ? ` + “${vista.q}”` : ''}`) : 'todos los activos'

  const familia = actualCaso?.trabajos[0]
  const flecha = 'inline-grid size-11 shrink-0 place-items-center rounded-full border border-ln/80 bg-sf/55 text-ink backdrop-blur transition hover:-translate-y-0.5 hover:border-ac/40 hover:bg-sf hover:text-acT'
  const apagada = 'inline-grid size-11 shrink-0 place-items-center rounded-full border border-ln/50 text-ink3/40'

  return (
    <nav aria-label="Cambiar de caso" ref={raiz} className="relative z-30">
      <div className="vidrio-caso flex flex-wrap items-center gap-2 rounded-[20px]! p-2" style={coloresDeFamilia(familia?.color_familia) as CSSProperties}>
        <div aria-hidden className="fondo-caso opacity-60">
          <i className="fc-tipo" />
        </div>
        <Link to="/casos" className="inline-flex min-h-11 items-center gap-2 rounded-[14px] px-3 text-acT no-underline transition hover:bg-sf/70">
          <ArrowLeft aria-hidden className="size-4" />
          <span className="font-mono text-[12px] font-semibold tracking-[0.14em] uppercase">Casos</span>
        </Link>
        <span aria-hidden className="hidden h-6 w-px bg-ln sm:block" />

        {ant ? (
          <Link to={href(ant)} aria-label={`Caso anterior, ${ant.codigo}`} title={`Anterior: ${ant.codigo}`} className={flecha}>
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
        ) : (
          <span aria-hidden className={apagada}>
            <ChevronLeft className="size-5" />
          </span>
        )}

        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={idMenu}
          onClick={() => {
            setQ('')
            setAbierto(!abierto)
          }}
          className={cn('flex min-h-11 min-w-[240px] flex-1 items-center justify-between gap-3 rounded-[14px] border bg-sf/55 px-3.5 text-left backdrop-blur transition hover:bg-sf/85', abierto ? 'border-ac/50 shadow-[0_0_0_4px_color-mix(in_srgb,var(--ac)_14%,transparent)]' : 'border-ln/80')}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="display text-[20px] leading-none font-bold tracking-tight text-acT">{actualCaso?.codigo ?? '…'}</span>
            {familia && <span className="rounded-md bg-acS px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.1em] text-acT uppercase">{familia.familia}</span>}
            <span className="truncate text-[14px] text-ink2">{actualCaso ? descripcion(actualCaso) : 'Elegir otro caso'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {actualCaso && <EtapaMini c={actualCaso} />}
            <ChevronDown aria-hidden className={cn('size-4 text-ink3 transition-transform duration-200', abierto && 'rotate-180')} />
          </span>
        </button>

        {sig ? (
          <Link to={href(sig)} aria-label={`Caso siguiente, ${sig.codigo}`} title={`Siguiente: ${sig.codigo}`} className={flecha}>
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        ) : (
          <span aria-hidden className={apagada}>
            <ChevronRight className="size-5" />
          </span>
        )}

        <span className="order-last grid w-full px-2 text-right sm:order-none sm:w-auto sm:pr-3">
          <span className="font-mono text-[13px] text-ink">
            {i >= 0 ? (
              <>
                <strong className="font-semibold">{i + 1}</strong>
                <span className="text-ink3"> / {contexto.length}</span>
              </>
            ) : (
              ''
            )}
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">{donde}</span>
        </span>
      </div>

      {abierto && (
        <div
          id={idMenu}
          className="vidrio-caso absolute! inset-x-0 top-[calc(100%+8px)] grid gap-2.5 rounded-[20px]! p-3 shadow-[0_30px_60px_-24px_rgb(24_32_44/.55)]!"
          style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--sf) 90%, transparent), color-mix(in srgb, var(--sf) 80%, transparent))' }}
        >
          <div className="flex items-center gap-2.5 rounded-[14px] border border-ln/80 bg-sf/80 px-3.5 transition focus-within:border-ac/60 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ac)_14%,transparent)]">
            <Search aria-hidden className="size-4 shrink-0 text-ink3" />
            <input
              ref={buscador}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && opciones[0]) navegar(href(opciones[0]))
              }}
              placeholder="Buscar otro caso: 0417, Gómez, 46…"
              aria-label="Buscar otro caso"
              className="min-h-11 w-full bg-transparent text-[15px] outline-none! placeholder:text-ink3"
            />
            <span aria-hidden className="hidden shrink-0 items-center gap-1.5 font-mono text-[10.5px] tracking-[0.06em] text-ink3 uppercase sm:flex">
              <kbd className="rounded-[6px] border border-ln bg-sf2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink2">Enter</kbd> abre
              <kbd className="ml-1 rounded-[6px] border border-ln bg-sf2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink2">Esc</kbd> cierra
            </span>
          </div>
          <p className="m-0 flex items-center gap-2 px-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink3 uppercase">
            <strong className="font-semibold text-ink2">{opciones.length}</strong>
            {q.trim() ? 'en todos los casos' : donde}
          </p>
          <ul className="m-0 grid max-h-[360px] list-none gap-1 overflow-y-auto p-0">
            {opciones.map((c) => (
              <li key={c.id}>
                <OpcionCaso c={c} actual={c.id === actual} />
              </li>
            ))}
            {!opciones.length && <li className="p-4 text-center text-[14px] text-ink2">Ningún caso coincide. Probá con otro número o doctor.</li>}
          </ul>
        </div>
      )}
    </nav>
  )
}

/** La etapa en chiquito: un punto por etapa (los hechos con el color del tipo) y el nombre en monoespaciada. */
function EtapaMini({ c }: { c: Caso }) {
  const t = c.trabajos[0]
  const etapas = nombresEtapas(t)
  const etapa = indiceEtapa(t)
  const frenado = !!c.cambio_pendiente || c.pausado
  return (
    <span className="flex items-center gap-2" title={`Etapa ${Math.min(etapa + 1, etapas.length)} de ${etapas.length}`}>
      <span aria-hidden className="hidden gap-[3px] md:flex">
        {etapas.map((e, i) => (
          <span key={`${e}-${i}`} className={cn('size-[5px] rounded-full', i < etapa ? 'bg-ac/80' : i === etapa ? (frenado ? 'bg-wa' : 'bg-ac ring-2 ring-ac/25') : 'bg-ctl/30')} />
        ))}
      </span>
      <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase', frenado ? 'bg-waS text-wa' : 'bg-sf2/90 text-ink2')}>{etapas[etapa] ?? 'Terminado'}</span>
    </span>
  )
}

function OpcionCaso({ c, actual }: { c: Caso; actual: boolean }) {
  const est = estadoCaso(c)
  const t = c.trabajos[0]
  return (
    <Link
      to={href(c)}
      aria-current={actual ? 'page' : undefined}
      style={coloresDeFamilia(t?.color_familia) as CSSProperties}
      className={cn(
        'relative grid min-h-[54px] grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[14px] py-1.5 pr-3 pl-4 text-ink no-underline transition hover:bg-sf/90',
        actual && 'bg-[color-mix(in_srgb,var(--acS)_75%,transparent)] hover:bg-acS',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-ac', !actual && 'opacity-60')} />
      <span className="grid gap-1">
        <span className="display text-[17px] leading-none font-bold tracking-tight text-acT">{c.codigo}</span>
        <span className="font-mono text-[9.5px] leading-none tracking-[0.1em] text-ink3 uppercase">{t?.familia}</span>
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-[14px]">{descripcion(c)}</span>
        <span className={cn('flex items-center gap-1 text-[12.5px]', TONO[est.tono])}>
          {est.tono === 'frenado' && <AlertCircle aria-hidden className="size-3.5" />}
          {est.texto}
        </span>
      </span>
      <EtapaMini c={c} />
    </Link>
  )
}
