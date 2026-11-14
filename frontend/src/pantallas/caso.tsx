/**
 * Pantalla del caso (S10). Es la del prototipo: cabecera con la franja de etapas (opción C),
 * recorrido en franja o en lista, escaneo con versiones y notas, y la conversación al lado.
 * Los datos salen de la API; lo que el prototipo mostraba ya resuelto (registrar un cambio,
 * terminar una etapa) se hace acá con dos acciones chicas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, PenLine, X } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { api, ErrorApi, pedir, type Esquemas } from '../api/cliente'
import { CabeceraCaso, type DatosCabecera } from '../components/CabeceraCaso'
import { NavegadorCasos } from '../components/NavegadorCasos'
import { PanelEscaneo } from '../components/PanelEscaneo'
import { DetalleEtapa, RecorridoCaso, type ComentarioEtapa, type EtapaRecorrido } from '../components/RecorridoCaso'
import { Avatar, Foto, type FotoData } from '../components/ui/avatar-foto'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Lightbox } from '../components/ui/lightbox'
import { Segmented } from '../components/ui/segmented'
import { coloresDeFamilia, estadoCaso, fechaCorta, habilesHasta, indiceEtapa, NOMBRE_ROL, piezasDe, TONOS_VITA, type Caso as CasoApi } from '../lib/casos'
import { cuando, urlContenido, useEscaneo } from '../lib/escaneo'
import { esImagen } from '../lib/fotos'
import { useYo } from '../lib/sesion'
import { subirArchivo } from '../lib/subir'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'

type Mensaje = Esquemas['Mensaje']
type Vis = 'equipo' | 'odontologo'
type VistaRecorrido = 'franja' | 'lista'
const CLAVE_VISTA = 'ocludent.caso.vista-recorrido'

const iniciales = (nombre: string) =>
  nombre
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

function duracion(desde?: string | null, hasta?: string | null) {
  if (!desde || !hasta) return ''
  const min = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000)
  if (min < 60) return `${Math.max(min, 1)} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${Math.round(h / 24)} días`
}

/** La cabecera del prototipo con los datos del caso. */
function datosCabecera(c: CasoApi): DatosCabecera {
  const t = c.trabajos[0]
  const etapa = indiceEtapa(t)
  const est = estadoCaso(c)
  const [, numero] = c.codigo.split('-')
  const faltan = c.fecha_prometida ? habilesHasta(c.fecha_prometida) : null
  return {
    codigo: `${c.codigo.split('-')[0]}-${numero}`,
    tipo: { nombre: t?.familia ?? 'Caso', colores: coloresDeFamilia(t?.color_familia) },
    pieza: piezasDe(t),
    material: t?.item_nombre ?? '',
    soporte: t?.soporte === 'implante' ? 'Implante' : t?.soporte === 'munon' ? 'Muñón' : null,
    color: t?.color ? { nombre: t.color, hex: TONOS_VITA[t.color] ?? '#EAD9B8' } : null,
    pide: c.profesional.nombre,
    paga: c.cliente.nombre,
    paciente: c.paciente,
    etapas: t?.etapas.map((e) => e.nombre) ?? [],
    etapa,
    responsable: t?.etapa_actual ? NOMBRE_ROL[t.etapa_actual.rol] ?? t.etapa_actual.rol : 'Recepción',
    entrega: fechaCorta(c.fecha_prometida),
    alerta: est.tono === 'alerta' ? est.texto : faltan !== null && faltan < 0 ? 'Atrasado' : undefined,
    falta: faltan === null ? 'Sin fecha' : faltan === 1 ? 'Falta 1 día hábil' : `Faltan ${faltan} días hábiles`,
    frenado: c.cambio_pendiente ? 'Cambio sin confirmar' : undefined,
  }
}

function SelectorVista({ vista, onCambiar }: { vista: VistaRecorrido; onCambiar: (v: VistaRecorrido) => void }) {
  return (
    <span role="radiogroup" aria-label="Vista del recorrido" className="inline-flex items-center gap-1 rounded-[14px] border border-ln/70 bg-sf/60 p-1 backdrop-blur">
      <span className="px-1.5 font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">Recorrido</span>
      {(['franja', 'lista'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vista === v}
          onClick={() => onCambiar(v)}
          className={cn('min-h-11 rounded-[10px] px-3 text-[13.5px] font-medium transition', vista === v ? 'bg-ink text-bg shadow-[0_4px_10px_-4px_rgb(24_32_44/.5)]' : 'text-ink2 hover:bg-sf')}
        >
          {v === 'franja' ? 'Franja' : 'Lista'}
        </button>
      ))}
    </span>
  )
}

function VisBadge({ v }: { v: string }) {
  if (v === 'sistema') return <Badge tone="info" className="text-[12px]">Registro del sistema</Badge>
  return v === 'odontologo' ? <Badge tone="ok" className="text-[12px]">Lo ve el odontólogo</Badge> : <Badge className="text-[12px]">Solo el equipo</Badge>
}

/** Botón que elige una foto (en el celular abre la cámara). */
function BotonFoto({ onFoto, className, children }: { onFoto: (f: File) => void; className?: string; children: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-1.5 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-fo', className)}>
      <Camera aria-hidden className="size-4" />
      {children}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && esImagen(f)) onFoto(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

type Filtro = 'todo' | 'equipo' | 'odontologo' | 'fotos'
const fotosDe = <A extends { tipo?: string }>(m: { adjuntos: readonly A[] }) => m.adjuntos.filter((a) => a.tipo === 'foto')
const pasa = (m: Mensaje, f: Filtro) => (f === 'todo' ? true : f === 'fotos' ? fotosDe(m).length > 0 : m.tipo === f)

export function CasoDetalle() {
  const { id = '' } = useParams()
  const { data: yo } = useYo()
  const cliente = useQueryClient()
  const caso = useQuery({ queryKey: ['caso', id], queryFn: () => pedir(api.GET('/api/casos/{id}', { params: { path: { id } } })) })
  const mensajes = useQuery({ queryKey: ['mensajes', id], queryFn: () => pedir(api.GET('/api/casos/{id}/mensajes', { params: { path: { id } } })) })
  const archivos = useQuery({ queryKey: ['archivos', id], queryFn: () => pedir(api.GET('/api/casos/{id}/archivos', { params: { path: { id } } })) })
  const { notas } = useEscaneo(id)

  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [vis, setVis] = useState<Vis>('equipo')
  const [texto, setTexto] = useState('')
  const [adjuntas, setAdjuntas] = useState<File[]>([])
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [grande, setGrande] = useState<FotoData | null>(null)
  const [confirmado, setConfirmado] = useState<string | null>(null)
  const [cambiando, setCambiando] = useState(false)
  const cerrarFoto = useCallback(() => setGrande(null), [])
  const [vista, setVista] = useState<VistaRecorrido>(() => {
    try {
      return localStorage.getItem(CLAVE_VISTA) === 'lista' ? 'lista' : 'franja'
    } catch {
      return 'franja'
    }
  })
  const [sel, setSel] = useState<number | null>(null)
  const cambiarVista = (v: VistaRecorrido) => {
    setVista(v)
    setSel(null)
    try {
      localStorage.setItem(CLAVE_VISTA, v)
    } catch {
      // sin almacenamiento: queda solo para esta pantalla
    }
  }
  // En un monitor ancho el panel de notas cabe al lado del escaneo; en uno más chico arranca cerrado.
  const [anchoParaPanel] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1700px)').matches)

  const refrescar = () => {
    cliente.invalidateQueries({ queryKey: ['caso', id] })
    cliente.invalidateQueries({ queryKey: ['mensajes', id] })
    cliente.invalidateQueries({ queryKey: ['archivos', id] })
    cliente.invalidateQueries({ queryKey: ['casos'] })
  }

  /** Publica en la conversación; las fotos se suben primero y van como adjuntos. */
  const publicarMensaje = useMutation({
    mutationFn: async (m: { texto: string; tipo?: Vis; respuesta_a?: string; etapa_orden?: number; fotos?: File[] }) => {
      const subidas = []
      for (const f of m.fotos ?? []) subidas.push((await subirArchivo(id, f, { tipo: 'foto', categoria: 'Avance' })).id)
      return pedir(
        api.POST('/api/casos/{id}/mensajes', {
          params: { path: { id } },
          body: { texto: m.texto, tipo: m.tipo ?? 'equipo', nota: '', respuesta_a: m.respuesta_a ?? null, etapa_orden: m.etapa_orden ?? null, adjuntos: subidas },
        }),
      )
    },
    onSuccess: refrescar,
  })
  const confirmar = useMutation({
    mutationFn: (datos: { rehacer: boolean; volver_a?: number }) =>
      pedir(api.POST('/api/casos/{id}/cambios/confirmar', { params: { path: { id } }, body: { rehacer: datos.rehacer, trabajo: null, volver_a: datos.volver_a ?? null, comentario: '' } })),
    onSuccess: (c, datos) => {
      setConfirmado(`${yo?.usuario.nombre_visible} confirmó el cambio${datos.rehacer ? ' y lo volvió a una etapa anterior' : ''}. El caso sigue en ${c.trabajos[0]?.etapa_actual?.nombre ?? 'su etapa'}.`)
      refrescar()
    },
  })
  const avanzar = useMutation({
    mutationFn: (trabajo: string) => pedir(api.POST('/api/casos/{id}/trabajos/{trabajo}/avanzar', { params: { path: { id, trabajo } } })),
    onSuccess: refrescar,
  })

  if (caso.isPending) return <p className="text-ink3">Cargando…</p>
  if (caso.error) return <Aviso>{caso.error.message}</Aviso>
  const c = caso.data
  const t = c.trabajos[0]
  const actual = indiceEtapa(t)
  const frenado = !!c.cambio_pendiente
  const misRoles = yo?.membresia_activa?.roles ?? []
  const lista = mensajes.data ?? []

  // --- Recorrido: cada etapa con quién, cuándo, cuánto llevó, comentarios, notas y fotos.
  const fotoDe = (a: { id: string; nombre: string }): FotoData => ({ nombre: a.nombre, bg: '#E9E7E1', src: urlContenido(id, a.id) })
  const adjuntosEnMensajes = new Set(lista.flatMap((m) => [...m.adjuntos, ...m.respuestas.flatMap((r) => r.adjuntos)]).map((a) => a.id))
  const E: EtapaRecorrido[] = (t?.etapas ?? []).map((e, i) => {
    const hecha = e.estado === 'hecha'
    const enCurso = e.estado === 'en_curso'
    const deMensajes = lista.filter((m) => m.etapa_orden === i).flatMap((m) => [...fotosDe(m), ...m.respuestas.flatMap(fotosDe)])
    const sueltas = (archivos.data ?? []).filter((a) => a.tipo === 'foto' && a.etapa === e.nombre && !adjuntosEnMensajes.has(a.id))
    return {
      nombre: e.nombre,
      quien: e.hecha_por ?? (e.en_consultorio ? 'En el consultorio' : NOMBRE_ROL[e.rol] ?? e.rol),
      cuando: hecha && e.fin ? cuando(e.fin) : enCurso ? (frenado ? 'frenado' : 'en curso') : 'pendiente',
      texto: hecha ? 'Hecha.' : enCurso ? (frenado ? 'Frenado: hay un cambio de ficha sin confirmar.' : 'En curso.') : 'Pendiente.',
      meta: hecha ? duracion(e.inicio, e.fin) : enCurso && e.inicio ? `desde ${cuando(e.inicio)}` : '',
      fotos: [...deMensajes, ...sueltas].map(fotoDe),
    }
  })
  const comentarios: ComentarioEtapa[][] = E.map((_, i) =>
    lista
      .filter((m) => m.etapa_orden === i && m.tipo !== 'sistema')
      .map((m) => ({ id: m.id, ini: iniciales(m.autor), autor: m.autor, rol: m.rol, hora: cuando(m.creado), texto: m.texto, odontologo: m.tipo === 'odontologo', respuestas: m.respuestas.length })),
  )
  const notasEtapa = E.map((e) => notas.filter((n) => n.etapa === e.nombre).length)
  const comentarEtapa = (etapa: number, txt: string) => publicarMensaje.mutate({ texto: txt, etapa_orden: etapa })
  const subirFotoEtapa = (etapa: number, f: File) => publicarMensaje.mutate({ texto: 'Foto del avance', etapa_orden: etapa, fotos: [f] })

  const visibles = lista.filter((m) => pasa(m, filtro))
  const FILTROS: { id: Filtro; label: string }[] = (['todo', 'equipo', 'odontologo', 'fotos'] as const).map((f) => ({
    id: f,
    label: `${{ todo: 'Todo', equipo: 'Equipo', odontologo: 'Con el odontólogo', fotos: 'Fotos' }[f]} (${lista.filter((m) => pasa(m, f)).length})`,
  }))
  const publicar = () => {
    if (!texto.trim() && !adjuntas.length) return
    publicarMensaje.mutate({ texto: texto.trim() || 'Foto del avance', tipo: vis, fotos: adjuntas }, { onSuccess: () => (setTexto(''), setAdjuntas([])) })
  }
  const enviarRespuesta = (pid: string) => {
    if (!respuesta.trim()) return
    publicarMensaje.mutate({ texto: respuesta.trim(), respuesta_a: pid }, { onSuccess: () => (setRespuesta(''), setRespondiendo(null)) })
  }

  // --- Cambio sin confirmar
  const pendiente = c.cambio_pendiente
  const puedeConfirmar = !!pendiente && pendiente.confirma.some((r) => misRoles.includes(r as never))
  const anterior = actual > 0 ? t?.etapas[actual - 1] : undefined
  const etapaActual = t?.etapa_actual
  const puedeAvanzar = !!etapaActual && !frenado && c.estado === 'abierto' && (misRoles.includes(etapaActual.rol as never) || misRoles.includes('supervision'))
  const puedeCambiar = !!yo?.permisos.includes('registrar_cambio') && c.estado === 'abierto'

  const conversacion = (
    <Card id="conversacion-caso" className="grid scroll-mt-4 gap-3.5 p-5" aria-label="Conversación del caso" role="region">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-[18px] font-semibold">Conversación</h2>
        <Segmented<Filtro> label="Filtrar la conversación" value={filtro} onChange={setFiltro} options={FILTROS} />
      </div>

      <div className="grid gap-2.5 rounded-[14px] bg-sf2 p-3.5">
        <label htmlFor="nuevo" className="sr-only">Nueva actualización del caso</label>
        <input
          id="nuevo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && publicar()}
          placeholder="Contá una novedad del caso. Usá @ para avisarle a alguien."
          className="min-h-11 w-full rounded-[12px] border border-ctl bg-sf px-3.5 text-ink placeholder:text-ink3"
        />
        {adjuntas.length > 0 && (
          <ul aria-label="Fotos para adjuntar" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {adjuntas.map((f) => (
              <li key={f.name + f.size} className="relative">
                <Foto nombre={f.name} bg="#E9E7E1" src={URL.createObjectURL(f)} className="h-[72px] w-[100px]" />
                <button type="button" aria-label={`Sacar la foto ${f.name}`} onClick={() => setAdjuntas(adjuntas.filter((x) => x !== f))} className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-ink text-bg shadow-[0_4px_8px_-2px_rgb(0_0_0/.4)]">
                  <X aria-hidden className="size-3.5" strokeWidth={3} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Vis> label="Quién lo ve" value={vis} onChange={setVis} options={[{ id: 'equipo', label: 'Solo el equipo' }, { id: 'odontologo', label: 'También el odontólogo' }]} />
          <BotonFoto onFoto={(f) => setAdjuntas([...adjuntas, f])} className="bt-sec min-h-10 rounded-[12px] border border-ctl bg-sf px-3.5 text-[14.5px] font-medium text-ink hover:bg-sf2">
            Agregar foto
          </BotonFoto>
          <span className="flex-auto" />
          <Button className="min-h-10" onClick={publicar} disabled={(!texto.trim() && !adjuntas.length) || publicarMensaje.isPending}>
            {publicarMensaje.isPending ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
        {publicarMensaje.error && <Aviso>{publicarMensaje.error.message}</Aviso>}
      </div>

      <ol className="m-0 flex list-none flex-col p-0">
        {visibles.length === 0 && <li className="border-t border-ln py-4 text-[14px] text-ink3">Todavía no hay mensajes. Lo que se escriba acá queda en el caso, en la etapa en la que se escribió.</li>}
        {visibles.map((m) => (
          <li key={m.id} className="grid gap-2.5 border-t border-ln py-4">
            <article className="flex gap-3">
              <Avatar ini={m.tipo === 'sistema' ? 'LL' : iniciales(m.autor)} />
              <div className="grid min-w-0 flex-auto gap-1.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <strong className="font-semibold">{m.autor}</strong>
                  <span className="text-[14px] text-ink3">
                    {m.rol}, {cuando(m.creado)}
                  </span>
                  <VisBadge v={m.tipo ?? 'equipo'} />
                  {m.etapa && <span className="font-mono text-[11px] tracking-[0.08em] text-ink3 uppercase">en {m.etapa}</span>}
                </div>
                <p className="m-0 max-w-[68ch] text-[16px] leading-normal">{m.texto}</p>
                {m.nota && <span className="text-[13px] text-ink3">{m.nota}</span>}
                {m.version_ficha && <Badge tone="atencion" className="self-start">Cambio registrado: versión {m.version_ficha} de la ficha</Badge>}
                {fotosDe(m).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {fotosDe(m).map((a) => {
                      const f = fotoDe(a)
                      return <Foto key={a.id + f.src} {...f} onAbrir={() => setGrande(f)} className="h-[120px] w-[170px]" />
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3">
                  <Button variant="ghost" className="min-h-9 px-1 text-[14px] text-ink2 hover:bg-transparent hover:text-acT" aria-expanded={respondiendo === m.id} onClick={() => setRespondiendo(respondiendo === m.id ? null : m.id)}>
                    Responder
                  </Button>
                  <BotonFoto onFoto={(f) => publicarMensaje.mutate({ texto: 'Foto', respuesta_a: m.id, fotos: [f] })} className="min-h-9 rounded-[10px] px-1 text-[14px] font-medium text-ink2 hover:text-acT">
                    Agregar foto
                  </BotonFoto>
                </div>
              </div>
            </article>
            {(m.respuestas.length > 0 || respondiendo === m.id) && (
              <ol className="m-0 ml-[19px] flex list-none flex-col gap-3 border-l-2 border-ln p-0 pl-[31px]">
                {m.respuestas.map((r) => (
                  <li key={r.id} className="flex gap-2.5">
                    <Avatar ini={iniciales(r.autor)} className="size-8 text-[12px]" />
                    <div className="grid min-w-0 gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <strong className="text-[15px] font-semibold">{r.autor}</strong>
                        <span className="text-[13px] text-ink3">
                          {r.rol}, {cuando(r.creado)}
                        </span>
                        <VisBadge v={r.tipo ?? 'equipo'} />
                      </div>
                      <p className="m-0 max-w-[66ch] leading-normal">{r.texto}</p>
                      {fotosDe(r).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {fotosDe(r).map((a) => {
                            const f = fotoDe(a)
                            return <Foto key={a.id} {...f} onAbrir={() => setGrande(f)} className="h-[90px] w-[130px]" />
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {respondiendo === m.id && (
                  <li className="flex items-center gap-2">
                    <label htmlFor={`r-${m.id}`} className="sr-only">Respuesta</label>
                    <input
                      id={`r-${m.id}`}
                      autoFocus
                      value={respuesta}
                      onChange={(e) => setRespuesta(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && enviarRespuesta(m.id)}
                      placeholder="Escribí tu respuesta"
                      className="min-h-11 w-full rounded-[12px] border border-ctl bg-sf px-3.5 text-ink placeholder:text-ink3"
                    />
                    <Button onClick={() => enviarRespuesta(m.id)} disabled={!respuesta.trim()}>
                      Enviar
                    </Button>
                  </li>
                )}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </Card>
  )

  const escaneo = (
    <section id="escaneo-caso" aria-label="Escaneo y diseño" className="min-w-0 scroll-mt-4">
      <Card className="p-4 sm:p-5">
        <PanelEscaneo casoId={id} autor={yo?.usuario.nombre_visible ?? ''} compacto alto="clamp(440px, calc(100vh - 250px), 780px)" panelPorDefecto={anchoParaPanel} />
      </Card>
    </section>
  )

  const acciones = (
    <>
      {puedeCambiar && (
        <Button variant="secondary" className="min-h-11 px-3.5 text-[14px]" aria-expanded={cambiando} onClick={() => setCambiando(!cambiando)}>
          <PenLine aria-hidden className="size-4" /> Registrar cambio
        </Button>
      )}
      {puedeAvanzar && t && (
        <Button variant="ink" className="min-h-11 px-3.5 text-[14px]" disabled={avanzar.isPending} onClick={() => avanzar.mutate(t.id)}>
          <Check aria-hidden className="size-4" /> Terminar {etapaActual?.nombre}
        </Button>
      )}
      <SelectorVista vista={vista} onCambiar={cambiarVista} />
    </>
  )

  return (
    <>
      <NavegadorCasos actual={c.id} />

      <CabeceraCaso c={datosCabecera(c)} frenado={frenado} seleccionada={vista === 'franja' ? sel : null} onElegir={vista === 'franja' ? (i) => setSel(sel === i ? null : i) : undefined} accion={acciones} />
      {avanzar.error && <Aviso>{avanzar.error.message}</Aviso>}
      {cambiando && t && <RegistrarCambio caso={c} trabajo={t} onListo={() => (setCambiando(false), setConfirmado(null), refrescar())} onCerrar={() => setCambiando(false)} />}

      {vista === 'franja' && sel !== null && E[sel] && (
        <Card role="region" aria-label={`Etapa ${E[sel].nombre}`} className="entra grid gap-3 p-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink3 uppercase">
                Etapa {sel + 1}/{E.length} · {sel < actual ? 'hecha' : sel === actual ? (frenado ? 'frenada' : 'en curso') : 'pendiente'}
              </span>
              <h2 className="m-0 text-[19px] font-semibold">{E[sel].nombre}</h2>
              <span className="text-[13.5px] text-ink3">{[E[sel].quien, E[sel].cuando, E[sel].meta].filter(Boolean).join(' · ')}</span>
            </div>
            <button type="button" aria-label="Cerrar la etapa" onClick={() => setSel(null)} className="grid size-11 place-items-center rounded-[12px] text-ink2 transition hover:bg-sf hover:text-ink">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <DetalleEtapa e={E[sel]} pendiente={sel > actual} comentarios={comentarios[sel] ?? []} notas={notasEtapa[sel] ?? 0} onFoto={(f) => subirFotoEtapa(sel, f)} onComentar={(txt) => comentarEtapa(sel, txt)} onAbrirFoto={setGrande} ancho />
        </Card>
      )}

      {pendiente ? (
        <section aria-label="Cambio sin confirmar" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ficha border border-wa bg-waS px-4 py-3">
          <div className="grid min-w-0 flex-[999_1_340px] gap-0.5">
            <strong className="text-[16px] font-semibold text-wa">
              Cambio sin confirmar: {pendiente.cambios.map((d) => `${d.campo} ${String(d.antes || '—')} a ${String(d.despues || '—')}`).join(', ')}, versión {pendiente.version} de la ficha
            </strong>
            <span className="text-[14px]">
              {pendiente.motivo} Lo registró {pendiente.registrado_por} {cuando(pendiente.creado)}. El caso no avanza hasta que {pendiente.confirma.map((r) => NOMBRE_ROL[r] ?? r).join(' o ')} confirme que lo leyó.
            </span>
          </div>
          {puedeConfirmar ? (
            <div className="flex flex-wrap gap-2">
              <Button disabled={confirmar.isPending} onClick={() => confirmar.mutate({ rehacer: false })}>
                Confirmé que lo leí
              </Button>
              {anterior && (
                <Button variant="secondary" disabled={confirmar.isPending} onClick={() => confirmar.mutate({ rehacer: true, volver_a: anterior.orden })}>
                  Hay que rehacer: volver a {anterior.nombre}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-[13.5px] font-medium text-wa">Lo confirma {pendiente.confirma.map((r) => NOMBRE_ROL[r] ?? r).join(' o ')}.</span>
          )}
          {confirmar.error && <Aviso>{confirmar.error.message}</Aviso>}
        </section>
      ) : (
        confirmado && (
          <p role="status" className="m-0 rounded-ficha border border-ok bg-okS px-4 py-2.5 font-semibold text-ok">
            {confirmado}
          </p>
        )
      )}

      {vista === 'franja' ? (
        // Franja: el recorrido vive en la cabecera; al lado del escaneo queda la conversación.
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
          {escaneo}
          <div className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:rounded-ficha">{conversacion}</div>
        </div>
      ) : (
        <>
          {/* Lista: el escaneo a la izquierda y el recorrido vertical a la derecha; la conversación abajo. */}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,430px)]">
            {escaneo}
            <div className="min-w-0 xl:sticky xl:top-4">
              <Card aria-label="Recorrido" role="region" className="grid gap-3 p-4 sm:p-5 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
                <div className="grid gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="m-0 text-[18px] font-semibold">Recorrido</h2>
                    <span className="font-mono text-[11.5px] text-ink3">
                      Etapa {Math.min(actual + 1, E.length)} de {E.length}
                    </span>
                  </div>
                  <span className="text-[13.5px] text-ink3">Abrí una etapa para ver sus comentarios, las notas del escaneo y las fotos.</span>
                </div>
                <RecorridoCaso etapas={E} actual={actual} frenada={frenado} comentarios={comentarios} notas={notasEtapa} onFoto={subirFotoEtapa} onComentar={comentarEtapa} onAbrirFoto={setGrande} />
              </Card>
            </div>
          </div>
          {conversacion}
        </>
      )}

      <Lightbox foto={grande} onClose={cerrarFoto} />
    </>
  )
}

const CAMPOS = [
  { id: 'color', texto: 'Color' },
  { id: 'material', texto: 'Material' },
  { id: 'observaciones', texto: 'Indicaciones' },
] as const

/** Registrar un cambio de ficha (S7): queda como versión nueva y frena el caso hasta que lo lean. */
function RegistrarCambio({ caso, trabajo, onListo, onCerrar }: { caso: CasoApi; trabajo: CasoApi['trabajos'][number]; onListo: () => void; onCerrar: () => void }) {
  const [campo, setCampo] = useState<(typeof CAMPOS)[number]['id']>('color')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const guardar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/cambios', { params: { path: { id: caso.id } }, body: { trabajo: trabajo.id, cambios: { [campo]: valor }, motivo } })),
    onSuccess: onListo,
  })
  const errorCampo = guardar.error instanceof ErrorApi ? Object.values(guardar.error.campos)[0]?.[0] : undefined
  const actual = String((trabajo as Record<string, unknown>)[campo] ?? '') || '—'
  return (
    <Card tono="calido" className="entra grid gap-3 p-5" role="region" aria-label="Registrar un cambio">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="m-0 text-[18px] font-semibold">Registrar un cambio de ficha</h2>
          <span className="text-[14px] text-ink2">Queda como versión {caso.version_ficha + 1} y el caso no avanza hasta que lo confirme quien lo tiene. Un mensaje de WhatsApp no cambia la ficha: esto sí.</span>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} className="grid size-11 shrink-0 place-items-center rounded-[12px] text-ink2 hover:bg-sf">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <Segmented<(typeof CAMPOS)[number]['id']> label="Qué cambia" value={campo} onChange={(v) => (setCampo(v), setValor(''))} options={CAMPOS.map((c) => ({ id: c.id, label: c.texto }))} className="max-w-[460px]" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[14px] font-semibold">
          Nuevo valor <span className="font-normal text-ink3">(hoy: {actual})</span>
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={campo === 'color' ? 'A3' : ''} className="campo min-h-11 px-3.5 text-[15px] font-normal" />
        </label>
        <label className="grid gap-1.5 text-[14px] font-semibold">
          Qué pidió y por dónde
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="El Dr. Pérez pidió A3 por WhatsApp" className="campo min-h-11 px-3.5 text-[15px] font-normal" />
        </label>
      </div>
      {guardar.error && <Aviso>{errorCampo ?? guardar.error.message}</Aviso>}
      <Button className="justify-self-start" disabled={!valor.trim() || !motivo.trim() || guardar.isPending} onClick={() => guardar.mutate()}>
        Registrar cambio
      </Button>
    </Card>
  )
}
