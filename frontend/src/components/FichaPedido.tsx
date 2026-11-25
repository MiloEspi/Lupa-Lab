import { ChevronDown, ClipboardList, FileText, MessageCircle, Quote, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Esquemas } from '../api/cliente'
import { describirPieza, type Caso } from '../lib/casos'
import { cuando, urlContenido } from '../lib/escaneo'
import { cn } from '../lib/utils'
import { Foto, type FotoData } from './ui/avatar-foto'
import { Card } from './ui/card'

type Archivo = Esquemas['Archivo']

const IMAGEN = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'avif'])
const esImagen = (a: Archivo) => IMAGEN.has(a.formato.toLowerCase())

type Grupo = { id: string; titulo: string; archivos: Archivo[] }

/** Agrupa lo que mandó el odontólogo según qué es: radiografías, fotos de la boca o del color, la orden y lo demás. */
function agrupar(archivos: Archivo[]): Grupo[] {
  const listos = archivos.filter((a) => a.estado === 'listo' && a.tipo !== 'escaneo' && a.tipo !== 'diseno')
  const esRadio = (a: Archivo) => /radiograf|rx|panor/i.test(`${a.categoria} ${a.nombre}`)
  const grupos: Grupo[] = [
    { id: 'radio', titulo: 'Radiografías', archivos: listos.filter(esRadio) },
    { id: 'fotos', titulo: 'Fotos de la boca y del color', archivos: listos.filter((a) => a.tipo === 'foto' && !esRadio(a) && !/orden/i.test(a.categoria)) },
    { id: 'orden', titulo: 'Orden', archivos: listos.filter((a) => a.tipo === 'orden' || /orden/i.test(a.categoria)).filter((a) => !esRadio(a)) },
    { id: 'otros', titulo: 'Otros archivos', archivos: listos.filter((a) => a.tipo === 'otro' && !esRadio(a)) },
  ]
  // Un archivo cae en un solo grupo: la orden en papel es foto y orden a la vez, se queda en "Orden".
  const vistos = new Set<string>()
  return grupos
    .map((g) => ({ ...g, archivos: g.archivos.filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true))) }))
    .filter((g) => g.archivos.length > 0)
}

/** El mensaje que pegó recepción al crear el caso (WhatsApp o mail), tal cual llegó. */
export type MensajeOriginal = { texto: string; autor: string; creado: string }

const ORIGEN: Record<string, string> ={ papel: 'llegó en papel', caja: 'viene con la caja', digital: 'la cargó el odontólogo' }

/** Lo que escribió el odontólogo, sin repetir lo que está igual en el caso y en el trabajo. */
const indicacionesDe = (caso: Caso) =>
  [...new Set([caso.observaciones, ...caso.trabajos.map((x) => x.observaciones)].map((x) => x.trim()).filter(Boolean))]

/**
 * El botón de la cabecera que abre el pedido. Lleva una marca para saber, sin abrirlo, si el odontólogo dejó
 * indicaciones: es lo más importante que tiene para decir sobre la boca y no puede pasar desapercibido.
 */
export function BotonPedido({ caso, abierto, onClick }: { caso: Caso; abierto: boolean; onClick: () => void }) {
  const con = indicacionesDe(caso).length > 0
  return (
    <button
      type="button"
      aria-expanded={abierto}
      aria-controls="pedido-odontologo"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 flex-none items-center gap-2.5 rounded-full border py-1 pr-3.5 pl-1.5 text-left transition duration-200 hover:-translate-y-0.5',
        abierto ? 'border-ac bg-acS shadow-[0_8px_18px_-10px_var(--ac)]' : con ? 'border-ac/55 bg-acS/80' : 'border-ln/80 bg-sf/75',
      )}
    >
      <span className={cn('relative grid size-8 place-items-center rounded-full', con ? 'bg-ac text-acI' : 'bg-bg2 text-ink2')}>
        <ClipboardList aria-hidden className="size-4" strokeWidth={2} />
        {con && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sf bg-wa" />}
      </span>
      <span className="grid leading-tight">
        <span className="text-[15px] font-semibold">Pedido del odontólogo</span>
        <span className={cn('text-[12.5px]', con ? 'font-semibold text-acT' : 'text-ink2')}>{con ? 'Con indicaciones' : 'Sin indicaciones escritas'}</span>
      </span>
      <ChevronDown aria-hidden className={cn('size-4 text-ink2 transition-transform duration-200', abierto && 'rotate-180')} />
    </button>
  )
}

/**
 * El pedido, desplegado desde la cabecera por encima del resto: no empuja el escaneo hacia abajo. Primero lo
 * que escribió el odontólogo (la boca, la encía, los dientes vecinos, cómo lo quiere) y los datos que la
 * cabecera no tiene lugar para mostrar (el implante, la pieza en palabras, la orden); lo que mandó aparte
 * (radiografías, fotos) va después y más chico, porque se consulta menos. Se cierra con Esc.
 */
export function FichaPedido({ caso, archivos, original, onAbrirFoto, onCerrar }: { caso: Caso; archivos: Archivo[]; original?: MensajeOriginal; onAbrirFoto: (f: FotoData) => void; onCerrar: () => void }) {
  const t = caso.trabajos[0]
  const indicaciones = indicacionesDe(caso)
  const grupos = agrupar(archivos)
  const total = grupos.reduce((s, g) => s + g.archivos.length, 0)
  const piezas = Object.keys((t?.piezas as Record<string, unknown>) ?? {}).sort()

  useEffect(() => {
    const alApretar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCerrar()
    }
    document.addEventListener('keydown', alApretar)
    return () => document.removeEventListener('keydown', alApretar)
  }, [onCerrar])

  const fotoDe = (a: Archivo): FotoData => ({ nombre: a.categoria || a.nombre, bg: '#E9E7E1', src: urlContenido(caso.id, a.id) })

  const datos: [string, string][] = [
    ...piezas.map((p) => ['Pieza ' + p, describirPieza(p).replace(/\.$/, '') || 'Pieza FDI'] as [string, string]),
    ...(t?.soporte === 'implante' ? [['Implante', [t.implante_marca, t.implante_diametro && `Ø ${t.implante_diametro}`, t.implante_conexion].filter(Boolean).join(' · ') || 'Sin datos'] as [string, string]] : []),
    ...(t?.soporte === 'munon' ? [['Soporte', 'Muñón (diente tallado)'] as [string, string]] : []),
    ...(caso.orden_numero || caso.orden_origen
      ? [['Orden', [caso.orden_numero && `N.º ${caso.orden_numero}`, caso.orden_firmada ? 'firmada' : 'sin firmar', ORIGEN[caso.orden_origen]].filter(Boolean).join(' · ')] as [string, string]]
      : []),
    ...(caso.llega_impresion ? [['Escaneo', 'No hay archivo: llega una impresión con el cadete'] as [string, string]] : []),
  ]

  return (
    <Card id="pedido-odontologo" tono="base" role="region" aria-label="Pedido del odontólogo" className="grid max-h-[min(70vh,640px)] gap-4 overflow-y-auto p-4 shadow-[0_30px_60px_-20px_rgb(24_32_44/.55)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2.5 text-[19px] font-bold">
          <span aria-hidden className="grid size-9 place-items-center rounded-[12px] bg-acS text-acT">
            <ClipboardList className="size-5" />
          </span>
          Pedido del odontólogo
        </h2>
        <button type="button" aria-label="Cerrar el pedido" onClick={onCerrar} className="grid size-11 flex-none place-items-center rounded-[12px] text-ink2 transition hover:bg-sf2 hover:text-ink">
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className="grid gap-3">
        {indicaciones.length ? (
          indicaciones.map((txt) => (
            <figure key={txt} className="m-0 grid gap-2 rounded-[16px] border border-ac/40 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--acS)_75%,var(--sf)),var(--sf))] p-4">
              <Quote aria-hidden className="size-5 text-acT" />
              <blockquote className="m-0 max-w-[75ch] text-[18px] leading-snug whitespace-pre-line">{txt}</blockquote>
              <figcaption className="text-[13px] text-ink2">Indicaciones del pedido de {caso.profesional.nombre}.</figcaption>
            </figure>
          ))
        ) : (
          <div className="grid gap-2 rounded-[16px] border border-dashed border-ctl bg-sf/60 p-3.5 text-[14.5px]">
            <span>
              <strong className="font-semibold">El odontólogo no dejó indicaciones.</strong> Si falta saber algo de la boca, la encía, los dientes vecinos o cómo la quiere, preguntáselo.
            </span>
            <a href="#conversacion-caso" onClick={onCerrar} className="inline-flex items-center gap-1.5 justify-self-start font-semibold text-acT">
              <MessageCircle aria-hidden className="size-4" />
              Escribirle desde la conversación
            </a>
          </div>
        )}

        {original && (
          <details className="group rounded-[14px] border border-ln bg-sf/70 px-3.5 py-2.5">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-semibold text-ink2 marker:hidden">
              <span>Mensaje original, tal cual llegó</span>
              <ChevronDown aria-hidden className="size-4 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="mt-2 mb-1.5 max-w-[75ch] text-[15px] leading-snug whitespace-pre-line">{original.texto}</p>
            <span className="text-[13px] text-ink2">
              Lo pegó {original.autor} {cuando(original.creado)}. Es un registro de lo que llegó: los datos del pedido son los de la ficha.
            </span>
          </details>
        )}

        {datos.length > 0 && (
          <dl className="m-0 grid gap-x-4 gap-y-1.5 text-[14.5px] sm:grid-cols-[auto_minmax(0,1fr)]">
            {datos.map(([k, v]) => (
              <div key={k + v} className="contents">
                <dt className="font-mono text-[10.5px] tracking-[0.1em] text-ink2 uppercase sm:pt-1">{k}</dt>
                <dd className="m-0 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="grid gap-2.5 border-t border-ln pt-3.5">
        <h3 className="m-0 font-mono text-[10.5px] font-semibold tracking-[0.1em] text-ink2 uppercase">
          Lo que mandó aparte <span className="ml-1 rounded-full bg-bg2 px-1.5 py-px text-[11px] text-ink">{total}</span>
        </h3>
        {grupos.length === 0 && <p className="m-0 text-[14px] text-ink2">No mandó radiografías, fotos ni otros archivos con el pedido.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {grupos.map((g) => (
            <section key={g.id} aria-label={g.titulo} className="grid gap-1.5">
              <h4 className="m-0 text-[13px] font-semibold text-ink2">
                {g.titulo} ({g.archivos.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {g.archivos.map((a) =>
                  esImagen(a) ? (
                    <Foto key={a.id} {...fotoDe(a)} onAbrir={() => onAbrirFoto(fotoDe(a))} className="h-[60px] w-[84px]" />
                  ) : (
                    <a
                      key={a.id}
                      href={urlContenido(caso.id, a.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 max-w-[220px] items-center gap-2 rounded-[14px] border border-ln bg-sf px-3 text-[14px] font-medium transition hover:-translate-y-0.5 hover:bg-acS"
                    >
                      <FileText aria-hidden className="size-4 shrink-0 text-acT" />
                      <span className="truncate">{a.categoria || a.nombre}</span>
                      <span className="font-mono text-[11px] text-ink2 uppercase">{a.formato}</span>
                    </a>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Card>
  )
}
