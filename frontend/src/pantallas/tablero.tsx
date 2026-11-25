/**
 * Tablero de Supervisión (S14): cómo viene el laboratorio. Todo sale de `/api/vistas/tablero`; la
 * pantalla solo dibuja. Lo que ya está pasado de la capacidad se marca con ▲ y con color: nunca
 * solo con color. El gráfico tiene su tabla equivalente para quien no lo lee bien.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useState } from 'react'
import { api, pedir, type Esquemas } from '../api/cliente'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Kpi } from '../components/ui/kpi'
import { Segmented } from '../components/ui/segmented'
import { fechaCorta, fechaLocal } from '../lib/casos'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'

type Tablero = Esquemas['Tablero']
type Periodo = Tablero['periodo']
type Dia = Esquemas['Dia']

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
]
const ENTREGAS: Record<Periodo, string> = { hoy: 'Entregas de hoy', semana: 'Entregas de la semana', mes: 'Entregas del mes' }

/** Horas a algo que se lee rápido: "40 min", "6 h", "1,8 días". */
function demora(horas: number | null | undefined) {
  if (horas == null) return '—'
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`
  if (horas < 48) return `${Math.round(horas)} h`
  return `${(horas / 24).toFixed(1).replace('.', ',')} días`
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

const TIPO: Record<Esquemas['ParaAtender']['tipo'], { texto: string; tono: 'problema' | 'atencion' }> = {
  atrasado: { texto: 'Atrasado', tono: 'problema' },
  sin_leer: { texto: 'Sin leer', tono: 'atencion' },
  espera: { texto: 'Esperando', tono: 'problema' },
  problema: { texto: 'Problema', tono: 'atencion' },
}

function Seccion({ titulo, nota, children, className }: { titulo: string; nota?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('grid content-start gap-3 p-5', className)} aria-label={titulo}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[18px] font-semibold">{titulo}</h2>
        {nota && <span className="text-[13px] text-ink3">{nota}</span>}
      </div>
      {children}
    </Card>
  )
}

// --- Trabajos por día contra la capacidad ------------------------------------------------

/** Los días hábiles siempre; los fines de semana solo si alguien prometió algo para esos días. */
const visibles = (dias: Dia[]) => dias.filter((d) => d.habil || d.trabajos > 0)

const etiquetaDia = (d: Dia) => (d.hoy ? 'hoy' : `${fechaLocal(d.fecha).getDate()}/${fechaLocal(d.fecha).getMonth() + 1}`)

function estadoDia(d: Dia, capacidad: number) {
  if (d.futuro) return 'Ya comprometidos'
  return d.trabajos > capacidad ? 'Por encima de la capacidad' : 'Dentro de la capacidad'
}

function Barras({ dias, capacidad }: { dias: Dia[]; capacidad: number }) {
  const tope = Math.max(capacidad * 1.2, ...dias.map((d) => d.trabajos))
  const alto = (n: number) => `${Math.round((n / tope) * 100)}%`
  return (
    <div className="grid gap-1.5">
      <div className="relative flex h-[230px] items-end gap-0.5 border-b border-ink3" role="list" aria-label="Trabajos por día">
        <span aria-hidden className="pointer-events-none absolute right-0 left-0 border-t-2 border-dashed border-ink3" style={{ bottom: alto(capacidad) }} />
        <span className="absolute right-0 rounded bg-sf px-1 text-[13px] text-ink2" style={{ bottom: `calc(${alto(capacidad)} + 4px)` }}>
          Capacidad ~{capacidad}
        </span>
        {dias.map((d) => {
          const sobre = !d.futuro && d.trabajos > capacidad
          const etiqueta = `${fechaCorta(d.fecha)}: ${plural(d.trabajos, 'trabajo', 'trabajos')}, ${estadoDia(d, capacidad).toLowerCase()}`
          return (
            <div key={d.fecha} role="listitem" tabIndex={0} aria-label={etiqueta} title={etiqueta} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[12px] text-ink2">
                {sobre && '▲ '}
                {d.trabajos}
              </span>
              <div
                className={cn('w-[70%] max-w-[30px] rounded-t', d.futuro ? 'border-[1.5px] border-dashed border-ink3 bg-bg2' : sobre ? 'bg-wa' : 'bg-ac')}
                style={{ height: alto(d.trabajos) }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-0.5" aria-hidden>
        {dias.map((d) => (
          <span key={d.fecha} className={cn('min-w-0 flex-1 text-center text-[12px]', d.hoy ? 'font-bold text-ink' : 'text-ink3')}>
            {etiquetaDia(d)}
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-4 text-[13px] text-ink2">
        <Leyenda clase="bg-ac">Dentro de la capacidad</Leyenda>
        <Leyenda clase="bg-wa">Por encima (marcado con ▲)</Leyenda>
        <Leyenda clase="border-[1.5px] border-dashed border-ink3">Ya comprometidos</Leyenda>
      </div>
    </div>
  )
}

const Leyenda = ({ clase, children }: { clase: string; children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden className={cn('size-3 rounded-[3px]', clase)} />
    {children}
  </span>
)

function TablaDias({ dias, capacidad }: { dias: Dia[]; capacidad: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="text-left">
            <th scope="col" className="border-b border-ln p-2">Día</th>
            <th scope="col" className="border-b border-ln p-2 text-right">Trabajos</th>
            <th scope="col" className="border-b border-ln p-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.fecha}>
              <td className="border-b border-ln px-2 py-1.5">{d.hoy ? `hoy, ${fechaCorta(d.fecha)}` : fechaCorta(d.fecha)}</td>
              <td className="border-b border-ln px-2 py-1.5 text-right">{d.trabajos}</td>
              <td className="border-b border-ln px-2 py-1.5 text-ink2">{estadoDia(d, capacidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrabajosPorDia({ t }: { t: Tablero }) {
  const [modo, setModo] = useState<'grafico' | 'tabla'>('grafico')
  const dias = visibles(t.dias)
  const pasados = dias.filter((d) => !d.futuro && d.habil)
  const sobre = pasados.filter((d) => d.trabajos > t.capacidad).length
  return (
    <Seccion titulo="Trabajos por día" className="flex-[999_1_540px]">
      <Segmented<'grafico' | 'tabla'>
        label="Ver como"
        compacto
        value={modo}
        onChange={setModo}
        options={[
          { id: 'grafico', label: 'Gráfico' },
          { id: 'tabla', label: 'Tabla' },
        ]}
        className="justify-self-start"
      />
      {modo === 'grafico' ? <Barras dias={dias} capacidad={t.capacidad} /> : <TablaDias dias={dias} capacidad={t.capacidad} />}
      <p className="m-0 text-[15px] text-ink2">
        {pasados.length === 0
          ? 'Todavía no hay días para comparar con la capacidad.'
          : `${sobre} de los últimos ${plural(pasados.length, 'día hábil', 'días hábiles')} ${sobre === 1 ? 'pasó' : 'pasaron'} la capacidad.`}
      </p>
    </Seccion>
  )
}

// --- Por etapa ---------------------------------------------------------------------------

function PorEtapa({ etapas }: { etapas: Esquemas['EtapaDelTablero'][] }) {
  const tope = Math.max(1, ...etapas.map((e) => e.casos))
  // Solo vale la pena decirlo cuando la demora ya se nota (una hora o más).
  const mas = etapas.filter((e) => e.horas != null && e.horas >= 1).sort((a, b) => b.horas! - a.horas!)[0]
  return (
    <Seccion titulo="Por etapa" nota="casos y demora promedio" className="flex-[1_1_360px]">
      {etapas.length === 0 ? (
        <p className="m-0 text-ink3">No hay casos abiertos.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {etapas.map((e) => (
            <li key={e.nombre} className="grid grid-cols-[150px_minmax(0,1fr)_28px_58px] items-center gap-2.5 text-[14px]">
              <span className="truncate" title={e.nombre}>{e.nombre}</span>
              <span aria-hidden className="h-3 overflow-hidden rounded-r bg-bg2">
                <span className={cn('block h-full rounded-r', e.espera ? 'bg-wa' : 'bg-ac')} style={{ width: `${Math.round((e.casos / tope) * 100)}%` }} />
              </span>
              <span className="text-right font-semibold">{e.casos}</span>
              <span className={cn('text-right text-[13px]', e.espera ? 'font-bold text-wa' : 'text-ink3')}>{demora(e.horas)}</span>
            </li>
          ))}
        </ul>
      )}
      {mas && <p className="m-0 text-[14px] text-ink3">“{mas.nombre}” es la que más demora: {demora(mas.horas)}.</p>}
    </Seccion>
  )
}

// --- Para atender, carga y piloto --------------------------------------------------------

function ParaAtender({ filas }: { filas: Esquemas['ParaAtender'][] }) {
  return (
    <Seccion titulo="Para atender ahora" className="flex-[1_1_380px]">
      {filas.length === 0 ? (
        <p className="m-0 text-ink3">Nada urgente: no hay atrasados, cambios sin leer ni problemas.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {filas.map((f) => {
            const { texto, tono } = TIPO[f.tipo]
            const cuanto = f.dias ? plural(f.dias, 'día', 'días') : f.horas != null && f.horas >= 1 ? `hace ${demora(f.horas)}` : ''
            return (
              <li key={f.caso}>
                <Link to={`/casos/${f.caso}`} className="grid min-h-[56px] grid-cols-[auto_1fr] items-center gap-3 rounded-[12px] border border-ln bg-sf2 px-3.5 py-2.5 text-ink no-underline hover:bg-sf">
                  <Badge tone={tono}>{texto}</Badge>
                  <span className="grid min-w-0 leading-snug">
                    <strong className="font-semibold">
                      {f.codigo}
                      {cuanto && `, ${cuanto}`}
                    </strong>
                    <span className="truncate text-[14px] text-ink2">{f.detalle}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Seccion>
  )
}

function CargaPorRol({ roles, gente }: { roles: Esquemas['RolDelTablero'][]; gente: Esquemas['PersonaDelTablero'][] }) {
  const tope = Math.max(1, ...roles.map((r) => r.en_fila + r.en_mano))
  return (
    <Seccion titulo="Carga por rol" nota="en fila / en mano" className="flex-[1_1_360px]">
      <div className="grid gap-2.5">
        {roles.map((r) => {
          const total = r.en_fila + r.en_mano
          return (
            <div key={r.rol} className="grid grid-cols-[minmax(0,1fr)_40px_110px] items-center gap-2.5 border-t border-ln pt-2 first:border-t-0 first:pt-0">
              <span className="grid leading-snug">
                <strong className="font-semibold">{r.nombre}</strong>
                <span className="text-[13px] text-ink3">{plural(r.personas, 'persona', 'personas')}</span>
              </span>
              <span className="text-right">{total}</span>
              <span aria-hidden className="flex h-2.5 overflow-hidden rounded-r bg-bg2">
                <span className="h-full bg-ac" style={{ width: `${Math.round((r.en_mano / tope) * 100)}%` }} />
                <span className="h-full bg-ac/40" style={{ width: `${Math.round((r.en_fila / tope) * 100)}%` }} />
              </span>
              <span className="sr-only">
                {r.en_mano} en mano y {r.en_fila} en fila
              </span>
            </div>
          )
        })}
      </div>
      {gente.some((p) => p.en_mano > 0) && (
        <p className="m-0 text-[14px] text-ink3">
          En la mano ahora: {gente.filter((p) => p.en_mano > 0).map((p) => `${p.nombre} (${p.en_mano})`).join(', ')}.
        </p>
      )}
    </Seccion>
  )
}

function Piloto({ p }: { p: Tablero['piloto'] }) {
  const ent = p.entregas_a_tiempo
  const datos: [string, string][] = [
    ['Casos en el sistema', p.casos ? String(p.casos) : 'sin datos'],
    ['Tiempo de carga', p.segundos_carga != null ? `${Math.floor(p.segundos_carga / 60)}:${String(p.segundos_carga % 60).padStart(2, '0')} min` : 'sin datos'],
    ['Cambios perdidos', p.cambios_perdidos != null ? String(p.cambios_perdidos) : 'sin datos'],
    ['Entregas a tiempo', ent.entregados ? `${Math.round((ent.a_tiempo / ent.entregados) * 100)} %` : 'sin datos'],
  ]
  return (
    <Seccion titulo="Piloto de coronas" className="flex-[1_1_300px]">
      <dl className="m-0 grid grid-cols-2 gap-2.5">
        {datos.map(([rotulo, valor]) => (
          <div key={rotulo} className="grid gap-0.5 rounded-[12px] border border-ln bg-sf2 p-3">
            <dt className="text-[13px] text-ink2">{rotulo}</dt>
            <dd className="m-0 text-[24px] font-light">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[14px] text-ink3">Se mide desde el arranque. Meta: todas las coronas por el sistema dos semanas seguidas.</p>
    </Seccion>
  )
}

// --- Pantalla ----------------------------------------------------------------------------

export function TableroPantalla() {
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const q = useQuery({
    queryKey: ['tablero', periodo],
    queryFn: () => pedir(api.GET('/api/vistas/tablero', { params: { query: { periodo } } })),
    refetchInterval: 120_000,
  })
  const t = q.data
  // La carga de "mañana" es el próximo día hábil con lugar en el calendario, no el día siguiente a secas.
  const proximo = t?.dias.find((d) => d.futuro && d.habil)

  return (
    <div className="grid gap-4.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[30px] leading-tight font-semibold tracking-tight">Cómo viene el laboratorio</h1>
          {t && <span className="text-ink3">{fechaCorta(t.hoy)}.</span>}
        </div>
        <Segmented<Periodo> label="Período" compacto value={periodo} onChange={setPeriodo} options={PERIODOS} />
      </header>

      {q.error && <Aviso>{q.error.message}</Aviso>}
      {!t && !q.error && <p className="m-0 text-ink3">Cargando el tablero…</p>}

      {t && (
        <>
          <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <Kpi label="En curso" valor={t.en_curso} hint="casos abiertos" />
            <Kpi label={ENTREGAS[periodo]} valor={t.entregas.entregados} de={t.entregas.prometidos || undefined} hint={t.entregas.prometidos ? undefined : 'no había nada prometido'} />
            <Kpi
              label="Atrasados"
              valor={t.atrasados.total}
              hint={
                t.atrasados.total
                  ? [t.atrasados.en_produccion && `${t.atrasados.en_produccion} en producción`, t.atrasados.en_espera && `${t.atrasados.en_espera} esperando odontólogo`, t.atrasados.pausados && `${t.atrasados.pausados} en pausa`].filter(Boolean).join(', ')
                  : 'ninguno'
              }
            />
            <Kpi
              label="Cambios sin leer"
              valor={t.cambios_sin_leer.total}
              hint={t.cambios_sin_leer.casos[0] ? `${t.cambios_sin_leer.casos[0].codigo}, hace ${demora(t.cambios_sin_leer.casos[0].horas)}` : 'ninguno'}
            />
            {proximo && <Kpi label={`Carga del ${fechaCorta(proximo.fecha)}`} valor={proximo.trabajos} de={t.capacidad} />}
          </section>

          <div className="flex flex-wrap items-stretch gap-4.5">
            <TrabajosPorDia t={t} />
            <PorEtapa etapas={t.etapas} />
          </div>
          <div className="flex flex-wrap items-stretch gap-4.5">
            <ParaAtender filas={t.para_atender} />
            <CargaPorRol roles={t.roles} gente={t.gente} />
            <Piloto p={t.piloto} />
          </div>
        </>
      )}
    </div>
  )
}
