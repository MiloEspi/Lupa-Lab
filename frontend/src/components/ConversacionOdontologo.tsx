import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, BadgeCheck, Clock3, FileText, KeyRound, MessageCircle, Phone, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api, pedir, type Esquemas } from '../api/cliente'
import { cuando } from '../lib/escaneo'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'
import { Avatar } from './ui/avatar-foto'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Rotulo } from './ui/flotante'

type Mensaje = Esquemas['Mensaje']
export type DatosOdontologo = { nombre: string; clinica: string; matricula: string; whatsapp: string; mail: string; paga: string }

const RAPIDAS = ['Nos falta el color de la guía', '¿Puede volver a escanear el margen?', 'Falta la orden firmada', 'Confirmame la pieza, por favor']

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/**
 * Conversación del caso con el odontólogo (la del prototipo, con datos reales). Muestra lo que ve el
 * odontólogo y lo del sistema; lo "solo del equipo" queda en la pantalla del caso. Si se lo etiqueta, se
 * abre WhatsApp (wa.me) con el texto listo y lo envía una persona (D15). El link para que conteste desde
 * el caso llega con el portal del odontólogo (Etapa 2).
 */
export function ConversacionOdontologo({ casoId, codigo, od, resumen, esperando }: { casoId: string; codigo: string; od: DatosOdontologo; resumen: string; esperando: boolean }) {
  const cliente = useQueryClient()
  const mensajes = useQuery({ queryKey: ['mensajes', casoId], queryFn: () => pedir(api.GET('/api/casos/{id}/mensajes', { params: { path: { id: casoId } } })) })
  const [texto, setTexto] = useState('')
  const telefono = od.whatsapp.replace(/\D/g, '')
  const [avisar, setAvisar] = useState(!!telefono)
  const [info, setInfo] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  const hilo = (mensajes.data ?? []).filter((m) => m.tipo === 'odontologo' || m.tipo === 'sistema')

  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [hilo.length])

  const publicar = useMutation({
    mutationFn: (m: { texto: string; avisado: boolean }) =>
      pedir(
        api.POST('/api/casos/{id}/mensajes', {
          params: { path: { id: casoId } },
          body: { texto: m.texto, tipo: 'odontologo', nota: m.avisado ? 'Avisado por WhatsApp' : '', respuesta_a: null, etapa_orden: null, adjuntos: [] },
        }),
      ),
    onSuccess: () => {
      setTexto('')
      cliente.invalidateQueries({ queryKey: ['mensajes', casoId] })
    },
  })

  const enviar = () => {
    const t = texto.trim()
    if (!t) return
    const avisado = avisar && !!telefono
    // WhatsApp se abre en el clic: si se abre después de guardar, el navegador lo bloquea.
    if (avisado) {
      const cuerpo = `Hola ${od.nombre}, sobre ${codigo} (${resumen}): ${t}`
      window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(cuerpo)}`, '_blank', 'noopener')
    }
    publicar.mutate({ texto: t, avisado })
  }

  return (
    <Card tono="base" className="grid gap-4 p-5" role="region" aria-label="Conversación con el odontólogo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <Rotulo n="04">Odontólogo</Rotulo>
          <h2 className="m-0 text-[21px] font-semibold tracking-tight">Conversación del caso</h2>
        </div>
        {esperando ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-waS px-3 py-1 text-[13px] font-semibold text-wa shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--wa)_30%,transparent)]">
            <Clock3 aria-hidden className="size-3.5" />
            Esperando respuesta
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-okS px-3 py-1 text-[13px] font-semibold text-ok">
            <BadgeCheck aria-hidden className="size-3.5" />
            Al día
          </span>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(290px,370px)_minmax(0,1fr)]">
        {/* Quién es, con todo a mano para contactarlo */}
        <div className="grid gap-3 rounded-[18px] border border-ln bg-[linear-gradient(135deg,color-mix(in_srgb,var(--acS)_75%,var(--sf)),color-mix(in_srgb,var(--sf)_50%,var(--bg2)))] p-3.5">
          <div className="flex items-center gap-3">
            <Avatar ini={iniciales(od.nombre)} />
            <div className="grid min-w-0 flex-1 leading-tight">
              <strong className="display truncate text-[19px] font-semibold">{od.nombre}</strong>
              <span className="truncate text-[14px] text-ink2">
                {od.clinica}
                {od.matricula && ` · M.P. ${od.matricula}`}
              </span>
            </div>
          </div>
          <dl className="m-0 grid gap-2 text-[14px]">
            {[
              ['WhatsApp', od.whatsapp || 'Sin cargar'],
              ['Mail', od.mail || 'Sin cargar'],
              ['Paga', od.paga],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-0.5 rounded-[12px] bg-sf/70 px-3 py-2 shadow-[inset_0_0_0_1px_var(--ln)]">
                <dt className="font-mono text-[10.5px] tracking-[0.08em] text-ink3 uppercase">{k}</dt>
                <dd className={cn('m-0 font-medium break-words', v === 'Sin cargar' && 'text-ink3')}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-10" asChild>
              <Link to={`/casos/${casoId}`}>
                <FileText aria-hidden className="size-4" />
                Ver la ficha del caso
              </Link>
            </Button>
            {telefono && (
              <>
                <Button variant="secondary" className="min-h-10" asChild>
                  <a href={`https://wa.me/${telefono}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden className="size-4" />
                    Abrir WhatsApp
                  </a>
                </Button>
                <Button variant="secondary" className="min-h-10" asChild>
                  <a href={`tel:${telefono}`}>
                    <Phone aria-hidden className="size-4" />
                    Llamar
                  </a>
                </Button>
              </>
            )}
          </div>
          {!telefono && (
            <span className="text-[13px] text-ink2">
              Cargá su WhatsApp en <Link to="/clientes">Clientes</Link> para avisarle desde acá.
            </span>
          )}
        </div>

        <div className="grid min-w-0 gap-4">
          {/* Hilo */}
          <div ref={lista} className="grid max-h-[340px] min-h-[120px] content-start gap-2.5 overflow-y-auto rounded-[18px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg2)_65%,transparent),color-mix(in_srgb,var(--bg2)_35%,transparent))] p-3 shadow-[inset_0_2px_8px_rgb(24_32_44/.08)]" aria-label="Mensajes del caso" role="log">
            {hilo.length === 0 && <p className="m-0 justify-self-center py-6 text-[14px] text-ink3">Todavía no le escribieron al odontólogo por este caso.</p>}
            {hilo.map((m) => (
              <Burbuja key={m.id} m={m} />
            ))}
          </div>

          {/* Escribir */}
          <div className="grid gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {RAPIDAS.map((r) => (
                <button key={r} type="button" onClick={() => setTexto(r)} className="chip min-h-9 rounded-full px-3 text-[13px]">
                  {r}
                </button>
              ))}
            </div>
            <label htmlFor="conv-texto" className="sr-only">
              Mensaje para el odontólogo
            </label>
            <textarea
              id="conv-texto"
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar()
              }}
              placeholder={`Escribile a ${od.nombre}…`}
              className="campo w-full resize-y p-3 text-[15px] leading-normal"
            />
            <label className={cn('flex items-start gap-2.5 rounded-[14px] bg-acS/70 p-2.5 text-[14px]', telefono ? 'cursor-pointer' : 'opacity-60')}>
              <input type="checkbox" className="mt-0.5 size-5 accent-ac" checked={avisar && !!telefono} disabled={!telefono} onChange={(e) => setAvisar(e.target.checked)} />
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  <AtSign aria-hidden className="size-4 text-acT" />
                  Etiquetarlo y avisarle por WhatsApp
                </span>
                <span className="text-ink2">{telefono ? 'Se abre WhatsApp con tu mensaje listo para mandar. Queda también acá, en el caso.' : 'No tiene WhatsApp cargado: el mensaje queda en el caso.'}</span>
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ink" disabled={!texto.trim() || publicar.isPending} onClick={enviar}>
                <Send aria-hidden className="size-4" />
                {avisar && telefono ? 'Enviar y avisar por WhatsApp' : 'Dejar en la conversación'}
              </Button>
              <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} className="min-h-10 rounded-[10px] px-2 text-[13px] font-medium text-acT hover:bg-acS">
                ¿Cómo le llega y cómo contesta?
              </button>
            </div>
            {publicar.error && <Aviso>{publicar.error.message}</Aviso>}
            {info && (
              <ol className="m-0 grid list-none gap-2 rounded-[16px] border border-ln bg-sf2/70 p-3.5 text-[14px]">
                {[
                  [MessageCircle, 'Recibe un WhatsApp', 'Con tu mensaje. Lo envía una persona del laboratorio (sin API, desde wa.me).', ''],
                  [KeyRound, 'Entra con un código', 'Con un link al caso y, la primera vez, un código de 6 dígitos por mail. Un link solo nunca alcanza para entrar.', 'Etapa 2'],
                  [ShieldCheck, 'Queda registrado', 'Se guardan sus datos y ese dispositivo. Desde ahí contesta, sube un escaneo nuevo o ve la ficha del caso.', 'Etapa 2'],
                  [Sparkles, 'La respuesta vuelve al hilo', 'Mientras tanto, recepción copia acá lo que conteste por WhatsApp, así no se pierde.', ''],
                ].map(([I, t, d, etapa], i) => {
                  const Icono = I as typeof MessageCircle
                  return (
                    <li key={String(t)} className="grid grid-cols-[auto_1fr] items-start gap-3">
                      <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-acS to-[color-mix(in_srgb,var(--acS)_50%,var(--sf))] text-acT shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ac)_25%,transparent)]">
                        <Icono aria-hidden className="size-4" />
                      </span>
                      <span>
                        <strong className="font-semibold">
                          {i + 1}. {String(t)}.
                        </strong>{' '}
                        <span className="text-ink2">{String(d)}</span>
                        {etapa && <span className="ml-1.5 rounded-full bg-bg2 px-2 py-px font-mono text-[10.5px] tracking-[0.06em] text-ink3 uppercase">{String(etapa)}</span>}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function Burbuja({ m }: { m: Mensaje }) {
  if (m.tipo === 'sistema')
    return (
      <div className="justify-self-center rounded-full bg-sf/70 px-3 py-1 text-center text-[12.5px] text-ink3 shadow-[inset_0_0_0_1px_var(--ln)]">
        {m.texto} · {cuando(m.creado)}
      </div>
    )
  // Hasta el portal (Etapa 2) todo lo escribe el equipo: lo que copia del WhatsApp del odontólogo lleva una nota.
  const copiado = /copiad/i.test(m.nota)
  const yo = !copiado
  const avisado = /whatsapp/i.test(m.nota)
  return (
    <div className={cn('grid max-w-[88%] gap-1 rounded-[18px] px-3.5 py-2.5', yo ? 'justify-self-end rounded-br-[6px] bg-gradient-to-br from-[color-mix(in_srgb,var(--ac)_84%,white)] to-[color-mix(in_srgb,var(--ac)_90%,black)] text-acI shadow-[0_10px_20px_-12px_var(--ac)]' : 'justify-self-start rounded-bl-[6px] bg-gradient-to-br from-[color-mix(in_srgb,var(--waS)_70%,var(--sf))] to-[color-mix(in_srgb,var(--waS)_35%,var(--sf))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--wa)_18%,transparent),0_8px_16px_-12px_rgb(24_32_44/.4)]')}>
      <span className={cn('flex flex-wrap items-center gap-x-2 text-[12.5px] font-semibold', yo ? 'text-acI/90' : 'text-ink2')}>
        {m.autor}
        {avisado && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold', yo ? 'bg-white/20' : 'bg-waS text-wa')}>
            <AtSign aria-hidden className="size-3" />
            etiquetado
          </span>
        )}
      </span>
      <span className="text-[15px] leading-snug whitespace-pre-line">{m.texto}</span>
      <span className={cn('flex items-center gap-1.5 text-[12px]', yo ? 'text-acI/80' : 'text-ink3')}>
        {cuando(m.creado)}
        {m.nota && <span>· {m.nota.toLowerCase()}</span>}
      </span>
    </div>
  )
}
