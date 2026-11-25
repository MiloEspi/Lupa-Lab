/**
 * Pantalla del caso (S10). Es la del prototipo: cabecera con la franja de etapas (opción C),
 * recorrido en franja o en lista, escaneo con versiones y notas, y la conversación al lado.
 * Los datos salen de la API; lo que el prototipo mostraba ya resuelto (registrar un cambio,
 * terminar una etapa) se hace acá con dos acciones chicas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Camera, Check, MessageCircle, Pause, PenLine, Phone, Play, Printer, X } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { api, ErrorApi, pedir, type Esquemas } from '../api/cliente'
import { CabeceraCaso, type DatosCabecera } from '../components/CabeceraCaso'
import { CajaMensaje, TextoConMenciones } from '../components/CajaMensaje'
import { BotonPedido, FichaPedido } from '../components/FichaPedido'
import { NavegadorCasos } from '../components/NavegadorCasos'
import { PanelEscaneo } from '../components/PanelEscaneo'
import { ProcesoCaso, type EtapaProceso } from '../components/ProcesoCaso'
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
import { idsMencionados, useMencionables, type Mencionable } from '../lib/menciones'
import { useYo } from '../lib/sesion'
import { subirArchivo } from '../lib/subir'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'

type Mensaje = Esquemas['Mensaje']
type Vis = 'equipo' | 'odontologo'
/** A quién va lo que se escribe: al equipo, al odontólogo (con aviso por WhatsApp) o es lo que él contestó por WhatsApp. */
type Destino = Vis | 'respuesta'
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
    frenado: c.pausado ? `Pausado: ${c.pausa_motivo}` : c.cambio_pendiente ? 'Cambio sin confirmar' : c.en_espera ? 'En espera del odontólogo' : undefined,
  }
}

function SelectorVista({ vista, onCambiar }: { vista: VistaRecorrido; onCambiar: (v: VistaRecorrido) => void }) {
  return (
    <span role="radiogroup" aria-label="Vista del recorrido" className="inline-flex items-center gap-1 rounded-[14px] border border-ln/70 bg-sf/60 p-1 backdrop-blur">
      <span className="px-1.5 font-mono text-[10.5px] tracking-[0.1em] text-ink2 uppercase">Vista</span>
      {(['franja', 'lista'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vista === v}
          onClick={() => onCambiar(v)}
          className={cn('min-h-11 rounded-[10px] px-3 text-[13.5px] font-medium transition', vista === v ? 'bg-ink text-bg shadow-[0_4px_10px_-4px_rgb(24_32_44/.5)]' : 'text-ink2 hover:bg-sf')}
        >
          {v === 'franja' ? 'Horizontal' : 'Lista'}
        </button>
      ))}
    </span>
  )
}

/** Lo que el odontólogo contestó por WhatsApp lo copia el equipo y lleva una nota ("Copiado del WhatsApp por Ana"). */
const esDelOdontologo = (m: { tipo?: string; nota: string }) => m.tipo === 'odontologo' && /copiad/i.test(m.nota)

/** De dónde vino el mensaje: una marca verde si pasó por WhatsApp (se avisó por ahí o se copió una respuesta); si no, la nota tal cual. */
function OrigenWa({ nota }: { nota: string }) {
  if (!nota) return null
  if (!/whatsapp/i.test(nota)) return <span className="text-[13px] text-ink2">{nota}</span>
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#DDF5E7] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#0B5E33]">
      <MessageCircle aria-hidden className="size-3.5" />
      {nota}
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

type Filtro = 'todo' | 'equipo' | 'odontologo' | 'fotos' | 'menciones'
const fotosDe = <A extends { tipo?: string }>(m: { adjuntos: readonly A[] }) => m.adjuntos.filter((a) => a.tipo === 'foto')
/** `yoId`: la membresía de quien mira, para "me mencionaron" (también cuenta si lo etiquetaron en una respuesta). */
const pasa = (m: Mensaje, f: Filtro, yoId?: string) =>
  f === 'todo'
    ? true
    : f === 'fotos'
      ? fotosDe(m).length > 0
      : f === 'menciones'
        ? !!yoId && [m, ...m.respuestas].some((x) => (x.menciones ?? []).some((e) => e.id === yoId))
        : m.tipo === f

export function CasoDetalle() {
  const { id = '' } = useParams()
  const { data: yo } = useYo()
  const cliente = useQueryClient()
  const caso = useQuery({ queryKey: ['caso', id], queryFn: () => pedir(api.GET('/api/casos/{id}', { params: { path: { id } } })) })
  const mensajes = useQuery({ queryKey: ['mensajes', id], queryFn: () => pedir(api.GET('/api/casos/{id}/mensajes', { params: { path: { id } } })) })
  const archivos = useQuery({ queryKey: ['archivos', id], queryFn: () => pedir(api.GET('/api/casos/{id}/archivos', { params: { path: { id } } })) })
  // El WhatsApp del odontólogo viene con el estado de la revisión (el mismo que usa la pantalla de Revisión).
  const contacto = useQuery({ queryKey: ['revision', id], queryFn: () => pedir(api.GET('/api/casos/{id}/revision', { params: { path: { id } } })) })
  const equipo = useMencionables(id)
  const { notas } = useEscaneo(id)

  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [vis, setVis] = useState<Destino>('equipo')
  const [avisarWa, setAvisarWa] = useState(true)
  const [texto, setTexto] = useState('')
  const [adjuntas, setAdjuntas] = useState<File[]>([])
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [grande, setGrande] = useState<FotoData | null>(null)
  const [confirmado, setConfirmado] = useState<string | null>(null)
  const [cambiando, setCambiando] = useState(false)
  const [pausando, setPausando] = useState(false)
  const cerrarFoto = useCallback(() => setGrande(null), [])
  const [pedidoAbierto, setPedidoAbierto] = useState(false)
  const cerrarPedido = useCallback(() => setPedidoAbierto(false), [])
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
    mutationFn: async (m: { texto: string; tipo?: Vis; nota?: string; respuesta_a?: string; etapa_orden?: number; fotos?: File[]; menciones?: string[] }) => {
      const subidas = []
      for (const f of m.fotos ?? []) subidas.push((await subirArchivo(id, f, { tipo: 'foto', categoria: 'Avance' })).id)
      return pedir(
        api.POST('/api/casos/{id}/mensajes', {
          params: { path: { id } },
          body: { texto: m.texto, tipo: m.tipo ?? 'equipo', nota: m.nota ?? '', respuesta_a: m.respuesta_a ?? null, etapa_orden: m.etapa_orden ?? null, adjuntos: subidas, menciones: m.menciones ?? [] },
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
  const llego = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/revision/llego', { params: { path: { id } } })),
    onSuccess: () => (refrescar(), cliente.invalidateQueries({ queryKey: ['revision', id] })),
  })
  const reanudar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/reanudar', { params: { path: { id } } })),
    onSuccess: refrescar,
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
  const frenado = !!c.cambio_pendiente || c.en_espera || c.pausado
  const misRoles = yo?.membresia_activa?.roles ?? []
  const lista = mensajes.data ?? []
  // El mensaje que pegó recepción al crear el caso: el más viejo del tipo "odontólogo" con esa nota (la lista viene del más nuevo al más viejo).
  const original = [...lista].reverse().find((m) => m.tipo === 'odontologo' && m.nota.startsWith('Pedido pegado'))
  const pedidoOriginal = original && { texto: original.texto, autor: original.autor, creado: original.creado }

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
      texto: hecha ? 'Hecha.' : enCurso ? (frenado ? (c.pausado ? `Pausado: ${c.pausa_motivo}.` : c.en_espera ? 'En espera: Revisión técnica le pidió algo al odontólogo.' : 'Frenado: hay un cambio de ficha sin confirmar.') : 'En curso.') : 'Pendiente.',
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
  // Lo que se cuenta en cada etapa del tablero: comentarios del equipo, fotos, notas del escaneo y cambios de ficha.
  const proceso: EtapaProceso[] = E.map((e, i) => ({
    nombre: e.nombre,
    quien: e.quien,
    cuando: e.cuando,
    meta: e.meta,
    comentarios: comentarios[i]?.length ?? 0,
    fotos: e.fotos.length,
    notas: notasEtapa[i] ?? 0,
    cambios: lista.filter((m) => m.etapa_orden === i && m.version_ficha).length,
  }))
  const comentarEtapa = (etapa: number, txt: string) => publicarMensaje.mutate({ texto: txt, etapa_orden: etapa })
  const subirFotoEtapa = (etapa: number, f: File) => publicarMensaje.mutate({ texto: 'Foto del avance', etapa_orden: etapa, fotos: [f] })

  const miId = yo?.membresia_activa?.id
  const visibles = lista.filter((m) => pasa(m, filtro, miId))
  const FILTROS: { id: Filtro; label: string }[] = (['todo', 'equipo', 'odontologo', 'menciones', 'fotos'] as const).map((f) => ({
    id: f,
    label: `${{ todo: 'Todo', equipo: 'Equipo', odontologo: 'Con el odontólogo', menciones: 'Menciones', fotos: 'Fotos' }[f]} (${lista.filter((m) => pasa(m, f, miId)).length})`,
  }))
  // A quién se puede etiquetar: el equipo (menos uno mismo) y el odontólogo del caso, que además dispara el aviso por WhatsApp.
  const opciones: Mencionable[] = [
    ...(equipo.data ?? []).filter((p) => p.id !== miId),
    { id: 'odontologo', nombre: c.profesional.nombre, rol: 'Odontólogo', odontologo: true },
  ]
  const miNombre = yo?.usuario.nombre_visible
  /** Texto de un mensaje con sus "@" resaltados (los del odontólogo también, aunque no sea una membresía). */
  const conMenciones = (x: Mensaje | Mensaje['respuestas'][number]) => (
    <TextoConMenciones texto={x.texto} nombres={[...(x.menciones ?? []).map((e) => e.nombre), c.profesional.nombre]} yo={miNombre ? [miNombre] : []} />
  )
  // `?? []`: si el backend que contesta es una versión vieja (sin menciones), la pantalla igual abre.
  const meEtiquetaron = (x: { menciones?: readonly { id: string }[] }) => !!miId && (x.menciones ?? []).some((e) => e.id === miId)
  const telefono = (contacto.data?.whatsapp ?? '').replace(/\D/g, '')
  const quien = yo?.usuario.nombre_visible ?? 'el equipo'
  const publicar = () => {
    if (!texto.trim() && !adjuntas.length) return
    const cuerpo = texto.trim() || 'Foto del avance'
    const avisa = vis === 'odontologo' && avisarWa && !!telefono
    // WhatsApp se abre en el clic: si se abre después de guardar, el navegador lo bloquea. Lo manda una persona (D15).
    if (avisa) {
      const resumen = `${(t?.familia ?? 'trabajo').toLowerCase()}, pieza ${piezasDe(t)}`
      window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(`Hola ${c.profesional.nombre}, sobre ${c.codigo} (${resumen}): ${cuerpo}`)}`, '_blank', 'noopener')
    }
    publicarMensaje.mutate(
      { texto: cuerpo, tipo: vis === 'equipo' ? 'equipo' : 'odontologo', nota: vis === 'respuesta' ? `Copiado del WhatsApp por ${quien}` : avisa ? 'Avisado por WhatsApp' : '', fotos: adjuntas, menciones: idsMencionados(cuerpo, opciones) },
      { onSuccess: () => (setTexto(''), setAdjuntas([])) },
    )
  }
  const enviarRespuesta = (pid: string) => {
    if (!respuesta.trim()) return
    publicarMensaje.mutate({ texto: respuesta.trim(), respuesta_a: pid, menciones: idsMencionados(respuesta, opciones) }, { onSuccess: () => (setRespuesta(''), setRespondiendo(null)) })
  }

  // --- Cambio sin confirmar
  const pendiente = c.cambio_pendiente
  const puedeConfirmar = !!pendiente && pendiente.confirma.some((r) => misRoles.includes(r as never))
  const anterior = actual > 0 ? t?.etapas[actual - 1] : undefined
  const etapaActual = t?.etapa_actual
  const puedeAvanzar = !!etapaActual && !frenado && c.estado === 'abierto' && (misRoles.includes(etapaActual.rol as never) || misRoles.includes('supervision'))
  const enRevision = etapaActual?.rol === 'revision'
  const puedeMarcarLlegada = c.en_espera && c.estado === 'abierto' && !!yo && (yo.permisos.includes('revisar') || yo.permisos.includes('registrar_cambio'))
  const puedeCambiar = !!yo?.permisos.includes('registrar_cambio') && c.estado === 'abierto'
  const puedePausar = !!yo?.permisos.includes('pausar_caso') && c.estado === 'abierto'

  const conversacion = (
    <Card id="conversacion-caso" className="grid scroll-mt-4 gap-3.5 p-5" aria-label="Conversación del caso" role="region">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-[18px] font-semibold">Conversación</h2>
        <Segmented<Filtro> label="Filtrar la conversación" value={filtro} onChange={setFiltro} options={FILTROS} />
      </div>

      {/* El odontólogo, a un toque: el WhatsApp y la conversación son la misma historia (lo que se manda y lo que contesta queda acá). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-ln bg-[linear-gradient(135deg,color-mix(in_srgb,#25D366_9%,var(--sf)),var(--sf))] px-3.5 py-2.5">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-[#DDF5E7] text-[#0B5E33]">
          <MessageCircle className="size-[18px]" />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <strong className="truncate text-[15px] font-semibold">{c.profesional.nombre}</strong>
          <span className="truncate text-[13px] text-ink2">{telefono ? `WhatsApp ${contacto.data?.whatsapp}` : 'Sin WhatsApp cargado en Clientes'}</span>
        </span>
        {telefono && (
          <span className="flex gap-1.5">
            <Button asChild variant="secondary" className="min-h-10 px-3 text-[13.5px]">
              <a href={`https://wa.me/${telefono}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden className="size-4" /> Abrir WhatsApp
              </a>
            </Button>
            <Button asChild variant="secondary" className="min-h-10 px-3 text-[13.5px]">
              <a href={`tel:${telefono}`}>
                <Phone aria-hidden className="size-4" /> Llamar
              </a>
            </Button>
          </span>
        )}
      </div>

      <div className="grid gap-2.5 rounded-[14px] bg-sf2 p-3.5">
        <CajaMensaje
          value={texto}
          onChange={setTexto}
          onEnviar={publicar}
          opciones={opciones}
          onElegirOdontologo={() => setVis('odontologo')}
          etiqueta="Nueva actualización del caso"
          placeholder={vis === 'respuesta' ? `Pegá acá lo que contestó ${c.profesional.nombre} por WhatsApp` : vis === 'odontologo' ? `Escribile a ${c.profesional.nombre}` : 'Contá una novedad del caso. Escribí @ para etiquetar a alguien.'}
        />
        <p className="m-0 -mt-1 px-1 text-[12.5px] text-ink3">Enter envía · Shift + Enter hace un renglón nuevo · @ etiqueta a alguien del equipo</p>
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
          <Segmented<Destino>
            label="A quién va"
            value={vis}
            onChange={setVis}
            options={[
              { id: 'equipo', label: 'Solo el equipo' },
              { id: 'odontologo', label: 'Al odontólogo' },
              { id: 'respuesta', label: 'Su respuesta' },
            ]}
          />
          <BotonFoto onFoto={(f) => setAdjuntas([...adjuntas, f])} className="bt-sec min-h-10 rounded-[12px] border border-ctl bg-sf px-3.5 text-[14.5px] font-medium text-ink hover:bg-sf2">
            Agregar foto
          </BotonFoto>
          <span className="flex-auto" />
          <Button className="min-h-10" onClick={publicar} disabled={(!texto.trim() && !adjuntas.length) || publicarMensaje.isPending}>
            {publicarMensaje.isPending ? 'Publicando…' : vis === 'odontologo' && avisarWa && telefono ? 'Publicar y avisar por WhatsApp' : vis === 'respuesta' ? 'Guardar su respuesta' : 'Publicar'}
          </Button>
        </div>
        {vis === 'odontologo' && (
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-1.5">
              {['Nos falta el color de la guía', '¿Puede volver a escanear el margen?', 'Falta la orden firmada', 'Confirmame la pieza, por favor'].map((r) => (
                <button key={r} type="button" onClick={() => setTexto(r)} className="chip min-h-9 rounded-full px-3 text-[13px]">
                  {r}
                </button>
              ))}
            </div>
            <label className={cn('flex items-start gap-2.5 rounded-[12px] bg-acS/70 p-2.5 text-[14px]', telefono ? 'cursor-pointer' : 'opacity-60')}>
              <input type="checkbox" className="mt-0.5 size-5 accent-ac" checked={avisarWa && !!telefono} disabled={!telefono} onChange={(e) => setAvisarWa(e.target.checked)} />
              <span className="grid gap-0.5">
                <span className="font-semibold">Avisarle por WhatsApp</span>
                <span className="text-ink2">{telefono ? 'Se abre WhatsApp con el mensaje listo; lo manda una persona. Queda acá, en el caso.' : 'No tiene WhatsApp cargado: el mensaje queda solo en el caso.'}</span>
              </span>
            </label>
          </div>
        )}
        {vis === 'respuesta' && (
          <p className="m-0 rounded-[12px] bg-[#DDF5E7] p-2.5 text-[14px] text-[#0B5E33]">
            Copiá lo que te contestó por WhatsApp y pegalo acá: queda como respuesta de {c.profesional.nombre}, marcada como copiada del WhatsApp, en la etapa en la que estás. Así nada se pierde en el celular de nadie.
          </p>
        )}
        {publicarMensaje.error && <Aviso>{publicarMensaje.error.message}</Aviso>}
      </div>

      <ol className="m-0 flex list-none flex-col p-0">
        {visibles.length === 0 && <li className="border-t border-ln py-4 text-[14px] text-ink3">Todavía no hay mensajes. Lo que se escriba acá queda en el caso, en la etapa en la que se escribió.</li>}
        {visibles.map((m) => (
          <li key={m.id} className="grid gap-2.5 border-t border-ln py-4">
            <article className="flex gap-3">
              <Avatar ini={m.tipo === 'sistema' ? 'LL' : iniciales(esDelOdontologo(m) ? c.profesional.nombre : m.autor)} />
              <div className="grid min-w-0 flex-auto gap-1.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <strong className="font-semibold">{esDelOdontologo(m) ? c.profesional.nombre : m.autor}</strong>
                  <span className="text-[14px] text-ink3">
                    {esDelOdontologo(m) ? 'Odontólogo' : m.rol}, {cuando(m.creado)}
                  </span>
                  <VisBadge v={m.tipo ?? 'equipo'} />
                  {meEtiquetaron(m) && <Badge tone="atencion" className="text-[12px]">Te etiquetaron</Badge>}
                  {m.etapa &&<span className="font-mono text-[11px] tracking-[0.08em] text-ink3 uppercase">en {m.etapa}</span>}
                </div>
                <p className="m-0 max-w-[68ch] text-[16px] leading-normal">{conMenciones(m)}</p>
                <OrigenWa nota={m.nota} />
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
                        {meEtiquetaron(r) && <Badge tone="atencion" className="text-[12px]">Te etiquetaron</Badge>}
                      </div>
                      <p className="m-0 max-w-[66ch] leading-normal">{conMenciones(r)}</p>
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
                    <CajaMensaje
                      autoFocus
                      rows={1}
                      className="min-w-0 flex-1"
                      value={respuesta}
                      onChange={setRespuesta}
                      onEnviar={() => enviarRespuesta(m.id)}
                      opciones={opciones}
                      etiqueta="Respuesta"
                      placeholder="Escribí tu respuesta. @ etiqueta a alguien."
                    />
                    <Button className="self-end" onClick={() => enviarRespuesta(m.id)} disabled={!respuesta.trim()}>
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
        <PanelEscaneo casoId={id} autor={yo?.usuario.nombre_visible ?? ''} compacto alto="clamp(440px, calc(100vh - 250px), 780px)" panelPorDefecto={anchoParaPanel} puedeSubirVersion={!!yo?.permisos.includes('disenar')} puedeSubirInicial={!!yo?.permisos.includes('crear_caso')} />
      </Card>
    </section>
  )

  const acciones = (
    <>
      {enRevision && c.estado === 'abierto' && (
        <Button variant="ink" className="min-h-11 px-3.5 text-[14px]" asChild>
          <Link to={`/revision/${c.id}`}>
            Ir a la revisión técnica
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      )}
      {puedeCambiar && (
        <Button variant="secondary" className="min-h-11 px-3.5 text-[14px]" aria-expanded={cambiando} onClick={() => setCambiando(!cambiando)}>
          <PenLine aria-hidden className="size-4" /> Registrar cambio
        </Button>
      )}
      {/* La revisión técnica no se termina con un botón: se cierra con el checklist (la cabecera lleva a Revisión). */}
      {puedeAvanzar && t && !enRevision && (
        <Button variant="ink" className="min-h-11 px-3.5 text-[14px]" disabled={avanzar.isPending} onClick={() => avanzar.mutate(t.id)}>
          <Check aria-hidden className="size-4" /> Terminar {etapaActual?.nombre}
        </Button>
      )}
      {puedePausar && !c.pausado && (
        <Button variant="secondary" className="min-h-11 px-3.5 text-[14px]" aria-expanded={pausando} onClick={() => setPausando(!pausando)}>
          <Pause aria-hidden className="size-4" /> Pausar
        </Button>
      )}
      <Button asChild variant="secondary" className="min-h-11 px-3.5 text-[14px]">
        <Link to={`/casos/${c.id}/etiqueta`}>
          <Printer aria-hidden className="size-4" /> Etiqueta
        </Link>
      </Button>
      <SelectorVista vista={vista} onCambiar={cambiarVista} />
    </>
  )

  return (
    <>
      <NavegadorCasos actual={c.id} />

      {/* El pedido se despliega desde la cabecera, por encima del resto: así el escaneo no baja. */}
      <div className="relative">
        <CabeceraCaso c={datosCabecera(c)} frenado={frenado} acciones={<BotonPedido caso={c} abierto={pedidoAbierto} onClick={() => setPedidoAbierto(!pedidoAbierto)} />} />
        {pedidoAbierto && (
          <div className="absolute inset-x-0 top-full z-40 mt-2">
            <FichaPedido caso={c} archivos={archivos.data ?? []} original={pedidoOriginal} onAbrirFoto={setGrande} onCerrar={cerrarPedido} />
          </div>
        )}
      </div>
      {avanzar.error && <Aviso>{avanzar.error.message}</Aviso>}
      {pausando && !c.pausado && <PausarCaso casoId={c.id} onListo={() => (setPausando(false), refrescar())} onCerrar={() => setPausando(false)} />}
      {cambiando && t && <RegistrarCambio caso={c} trabajo={t} onListo={() => (setCambiando(false), setConfirmado(null), refrescar())} onCerrar={() => setCambiando(false)} />}

      {vista === 'franja' ? (
        <ProcesoCaso etapas={proceso} actual={actual} frenado={frenado} responsable={etapaActual ? NOMBRE_ROL[etapaActual.rol] ?? etapaActual.rol : 'Recepción'} seleccionada={sel} onElegir={(i) => setSel(sel === i ? null : i)} acciones={acciones}>
          {sel !== null && E[sel] && (
            <div role="region" aria-label={`Etapa ${E[sel].nombre}`} className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink2 uppercase">
                    Etapa {sel + 1}/{E.length} · {sel < actual ? 'hecha' : sel === actual ? (frenado ? 'frenada' : 'en curso') : 'pendiente'}
                  </span>
                  <h3 className="m-0 text-[19px] font-semibold">{E[sel].nombre}</h3>
                  <span className="text-[13.5px] text-ink2">{[E[sel].quien, E[sel].cuando, E[sel].meta].filter(Boolean).join(' · ')}</span>
                </div>
                <button type="button" aria-label="Cerrar la etapa" onClick={() => setSel(null)} className="grid size-11 place-items-center rounded-[12px] text-ink2 transition hover:bg-sf2 hover:text-ink">
                  <X aria-hidden className="size-5" />
                </button>
              </div>
              <DetalleEtapa e={E[sel]} pendiente={sel > actual} comentarios={comentarios[sel] ?? []} notas={notasEtapa[sel] ?? 0} onFoto={(f) => subirFotoEtapa(sel, f)} onComentar={(txt) => comentarEtapa(sel, txt)} onAbrirFoto={setGrande} ancho />
            </div>
          )}
        </ProcesoCaso>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{acciones}</div>
      )}

      {c.pausado && (
        <section aria-label="Caso pausado" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ficha border border-wa bg-waS px-4 py-3">
          <div className="grid min-w-0 flex-[999_1_340px] gap-0.5">
            <strong className="flex items-center gap-2 text-[16px] font-semibold text-wa">
              <Pause aria-hidden className="size-4" strokeWidth={3} /> Caso pausado
            </strong>
            <span className="text-[14px]">
              {c.pausa_motivo}. {c.pausa_desde ? `Desde ${cuando(c.pausa_desde)}. ` : ''}Nadie avanza ni inicia etapas hasta que se reanude.
            </span>
          </div>
          {puedePausar ? (
            <Button disabled={reanudar.isPending} onClick={() => reanudar.mutate()}>
              <Play aria-hidden className="size-4" /> Reanudar el caso
            </Button>
          ) : (
            <span className="text-[13.5px] font-medium text-wa">Lo reanuda Recepción o Supervisión.</span>
          )}
          {reanudar.error && <Aviso>{reanudar.error.message}</Aviso>}
        </section>
      )}

      {c.en_espera && (
        <section aria-label="En espera del odontólogo" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ficha border border-ba bg-baS px-4 py-3">
          <div className="grid min-w-0 flex-[999_1_340px] gap-0.5">
            <strong className="text-[16px] font-semibold text-ba">En espera del odontólogo</strong>
            <span className="text-[14px]">
              Revisión técnica pidió lo que falta{c.espera_desde ? ` ${cuando(c.espera_desde)}` : ''}. El caso no avanza hasta que llegue: el pedido está en la conversación.
            </span>
          </div>
          {puedeMarcarLlegada && (
            <Button disabled={llego.isPending} onClick={() => llego.mutate()}>
              Llegó lo que faltaba
            </Button>
          )}
          {llego.error && <Aviso>{llego.error.message}</Aviso>}
        </section>
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

const MOTIVOS_PAUSA = ['Falta definir algo con el odontólogo', 'El paciente reprogramó', 'Falta material', 'Esperando la orden firmada']

/** Pausar a mano: el caso sigue abierto pero nadie lo avanza hasta reanudarlo. El motivo queda en la conversación. */
function PausarCaso({ casoId, onListo, onCerrar }: { casoId: string; onListo: () => void; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const guardar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/pausar', { params: { path: { id: casoId } }, body: { motivo: motivo.trim() } })),
    onSuccess: onListo,
  })
  return (
    <Card tono="calido" className="entra grid gap-3 p-5" role="region" aria-label="Pausar el caso">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="m-0 text-[18px] font-semibold">Pausar el caso</h2>
          <span className="text-[14px] text-ink2">Queda abierto pero no avanza: nadie termina ni inicia etapas hasta reanudarlo. Se avisa en la conversación, con el motivo.</span>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} className="grid size-11 shrink-0 place-items-center rounded-[12px] text-ink2 hover:bg-sf">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS_PAUSA.map((m) => (
          <button key={m} type="button" onClick={() => setMotivo(m)} className="chip min-h-9 rounded-full px-3 text-[13px]">
            {m}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5 text-[14px] font-semibold">
        Motivo
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Por qué se pausa" className="campo min-h-11 px-3.5 text-[15px] font-normal" />
      </label>
      {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
      <Button className="justify-self-start" disabled={!motivo.trim() || guardar.isPending} onClick={() => guardar.mutate()}>
        <Pause aria-hidden className="size-4" /> Pausar el caso
      </Button>
    </Card>
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
