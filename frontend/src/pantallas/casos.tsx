/**
 * Todos los casos del laboratorio: buscador, filtros y la etapa de cada caso a la vista.
 * Es la pantalla "Casos" del prototipo, con los datos de la API.
 */
import { useQuery } from '@tanstack/react-query'
import { AlarmClock, AlertCircle, CalendarClock, LayoutGrid, Rows3, Search, Stethoscope, X } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { api, pedir } from '../api/cliente'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Rotulo } from '../components/ui/flotante'
import { CampoLuz, CodigoVivo, luzPuntero } from '../components/ui/luz'
import { ProgresoEtapas } from '../components/ui/progreso-etapas'
import { Segmented } from '../components/ui/segmented'
import {
  contarFiltro,
  estadoCaso,
  fechaCorta,
  FILTROS,
  filtrar,
  indiceEtapa,
  nombresEtapas,
  ordenar,
  piezasDe,
  tituloTrabajo,
  useVistaCasos,
  vistaCasos,
  type Caso,
  type FiltroCasos,
} from '../lib/casos'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'

const TONO = { frenado: 'font-semibold text-wa', alerta: 'font-semibold text-wa', normal: 'text-ink3' } as const

function Estado({ c }: { c: Caso }) {
  const est = estadoCaso(c)
  return (
    <span className={cn('flex items-center gap-1.5', TONO[est.tono])}>
      {est.tono === 'frenado' ? <AlertCircle aria-hidden className="size-4 shrink-0" /> : est.tono === 'alerta' ? <AlarmClock aria-hidden className="size-4 shrink-0" /> : null}
      {est.texto}
    </span>
  )
}

/** El código con la letra del tipo en su color: C-0412. */
function Codigo({ c, className, degradado = false }: { c: Caso; className?: string; degradado?: boolean }) {
  const [letra, numero] = c.codigo.split('-')
  return (
    <span className={cn('display inline-flex items-baseline gap-0.5 leading-none font-bold tracking-tight', className)}>
      <span style={{ color: c.trabajos[0]?.color_familia }}>{letra}-</span>
      <span className={cn(degradado && 'bg-gradient-to-br from-ink via-ink to-acT bg-clip-text text-transparent transition-[filter] duration-300 group-hover:[filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--ac)_45%,transparent))]')}>{numero}</span>
    </span>
  )
}

/** Tarjeta de un caso: el código en grande, la etapa en tramos y lo que importa para decidir si abrirlo. */
function TarjetaCaso({ c, i }: { c: Caso; i: number }) {
  const t = c.trabajos[0]
  const tono = estadoCaso(c).tono
  return (
    <Link
      to={`/casos/${c.id}`}
      onPointerMove={luzPuntero}
      data-tono={tono === 'normal' ? 'base' : 'calido'}
      style={{ '--d': Math.min(i, 12) } as CSSProperties}
      className="lamina lamina-viva entra group grid content-between gap-3.5 p-4 text-ink no-underline transition duration-200 hover:-translate-y-1"
    >
      <span className="flex items-start justify-between gap-3">
        <Codigo c={c} degradado className="gap-1 text-[34px]" />
        <span className="grid min-w-[52px] justify-items-center rounded-[14px] bg-gradient-to-b from-[color-mix(in_srgb,var(--ac)_80%,white)] to-ac px-2.5 py-1.5 text-acI shadow-boton">
          <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase opacity-85">Pieza</span>
          <span className="display text-[22px] leading-none font-bold">{piezasDe(t)}</span>
        </span>
      </span>

      <span className="grid gap-0.5">
        <strong className="text-[16px] leading-snug font-semibold">{tituloTrabajo(t)}</strong>
        <span className="flex items-center gap-1.5 text-[14px] text-ink2">
          <Stethoscope aria-hidden className="size-3.5 shrink-0 text-acT" />
          {c.profesional.nombre} · {c.cliente.nombre}
        </span>
      </span>

      <ProgresoEtapas etapas={nombresEtapas(t)} etapa={indiceEtapa(t)} frenado={!!c.cambio_pendiente} />

      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ln pt-2.5 text-[13.5px]">
        <Estado c={c} />
        <span className="flex items-center gap-1.5 text-ink2">
          <CalendarClock aria-hidden className="size-4 text-ink3" />
          Entrega {fechaCorta(c.fecha_prometida)}
        </span>
      </span>
    </Link>
  )
}

const COLUMNAS = 'md:grid-cols-[minmax(150px,1.05fr)_minmax(0,1.5fr)_minmax(190px,1.3fr)_minmax(140px,1fr)]'

function FilaCaso({ c }: { c: Caso }) {
  const t = c.trabajos[0]
  return (
    <Link to={`/casos/${c.id}`} onPointerMove={luzPuntero} className={cn('lamina-viva relative grid items-center gap-x-5 gap-y-2 border-b border-ln/70 px-4 py-3 text-ink no-underline last:border-b-0', COLUMNAS)}>
      <span className="flex items-center gap-3">
        <Codigo c={c} className="text-[24px]" />
        <span className="rounded-md bg-bg2/80 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-ink2">{piezasDe(t)}</span>
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-[15px] font-medium">{tituloTrabajo(t)}</span>
        <span className="truncate text-[13.5px] text-ink2">
          {c.profesional.nombre} · {c.cliente.nombre}
        </span>
      </span>
      <ProgresoEtapas etapas={nombresEtapas(t)} etapa={indiceEtapa(t)} frenado={!!c.cambio_pendiente} />
      <span className="grid gap-0.5 text-[13.5px]">
        <Estado c={c} />
        <span className="text-ink2">Entrega {fechaCorta(c.fecha_prometida)}</span>
      </span>
    </Link>
  )
}

/** Un número grande que además filtra: tocarlo muestra esos casos. */
function Medida({ valor, etiqueta, tono, filtro, activo }: { valor: number; etiqueta: string; tono?: 'wa'; filtro: FiltroCasos; activo: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => vistaCasos.poner({ filtro: activo ? 'todos' : filtro })}
      className={cn(
        'group grid min-w-[112px] gap-0.5 rounded-[18px] border border-ln/80 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--sf)_80%,transparent),color-mix(in_srgb,var(--sf)_40%,transparent))] px-4 py-3 text-left shadow-[0_1px_0_rgb(255_255_255/.8)_inset] backdrop-blur transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_30px_-18px_var(--ac)] aria-pressed:border-ac aria-pressed:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ac)_20%,transparent)]',
        tono === 'wa' && 'hover:shadow-[0_18px_30px_-18px_var(--wa)] aria-pressed:border-wa aria-pressed:shadow-[0_0_0_3px_color-mix(in_srgb,var(--wa)_22%,transparent)]',
      )}
    >
      <span className={cn('display text-[34px] leading-none font-bold tracking-tight', tono === 'wa' ? 'text-wa' : 'text-ink')}>{valor}</span>
      <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">{etiqueta}</span>
    </button>
  )
}

export function Casos() {
  const v = useVistaCasos()
  const buscador = useRef<HTMLInputElement>(null)
  const pedido = useQuery({
    queryKey: ['casos', 'abiertos'],
    queryFn: () => pedir(api.GET('/api/casos', { params: { query: { estado: 'abierto', limit: 500 } } })),
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  // Con "/" se salta al buscador desde cualquier lado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/^(input|textarea|select)$/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        buscador.current?.focus()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [])

  const casos = ordenar(pedido.data?.results ?? [])
  const lista = filtrar(casos, v)
  const urgentes = contarFiltro(casos, 'urgentes')
  const frenados = contarFiltro(casos, 'frenados')
  const hayFiltro = v.filtro !== 'todos' || !!v.q

  return (
    <>
      <Card tono="tinte" className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <CampoLuz />
        <div className="grid gap-3">
          <Rotulo>Casos · todo lo que hay en el laboratorio</Rotulo>
          <h1 className="m-0 my-2 flex leading-none">
            <CodigoVivo numero="Casos" className="text-[clamp(56px,8vw,104px)]" />
          </h1>
          <p className="m-0 max-w-[520px] text-[17px] text-ink2">
            <strong className="font-semibold text-ink">{casos.length} casos</strong> en marcha. Buscá por número, doctor o pieza, o tocá un filtro para ver en qué etapa está cada uno.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Medida valor={casos.length} etiqueta="Activos" filtro="todos" activo={false} />
          <Medida valor={urgentes} etiqueta="Vencen pronto" tono="wa" filtro="urgentes" activo={v.filtro === 'urgentes'} />
          <Medida valor={frenados} etiqueta="Frenados" tono="wa" filtro="frenados" activo={v.filtro === 'frenados'} />
        </div>
      </Card>

      <div className="buscador-vivo">
        <label className="flex min-h-[62px] items-center gap-3 rounded-[20.5px] bg-[color-mix(in_srgb,var(--sf)_94%,var(--acS))] px-5">
          <Search aria-hidden className="size-5 shrink-0 text-acT" />
          <span className="sr-only">Buscar caso</span>
          <input
            ref={buscador}
            type="search"
            value={v.q}
            onChange={(e) => vistaCasos.poner({ q: e.target.value })}
            placeholder="Buscar caso: 0417, Gómez, 46, zirconio…"
            autoComplete="off"
            className="min-h-11 w-full bg-transparent text-[18px] outline-none! placeholder:text-ink3 [&::-webkit-search-cancel-button]:hidden"
          />
          {v.q ? (
            <button type="button" aria-label="Borrar la búsqueda" onClick={() => vistaCasos.poner({ q: '' })} className="grid size-9 shrink-0 place-items-center rounded-full text-ink2 transition hover:bg-bg2">
              <X aria-hidden className="size-4" />
            </button>
          ) : (
            <kbd aria-hidden className="hidden shrink-0 rounded-md border border-ctl/60 bg-bg2/70 px-2 py-0.5 font-mono text-[12px] text-ink3 sm:block">/</kbd>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtros" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={v.filtro === f.id} onClick={() => vistaCasos.poner({ filtro: f.id })} className="chip min-h-10 rounded-full px-3.5 text-[14px] font-medium">
              {f.label}
              <span className="ml-1.5 font-mono text-[12px] opacity-75">{contarFiltro(casos, f.id)}</span>
            </button>
          ))}
        </div>
        <Segmented
          label="Cómo ver los casos"
          value={v.modo}
          onChange={(modo) => vistaCasos.poner({ modo })}
          compacto
          className="w-[250px]"
          options={[
            { id: 'tarjetas', label: 'Tarjetas', icon: <LayoutGrid aria-hidden className="size-4" /> },
            { id: 'lista', label: 'Lista', icon: <Rows3 aria-hidden className="size-4" /> },
          ]}
        />
      </div>

      {pedido.error && <Aviso>{pedido.error.message}</Aviso>}
      <p role="status" className="m-0 font-mono text-[12px] tracking-[0.08em] text-ink3 uppercase">
        {pedido.isPending ? 'Cargando…' : lista.length === casos.length ? `${lista.length} casos` : `${lista.length} de ${casos.length} casos`}
      </p>

      {pedido.isPending ? null : lista.length === 0 ? (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <strong className="display text-[22px] font-semibold">{casos.length ? 'Ningún caso coincide' : 'Todavía no hay casos'}</strong>
          <span className="max-w-[420px] text-ink2">{casos.length ? 'Probá con otro número, doctor o pieza, o sacá el filtro.' : 'Cargá el primero desde "Nuevo caso".'}</span>
          {hayFiltro && (
            <Button variant="secondary" onClick={() => vistaCasos.poner({ filtro: 'todos', q: '' })}>
              Ver todos los casos
            </Button>
          )}
        </Card>
      ) : v.modo === 'tarjetas' ? (
        <section aria-label="Casos" className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          {lista.map((c, i) => (
            <TarjetaCaso key={c.id} c={c} i={i} />
          ))}
        </section>
      ) : (
        <section aria-label="Casos" className="lamina overflow-hidden p-0" data-tono="base">
          <div aria-hidden className={cn('hidden gap-x-5 border-b border-ln px-4 py-2.5 font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase md:grid', COLUMNAS)}>
            <span>Caso</span>
            <span>Trabajo y odontólogo</span>
            <span>Etapa</span>
            <span>Estado</span>
          </div>
          {lista.map((c) => (
            <FilaCaso key={c.id} c={c} />
          ))}
        </section>
      )}
    </>
  )
}
