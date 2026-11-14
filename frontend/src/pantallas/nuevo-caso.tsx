/**
 * Nuevo caso (P12): pensado para recepción. Se pega el WhatsApp o el mail y se completa un
 * borrador que se revisa; todo con un toque, "repetir el último pedido", ficha lateral con lo que
 * falta y el tiempo de carga medido. Es la pantalla del prototipo con los datos reales: clientes y
 * profesionales, catálogo, carga de cada día y subida de archivos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, Camera, Check, Clipboard, FileBox, FileText, Image as ImageIcon, Info, Layers, Link2, Palette, PenLine, Repeat2, Search, ShieldCheck, Sparkles, Stethoscope, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api, pedir, type Esquemas } from '../api/cliente'
import { LenteImagen } from '../components/LenteImagen'
import { Avatar } from '../components/ui/avatar-foto'
import { Button } from '../components/ui/button'
import { Card, type TonoCard } from '../components/ui/card'
import { BarraFlotante, Codigo, CodigoGrande, Rotulo } from '../components/ui/flotante'
import { MiniOdontograma } from '../components/ui/mini-odontograma'
import { Segmented } from '../components/ui/segmented'
import { SelectorPiezas } from '../components/ui/selector-piezas'
import { leerPedido, VITA } from '../lib/leerPedido'
import { useYo } from '../lib/sesion'
import { subirArchivo, type TipoArchivo } from '../lib/subir'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'

type Profesional = Esquemas['Profesional']
type Item = Esquemas['Item']

const TONOS: Record<string, string> = { A1: '#F4EBD6', A2: '#EEE0C2', A3: '#E6D2AC', 'A3.5': '#E0C89E', A4: '#D6B988', B1: '#F3ECD9', B2: '#EBDDBE', B3: '#E2CFA6', B4: '#D9C192', C1: '#E5DCC8', C2: '#DCCFB4', C3: '#D2C3A3', C4: '#C6B48F', D2: '#E8DFCF', D3: '#DDD1BC', D4: '#D3C5AC' }

// --- Días hábiles desde hoy, con la carga de cada día contra la capacidad --------------------
const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIA_LARGO: Record<string, number> = { lunes: 1, martes: 2, miércoles: 3, jueves: 4, viernes: 5 }
type Dia = { clave: string; texto: string; habiles: number; diaSemana: number }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function proximosHabiles(cantidad: number): Dia[] {
  const out: Dia[] = []
  const d = new Date()
  while (out.length < cantidad) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    out.push({ clave: iso(d), texto: `${NOMBRE_DIA[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`, habiles: out.length + 1, diaSemana: d.getDay() })
  }
  return out
}

// --- Archivos: cada uno con su categoría y un comentario -------------------------------------
type ArchivoCargado = { archivo: File; tipo: TipoArchivo; categoria: string; comentario: string; url?: string }
const tipoDe = (n: string): TipoArchivo => {
  const e = n.split('.').pop()?.toLowerCase() ?? ''
  if (['stl', 'ply', 'obj'].includes(e)) return 'escaneo'
  if (['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(e)) return 'foto'
  if (e === 'pdf') return 'orden'
  return 'otro'
}
const PREFIJO: Record<string, string> = { escaneo: 'Escaneo', foto: 'Foto', orden: 'Documento', otro: 'Archivo' }
const CATEGORIAS: Record<string, string[]> = {
  escaneo: ['Arcada inferior', 'Arcada superior', 'Mordida', 'Muñón / preparación', 'Antes de tallar'],
  foto: ['Color', 'Boca', 'Muñón', 'Radiografía', 'Orden en papel'],
  orden: ['Orden firmada', 'Indicaciones', 'Otro'],
  otro: ['Indicaciones', 'Otro'],
}
const COMENTARIOS: Record<string, string> = { escaneo: 'Ej.: con el muñón de la 36 tallado', foto: 'Ej.: guía A3 al lado del diente vecino', orden: 'Ej.: pedido de la clínica' }
const nombreEnElCaso = (a: ArchivoCargado) => (a.categoria ? `${PREFIJO[a.tipo]} · ${a.categoria.toLowerCase()}` : `${PREFIJO[a.tipo]} sin categoría`) + (a.comentario.trim() ? ` — ${a.comentario.trim()}` : '')
const tam = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

// --- Del pedido al odontograma de Lupa (v2.10) ------------------------------------------------
const TIPO_RESTAURACION: Record<string, string> = { Coronas: 'crown', Implantes: 'crown', Incrustaciones: 'inlay', Carillas: 'veneer' }
const MATERIAL_LUPA = (m: string) => (/zirconi/i.test(m) ? 'zircon' : /disilicato|e\.?max/i.test(m) ? 'emax' : /metalocer|metal-cer/i.test(m) ? 'metal-ceramic' : /^metal/i.test(m) ? 'metal' : undefined)
function piezasLupa(piezas: string[], familia: string, soporte: 'munon' | 'implante', material: string | null) {
  const tipo = TIPO_RESTAURACION[familia]
  const mat = material ? MATERIAL_LUPA(material) : undefined
  return Object.fromEntries(
    piezas.map((p) => [
      p,
      {
        toothSelection: soporte === 'implante' ? 'implant' : 'tooth-base',
        ...(soporte === 'munon' ? { toothSubstrate: 'crownprep' } : {}),
        ...(tipo ? { restorationType: tipo } : {}),
        ...(mat ? { restorationMaterial: mat } : {}),
      },
    ]),
  )
}

/** Lo que leerPedido reconoce como trabajo, llevado a la familia del catálogo. */
const FAMILIA_DE_TRABAJO: Record<string, string> = { corona: 'Coronas', carilla: 'Carillas', incrustacion: 'Incrustaciones', placa: 'Placas', puente: 'Prótesis' }

type Campo = 'odontologo' | 'paciente' | 'trabajo' | 'material' | 'soporte' | 'implante' | 'piezas' | 'color' | 'fecha'

const VACIO = {
  profesional: null as string | null,
  cliente: null as string | null,
  paciente: '',
  familia: null as string | null,
  item: null as string | null,
  material: null as string | null,
  soporte: 'munon' as 'munon' | 'implante',
  implante: { marca: '', diametro: '', conexion: '' },
  piezas: [] as string[],
  color: null as string | null,
  sinColor: false,
  fecha: null as string | null,
  archivos: [] as ArchivoCargado[],
  llegaImpresion: false,
  orden: null as 'papel' | 'caja' | 'digital' | null,
  numeroOrden: '',
  fechaOrden: '',
  ordenFirma: false,
  ordenFoto: null as File | null,
  notas: '',
}
type Pedido = typeof VACIO

function Seccion({ id, n, titulo, ayuda, listo, delMensaje, tono = 'base', orden = 0, children }: { id: string; n: string; titulo: string; ayuda?: string; listo?: boolean; delMensaje?: boolean; tono?: TonoCard; orden?: number; children: ReactNode }) {
  return (
    <Card tono={listo ? 'base' : tono} className="entra grid scroll-mt-28 gap-4 p-5 sm:p-6" style={{ '--d': orden } as CSSProperties} id={id} role="region" aria-labelledby={`${id}-t`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1.5">
          <Rotulo n={n}>{titulo}</Rotulo>
          {ayuda && <span id={`${id}-t`} className="text-[15.5px] text-ink2">{ayuda}</span>}
        </div>
        <span className="flex items-center gap-2">
          {delMensaje && <span className="rounded-full bg-waS px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-wa uppercase shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--wa)_30%,transparent)]">Del mensaje · revisá</span>}
          {listo && (
            <span className="flex items-center gap-1 rounded-full bg-okS px-2.5 py-0.5 text-[13px] font-semibold text-ok">
              <Check aria-hidden className="size-4" strokeWidth={3} />
              Listo
            </span>
          )}
        </span>
      </div>
      {children}
    </Card>
  )
}

/** Opción tipo "chip": un toque y listo, sin desplegables. */
function Chip({ on, onClick, children, className, ...p }: { on: boolean; onClick: () => void; children: ReactNode; className?: string; 'aria-label'?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('chip inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] px-4 text-[15px]', on && 'font-semibold', className)} {...p}>
      {children}
    </button>
  )
}

/** Mosaico de la ficha del pedido: un dato con su ícono, sobre un fondo teñido. Vacío = guion. */
function Mosaico({ icono: Icono, k, children, vacio, className }: { icono: typeof Check; k: string; children?: ReactNode; vacio?: boolean; className?: string }) {
  return (
    <div className={cn('grid content-start gap-1 rounded-[14px] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--ac)_11%,var(--sf)),color-mix(in_srgb,var(--ac)_5%,var(--sf)))] p-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ac)_14%,transparent)] transition duration-200 hover:-translate-y-0.5', vacio && 'bg-bg2/50 shadow-[inset_0_0_0_1px_var(--ln)]', className)}>
      <span className="flex items-center gap-1.5 text-[12.5px] text-ink2">
        <Icono aria-hidden className="size-3.5 text-acT" />
        {k}
      </span>
      <span className={cn('text-[15px] leading-snug font-semibold', vacio && 'font-normal text-ink3')}>{vacio ? '—' : children}</span>
    </div>
  )
}

const inicialesDe = (p: Profesional) => `${p.nombre[0] ?? ''}${p.apellido[0] ?? ''}`.toUpperCase()
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Creado = { caso: Esquemas['Caso']; segundos: number; fallidos: string[] }

export function NuevoCaso() {
  const { data: yo } = useYo()
  const capacidad = yo?.membresia_activa?.laboratorio.capacidad_diaria ?? 70
  const cliente = useQueryClient()
  const [p, setP] = useState<Pedido>(VACIO)
  const [delMensaje, setDelMensaje] = useState<Set<Campo>>(new Set())
  const [mensaje, setMensaje] = useState('')
  const [dudas, setDudas] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [creado, setCreado] = useState<Creado | null>(null)
  const [paso, setPaso] = useState('')
  const [segundos, setSegundos] = useState(0)
  const inicio = useRef(Date.now())
  const habiles = useMemo(() => proximosHabiles(10), [])
  const fotoOrden = useMemo(() => (p.ordenFoto ? URL.createObjectURL(p.ordenFoto) : null), [p.ordenFoto])

  const profesionales = useQuery({ queryKey: ['profesionales', { activos: true }], queryFn: () => pedir(api.GET('/api/profesionales')) })
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => pedir(api.GET('/api/catalogo')) })
  const carga = useQuery({
    queryKey: ['carga', habiles[0].clave],
    queryFn: () => pedir(api.GET('/api/casos/carga', { params: { query: { desde: habiles[0].clave, hasta: habiles[habiles.length - 1].clave } } })),
  })
  const ultimo = useQuery({
    queryKey: ['ultimo-caso', p.profesional],
    queryFn: () => pedir(api.GET('/api/casos', { params: { query: { profesional: p.profesional!, limit: 1 } } })),
    enabled: !!p.profesional,
  })

  // Mide cuánto tarda cargar un pedido: es una métrica del piloto y sirve para mejorar el formulario.
  useEffect(() => {
    if (creado) return
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicio.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [creado])

  const set = <K extends keyof Pedido>(k: K, v: Pedido[K], campo?: Campo) => {
    setP((x) => ({ ...x, [k]: v }))
    if (campo) setDelMensaje((s) => (s.has(campo) ? new Set([...s].filter((c) => c !== campo)) : s))
  }

  const familias = (catalogo.data?.familias ?? []).filter((f) => f.activa !== false && catalogo.data?.items.some((i) => i.familia === f.id && i.activo !== false))
  const familia = familias.find((f) => f.id === p.familia)
  const itemsFamilia = (catalogo.data?.items ?? []).filter((i) => i.familia === p.familia && i.activo !== false)
  const item = itemsFamilia.find((i) => i.id === p.item)
  const datosPedidos = item?.datos_pedidos ?? itemsFamilia[0]?.datos_pedidos ?? []
  const multiple = datosPedidos.includes('Piezas')
  const pideSoporte = datosPedidos.includes('Muñón o implante')
  const soloImplante = datosPedidos.includes('Marca')
  const soporte = soloImplante ? 'implante' : p.soporte
  const materiales = item?.materiales ?? []
  const minimo = item?.dias_minimos ?? 3
  const cargas = new Map((carga.data ?? []).map((c) => [c.fecha, c.casos]))
  const cargaDe = (d: Dia) => cargas.get(d.clave) ?? 0
  const fechaSel = habiles.find((d) => d.clave === p.fecha)

  const od = profesionales.data?.find((o) => o.id === p.profesional)
  const paga = od?.clientes_detalle.find((c) => c.id === p.cliente)
  const escaneos = p.archivos.filter((a) => a.tipo === 'escaneo')
  const sinCategoria = p.archivos.filter((a) => !a.categoria).length

  // --- Qué falta para crear el caso (lo mínimo para que Revisión y CAD puedan trabajar).
  const implanteOk = soporte === 'munon' || (!pideSoporte && !soloImplante) || (p.implante.marca && p.implante.diametro && p.implante.conexion)
  const materialOk = !!item && (materiales.length <= 1 || !!p.material)
  const ordenOk = p.orden === 'caja' || p.orden === 'digital' || (p.orden === 'papel' && p.numeroOrden.trim().length > 0 && p.ordenFirma)
  const requisitos = [
    { id: 'quien', texto: 'Odontólogo', ok: !!p.profesional && !!p.cliente },
    { id: 'quien', texto: 'Paciente (iniciales)', ok: p.paciente.trim().length >= 2 },
    { id: 'trabajo', texto: 'Trabajo y material', ok: materialOk && !!implanteOk },
    { id: 'pieza', texto: 'Pieza', ok: p.piezas.length > 0 },
    { id: 'color', texto: 'Color', ok: !!p.color || p.sinColor },
    { id: 'archivos', texto: sinCategoria ? `Categoría de ${sinCategoria} ${sinCategoria === 1 ? 'archivo' : 'archivos'}` : 'Escaneo o impresión', ok: (escaneos.length > 0 || p.llegaImpresion) && sinCategoria === 0 },
    { id: 'entrega', texto: 'Fecha de entrega', ok: !!p.fecha },
    { id: 'orden', texto: 'Orden firmada', ok: ordenOk },
  ]
  const listos = requisitos.filter((r) => r.ok).length
  const completo = listos === requisitos.length

  const elegirProfesional = (o: Profesional) => {
    setP((x) => ({ ...x, profesional: o.id, cliente: o.clientes_detalle.length === 1 ? o.clientes_detalle[0].id : null }))
    setDelMensaje((s) => new Set([...s].filter((c) => c !== 'odontologo')))
    setBusca('')
  }

  const elegirFamilia = (id: string) => {
    const items = (catalogo.data?.items ?? []).filter((i) => i.familia === id && i.activo !== false)
    const unico = items.length === 1 ? items[0] : null
    const varias = items[0]?.datos_pedidos?.includes('Piezas')
    setP((x) => ({ ...x, familia: id, item: unico?.id ?? null, material: unico?.materiales?.length === 1 ? unico.materiales[0] : null, piezas: varias ? x.piezas : x.piezas.slice(0, 1) }))
    setDelMensaje((s) => new Set([...s].filter((c) => c !== 'trabajo')))
  }
  const elegirItem = (i: Item) => {
    setP((x) => ({ ...x, item: i.id, material: i.materiales?.length === 1 ? i.materiales[0] : null }))
    setDelMensaje((s) => new Set([...s].filter((c) => c !== 'material')))
  }

  const ultimoCaso = ultimo.data?.results[0]
  const ultimoTrabajo = ultimoCaso?.trabajos[0]
  const repetirUltimo = () => {
    if (!ultimoTrabajo) return
    const it = catalogo.data?.items.find((i) => i.id === ultimoTrabajo.item)
    if (!it) return
    setP((x) => ({ ...x, familia: it.familia, item: it.id, material: ultimoTrabajo.material || null, color: ultimoTrabajo.color || null, sinColor: !ultimoTrabajo.color, soporte: ultimoTrabajo.soporte === 'implante' ? 'implante' : 'munon' }))
  }

  const completarConMensaje = (texto = mensaje) => {
    const lista = (profesionales.data ?? []).map((o) => ({ id: o.id, claves: [o.apellido, `${o.nombre} ${o.apellido}`].filter(Boolean).flatMap((c) => [c.toLowerCase(), sinTildes(c)]) }))
    const l = leerPedido(texto, lista)
    const marcados = new Set<Campo>()
    // Un mensaje nuevo es un pedido nuevo: se parte de cero y solo se conservan archivos, orden y notas.
    const nuevo: Pedido = { ...VACIO, archivos: p.archivos, orden: p.orden, numeroOrden: p.numeroOrden, fechaOrden: p.fechaOrden, ordenFirma: p.ordenFirma, ordenFoto: p.ordenFoto, notas: p.notas }
    const o = profesionales.data?.find((x) => x.id === l.odontologo)
    if (o) {
      nuevo.profesional = o.id
      nuevo.cliente = o.clientes_detalle.length === 1 ? o.clientes_detalle[0].id : null
      marcados.add('odontologo')
    }
    if (l.paciente) {
      nuevo.paciente = l.paciente
      marcados.add('paciente')
    }
    const fam = familias.find((f) => f.nombre === FAMILIA_DE_TRABAJO[l.trabajo ?? ''])
    if (fam) {
      nuevo.familia = fam.id
      marcados.add('trabajo')
      const items = (catalogo.data?.items ?? []).filter((i) => i.familia === fam.id)
      const conMaterial = l.material ? items.find((i) => i.materiales?.some((m) => sinTildes(m).startsWith(sinTildes(l.material!).slice(0, 5)))) : undefined
      const elegido = conMaterial ?? (items.length === 1 ? items[0] : undefined)
      if (elegido) {
        nuevo.item = elegido.id
        nuevo.material = elegido.materiales?.length === 1 ? elegido.materiales[0] : null
        if (conMaterial) marcados.add('material')
      }
    }
    if (l.soporte) {
      nuevo.soporte = l.soporte
      marcados.add('soporte')
    }
    if (l.implante) {
      nuevo.implante = { marca: l.implante.marca ?? '', diametro: l.implante.diametro ?? '', conexion: l.implante.conexion ?? '' }
      marcados.add('implante')
    }
    if (l.piezas) {
      nuevo.piezas = l.piezas
      marcados.add('piezas')
    }
    if (l.color) {
      nuevo.color = l.color
      nuevo.sinColor = false
      marcados.add('color')
    }
    const dudasExtra = [...l.dudas]
    if (l.dia) {
      const d = habiles.find((x) => x.diaSemana === DIA_LARGO[l.dia!])
      if (d) {
        nuevo.fecha = d.clave
        marcados.add('fecha')
        const it = catalogo.data?.items.find((i) => i.id === nuevo.item)
        const min = it?.dias_minimos ?? 3
        if (d.habiles < min) dudasExtra.push(`Pidió el ${l.dia} (${d.texto}): es antes del plazo habitual de ${min} días hábiles`)
        if (cargaDe(d) >= capacidad) dudasExtra.push(`El ${d.texto} ya está lleno (${cargaDe(d)} de ~${capacidad})`)
      }
    }
    if (l.odontologo && !o) dudasExtra.push('No encontré al odontólogo: buscalo a mano')
    setP(nuevo)
    setDelMensaje(marcados)
    setDudas(dudasExtra)
    if (texto !== mensaje) setMensaje(texto)
  }

  const agregarArchivos = (lista: FileList | null) => {
    if (!lista) return
    set('archivos', [
      ...p.archivos,
      ...[...lista].map((f): ArchivoCargado => {
        const tipo = tipoDe(f.name)
        // Una sola categoría posible = se completa sola; el resto lo elige quien carga (un toque).
        return { archivo: f, tipo, categoria: tipo === 'orden' ? 'Orden firmada' : '', comentario: '', url: tipo === 'foto' ? URL.createObjectURL(f) : undefined }
      }),
    ])
  }
  const editarArchivo = (i: number, cambios: Partial<ArchivoCargado>) => set('archivos', p.archivos.map((a, j) => (j === i ? { ...a, ...cambios } : a)))

  const alternarPieza = (n: string) => {
    const ya = p.piezas.includes(n)
    set('piezas', ya ? p.piezas.filter((x) => x !== n) : multiple ? [...p.piezas, n] : [n], 'piezas')
  }

  const filtrados = useMemo(() => {
    const q = sinTildes(busca.trim())
    const todos = profesionales.data ?? []
    return q ? todos.filter((o) => sinTildes(`${o.nombre_completo} ${o.clientes_detalle.map((c) => c.razon_social).join(' ')}`).includes(q)) : todos.slice(0, 12)
  }, [busca, profesionales.data])

  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const crear = useMutation({
    mutationFn: async (): Promise<Creado> => {
      setPaso('Creando el caso…')
      const segundosCarga = Math.round((Date.now() - inicio.current) / 1000)
      const caso = await pedir(
        api.POST('/api/casos', {
          body: {
            cliente: p.cliente!,
            profesional: p.profesional!,
            paciente: p.paciente.trim(),
            fecha_prometida: p.fecha,
            observaciones: p.notas.trim(),
            orden_origen: p.orden ?? '',
            orden_numero: p.numeroOrden.trim(),
            orden_fecha: p.fechaOrden || null,
            orden_firmada: p.ordenFirma,
            llega_impresion: p.llegaImpresion,
            segundos_carga: segundosCarga,
            pasar_a_revision: true,
            trabajos: [
              {
                item: p.item!,
                piezas: piezasLupa(p.piezas, familia?.nombre ?? '', soporte, p.material),
                material: p.material ?? item?.materiales?.[0] ?? '',
                color: p.sinColor ? '' : (p.color ?? ''),
                soporte: pideSoporte || soloImplante ? soporte : '',
                implante_marca: soporte === 'implante' ? p.implante.marca : '',
                implante_diametro: soporte === 'implante' ? p.implante.diametro : '',
                implante_conexion: soporte === 'implante' ? p.implante.conexion : '',
                observaciones: '',
              },
            ],
          },
        }),
      )
      // Los archivos se suben después de crear el caso: si uno falla, el caso ya existe y se reintenta desde ahí.
      const fallidos: string[] = []
      const escaneosSubidos: string[] = []
      const todos = [...p.archivos, ...(p.ordenFoto ? [{ archivo: p.ordenFoto, tipo: 'orden' as TipoArchivo, categoria: 'Orden en papel', comentario: p.numeroOrden }] : [])]
      for (const [i, a] of todos.entries()) {
        setPaso(`Subiendo ${i + 1} de ${todos.length}: ${a.archivo.name}`)
        try {
          const subido = await subirArchivo(caso.id, a.archivo, { tipo: a.tipo, categoria: a.categoria, comentario: a.comentario })
          if (a.tipo === 'escaneo') escaneosSubidos.push(subido.id)
        } catch {
          fallidos.push(a.archivo.name)
        }
      }
      // El escaneo del odontólogo es la versión 1 del caso: solo lectura, nunca se reemplaza (P6).
      if (escaneosSubidos.length) {
        setPaso('Guardando el escaneo inicial…')
        await pedir(api.POST('/api/casos/{id}/versiones', { params: { path: { id: caso.id } }, body: { origen: 'inicial', archivos: escaneosSubidos, descripcion: 'Escaneo del odontólogo', incluye_base: true } }))
      }
      const final = await pedir(api.GET('/api/casos/{id}', { params: { path: { id: caso.id } } }))
      return { caso: final, segundos: segundosCarga, fallidos }
    },
    onSuccess: (r) => {
      setCreado(r)
      setPaso('')
      cliente.invalidateQueries({ queryKey: ['casos'] })
      cliente.invalidateQueries({ queryKey: ['carga'] })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: () => setPaso(''),
  })

  const otro = () => {
    setP(VACIO)
    setDelMensaje(new Set())
    setMensaje('')
    setDudas([])
    setCreado(null)
    crear.reset()
    inicio.current = Date.now()
    setSegundos(0)
  }

  const nombreTrabajo = familia ? `${familia.nombre}${item ? ` · ${item.nombre}` : ''}${(pideSoporte || soloImplante) ? (soporte === 'implante' ? ' sobre implante' : ' sobre muñón') : ''}` : ''
  const resumen = [
    ['Odontólogo', od ? `${od.nombre_completo}${paga ? ` · paga ${paga.razon_social}` : ''}` : ''],
    ['Paciente', p.paciente],
    ['Trabajo', nombreTrabajo],
    ['Pieza', p.piezas.join(', ')],
    ['Color', p.sinColor ? 'Lo define el laboratorio' : (p.color ?? '')],
    ['Archivos', p.archivos.length ? `${escaneos.length} escaneo${escaneos.length === 1 ? '' : 's'}${p.archivos.length > escaneos.length ? ` + ${p.archivos.length - escaneos.length} más` : ''}` : p.llegaImpresion ? 'Impresión física' : ''],
    ['Entrega', fechaSel?.texto ?? ''],
    ['Orden', p.orden === 'papel' ? `En papel · ${p.numeroOrden || 'sin número'}` : p.orden === 'caja' ? 'Llega con la caja' : p.orden === 'digital' ? 'La cargó el odontólogo' : ''],
  ] as const

  if (creado) {
    const [letra, numero] = creado.caso.codigo.split('-')
    const etapa = creado.caso.trabajos[0]?.etapa_actual?.nombre ?? 'Recepción'
    return (
      <Card tono="menta" className="entra mx-auto mt-6 grid w-full max-w-[680px] gap-5 p-7">
        <Rotulo>Caso creado</Rotulo>
        <div className="grid gap-2">
          <CodigoGrande prefijo={`${letra}-`} numero={numero} className="text-[clamp(52px,10vw,92px)]" />
          <h1 className="m-0 text-[26px] leading-tight font-semibold tracking-tight">Está en {etapa}</h1>
          <p className="m-0 text-ink2">
            Lo cargaste en <span className="font-mono text-ink">{Math.floor(creado.segundos / 60)}:{String(creado.segundos % 60).padStart(2, '0')}</span>. {etapa} lo ve ahora con los archivos y tus notas.
          </p>
        </div>
        {creado.fallidos.length > 0 && <Aviso>No se pudieron subir: {creado.fallidos.join(', ')}. Subilos de nuevo desde el caso.</Aviso>}
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-ln py-4">
          {resumen.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[12px] tracking-[0.06em] text-ink3 uppercase">{k}</dt>
              <dd className="m-0 text-[15px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="ink" onClick={otro}>
            Cargar otro pedido <ArrowRight aria-hidden className="size-4" />
          </Button>
          <Button variant="secondary" asChild>
            <Link to={`/casos/${creado.caso.id}`}>Ver el caso</Link>
          </Button>
        </div>
      </Card>
    )
  }

  const iniciales = p.paciente.replace(/[^A-ZÁÉÍÓÚÑ]/gi, '').slice(0, 2).toUpperCase()
  const faltan = requisitos.filter((r) => !r.ok)
  const diaNum = (d: Dia) => Number(d.clave.slice(8, 10))
  const mesNum = (d: Dia) => Number(d.clave.slice(5, 7))
  const letra = familia?.letra ?? 'C'
  const sugerida = habiles.find((d) => d.habiles >= minimo && cargaDe(d) < capacidad)

  return (
    <>
      <BarraFlotante>
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="display text-[22px] leading-none font-bold tracking-tight">{letra}-nuevo</span>
          <span className="text-[15px] font-medium text-ink2">Nuevo caso</span>
          <span className="hidden text-[13px] text-ink3 sm:inline">El número se asigna al crearlo</span>
        </span>
        <span className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-2 text-[14px] text-ink2" aria-live="polite">
            <span className="font-mono text-ink">{listos}/{requisitos.length}</span> listos
            <span aria-hidden className="hidden h-2 w-24 overflow-hidden rounded-full bg-ctl/25 shadow-[inset_0_1px_2px_rgb(24_32_44/.15)] sm:block">
              <span className="block h-full rounded-full bg-gradient-to-r from-ac to-[color-mix(in_srgb,var(--ac)_60%,var(--ok))] transition-[width] duration-500" style={{ width: `${(listos / requisitos.length) * 100}%` }} />
            </span>
          </span>
          <Button variant="ink" className="min-h-10" disabled={!completo || crear.isPending} onClick={() => crear.mutate()}>
            Crear caso <ArrowRight aria-hidden className="size-4" />
          </Button>
        </span>
      </BarraFlotante>

      <section className="grid max-w-[760px] gap-2">
        <Rotulo>Recepción · caso nuevo</Rotulo>
        <h1 className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="display text-[clamp(34px,5vw,52px)] leading-[1.02] font-bold tracking-tight">Cargar un pedido</span>
          <CodigoGrande prefijo={`${letra}-`} numero="····" className="text-[clamp(22px,3vw,30px)]" />
        </h1>
        <p className="m-0 text-[17px] text-ink2">Pegá el mensaje del odontólogo y completamos lo que se pueda. Vos revisás y elegís lo que falta con un toque.</p>
      </section>

      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="grid min-w-0 flex-[999_1_560px] gap-4">
          {/* 01 · Pegar el pedido */}
          <Seccion id="mensaje" n="01" titulo="Pegá el pedido" ayuda="El WhatsApp o el mail tal como llegó. Es opcional, pero ahorra la mitad del trabajo." tono="tinte" orden={0}>
            <label htmlFor="msg" className="sr-only">Mensaje del odontólogo</label>
            <textarea id="msg" rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej.: Hola! Te mando corona de zirconio para la 36 de J. G., color A2…" className="campo w-full resize-y p-3.5 text-[15px] leading-normal" />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ink" disabled={!mensaje.trim()} onClick={() => completarConMensaje()}>
                <Sparkles aria-hidden className="size-4" />
                Completar con el mensaje
              </Button>
            </div>
            {delMensaje.size > 0 && (
              <div className="grid gap-1.5 rounded-[14px] bg-sf/70 p-3 shadow-[inset_3px_0_0_var(--ac)]" role="status">
                <span className="text-[14px]">
                  Completé <strong className="font-semibold">{delMensaje.size} datos</strong> del mensaje. Están marcados con «Del mensaje»: revisalos antes de crear el caso.
                </span>
                {dudas.map((d) => (
                  <span key={d} className="flex items-start gap-1.5 text-[14px] text-wa">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {d}
                  </span>
                ))}
              </div>
            )}
          </Seccion>

          {/* 02 · Odontólogo y paciente */}
          <Seccion id="quien" n="02" titulo="Quién pide" ayuda="El odontólogo y las iniciales del paciente." listo={requisitos[0].ok && requisitos[1].ok} delMensaje={delMensaje.has('odontologo') || delMensaje.has('paciente')} orden={1}>
            {od ? (
              <div className="grid gap-3 rounded-[18px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--acS)_80%,var(--sf)),color-mix(in_srgb,var(--sf)_60%,var(--bg2)))] p-3.5 shadow-[inset_0_0_0_1px_var(--ln)]">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar ini={inicialesDe(od)} />
                  <span className="grid min-w-[150px] flex-1 leading-tight">
                    <strong className="display text-[19px] font-semibold">{od.nombre_completo}</strong>
                    <span className="text-[14px] text-ink2">{paga ? `Paga: ${paga.razon_social}` : od.clientes_detalle.length ? 'Elegí quién paga' : 'No tiene cliente cargado'}</span>
                  </span>
                  {ultimoTrabajo && (
                    <Button variant="secondary" className="min-h-11 py-1" onClick={repetirUltimo}>
                      <Repeat2 aria-hidden className="size-4" />
                      <span className="grid text-left leading-tight">
                        <span>Repetir el último pedido</span>
                        <span className="text-[12px] font-normal text-ink3">
                          {ultimoTrabajo.item_nombre}
                          {ultimoTrabajo.color ? ` · ${ultimoTrabajo.color}` : ''} · {ultimoCaso?.codigo}
                        </span>
                      </span>
                    </Button>
                  )}
                  <button type="button" onClick={() => setP((x) => ({ ...x, profesional: null, cliente: null }))} className="min-h-10 rounded-[10px] px-2 text-[14px] font-medium text-acT hover:bg-acS">
                    Cambiar
                  </button>
                </div>
                {od.clientes_detalle.length > 1 && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Quién paga">
                    {od.clientes_detalle.map((c) => (
                      <Chip key={c.id} on={p.cliente === c.id} onClick={() => set('cliente', c.id)} className="min-h-10 rounded-full px-3.5 text-[14px]">
                        Paga {c.razon_social}
                      </Chip>
                    ))}
                  </div>
                )}
                {od.clientes_detalle.length === 0 && (
                  <span className="text-[14px] text-wa">
                    Sumale un cliente en <Link to="/clientes" className="font-semibold text-acT">Clientes</Link> para poder cargarle casos.
                  </span>
                )}
              </div>
            ) : (
              <div className="grid gap-2.5">
                <label className="campo flex min-h-12 items-center gap-2 px-3.5">
                  <Search aria-hidden className="size-4 text-ink3" />
                  <span className="sr-only">Buscar odontólogo</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o clínica" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink3" />
                </label>
                <div className="flex flex-wrap gap-2" aria-label="Odontólogos">
                  {filtrados.map((o) => (
                    <Chip key={o.id} on={false} onClick={() => elegirProfesional(o)}>
                      {o.nombre_completo}
                      <span className="text-[13px] text-ink3">{o.clientes_detalle.map((c) => c.razon_social).join(', ')}</span>
                    </Chip>
                  ))}
                  {filtrados.length === 0 && (
                    <span className="text-[14px] text-ink3">
                      No está en la lista. Dalo de alta en <Link to="/clientes" className="font-semibold text-acT">Clientes</Link>.
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="grid max-w-[280px] gap-1.5">
              <label htmlFor="pac" className="text-[14px] font-semibold">Paciente <span className="font-normal text-ink3">(solo iniciales)</span></label>
              <input id="pac" value={p.paciente} onChange={(e) => set('paciente', e.target.value.toUpperCase().slice(0, 8), 'paciente')} placeholder="J. G." className="campo min-h-12 px-3.5 font-mono text-[17px] tracking-wide" />
            </div>
          </Seccion>

          {/* 03 · Trabajo */}
          <Seccion id="trabajo" n="03" titulo="Qué hay que hacer" ayuda="Trabajo, material y sobre qué va." listo={requisitos[2].ok} delMensaje={delMensaje.has('trabajo') || delMensaje.has('material') || delMensaje.has('implante')} orden={2}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Trabajo">
              {familias.map((f) => (
                <Chip key={f.id} on={p.familia === f.id} onClick={() => elegirFamilia(f.id)}>
                  {f.nombre}
                </Chip>
              ))}
            </div>
            {familia && itemsFamilia.length > 1 && (
              <div className="grid gap-2">
                <span className="text-[14px] font-semibold">Tipo</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo">
                  {itemsFamilia.map((i) => (
                    <Chip key={i.id} on={p.item === i.id} onClick={() => elegirItem(i)}>
                      {i.nombre}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {item && materiales.length > 1 && (
              <div className="grid gap-2">
                <span className="text-[14px] font-semibold">Material</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Material">
                  {materiales.map((m) => (
                    <Chip key={m} on={p.material === m} onClick={() => set('material', m, 'material')}>
                      {m}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {familia && (pideSoporte || soloImplante) && (
              <div className="grid gap-2">
                <span className="text-[14px] font-semibold">Va sobre</span>
                {pideSoporte && !soloImplante && (
                  <Segmented
                    label="Soporte"
                    value={p.soporte}
                    onChange={(v) => set('soporte', v, 'soporte')}
                    options={[
                      { id: 'munon', label: 'Muñón (diente tallado)' },
                      { id: 'implante', label: 'Implante' },
                    ]}
                    className="max-w-[460px]"
                  />
                )}
                {soporte === 'implante' && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {([['marca', 'Marca', 'Neodent'], ['diametro', 'Diámetro (mm)', '4.3'], ['conexion', 'Conexión', 'Cono morse']] as const).map(([k, l, ph]) => (
                      <div key={k} className="grid gap-1.5">
                        <label htmlFor={`imp-${k}`} className="text-[14px] font-semibold">{l}</label>
                        <input id={`imp-${k}`} value={p.implante[k]} onChange={(e) => set('implante', { ...p.implante, [k]: e.target.value }, 'implante')} placeholder={ph} className={cn('campo min-h-11 px-3.5 text-[15px]', !p.implante[k] && 'border-wa')} />
                      </div>
                    ))}
                    <span className="text-[13px] text-ink3 sm:col-span-3">Marca, diámetro y conexión: sin los tres, CAD no puede elegir el componente.</span>
                  </div>
                )}
              </div>
            )}
          </Seccion>

          {/* 04 · Pieza */}
          <Seccion id="pieza" n="04" titulo="Pieza" ayuda={multiple ? 'Tocá todas las piezas.' : 'Tocá la pieza. Numeración FDI, como la escribe el odontólogo.'} listo={p.piezas.length > 0} delMensaje={delMensaje.has('piezas')} orden={3}>
            <SelectorPiezas seleccion={p.piezas} onToggle={alternarPieza} onCambiar={(n) => set('piezas', n, 'piezas')} multiple={multiple} />
          </Seccion>

          {/* 05 · Color */}
          <Seccion id="color" n="05" titulo="Color" ayuda="Guía Vita clásica." listo={!!p.color || p.sinColor} delMensaje={delMensaje.has('color')} orden={4}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-2" role="group" aria-label="Color">
              {VITA.map((c) => (
                <Chip
                  key={c}
                  on={p.color === c && !p.sinColor}
                  onClick={() => {
                    setP((x) => ({ ...x, color: c, sinColor: false }))
                    setDelMensaje((s) => new Set([...s].filter((k) => k !== 'color')))
                  }}
                  aria-label={`Color ${c}`}
                  className="justify-start px-2.5"
                >
                  <span aria-hidden className="size-6 shrink-0 rounded-full border border-black/15 shadow-[inset_0_2px_3px_rgb(255_255_255/.6),0_2px_4px_rgb(0_0_0/.15)]" style={{ background: `radial-gradient(circle at 30% 25%, rgb(255 255 255 / .7), transparent 55%), ${TONOS[c]}` }} />
                  <span className="font-mono text-[14px]">{c}</span>
                </Chip>
              ))}
            </div>
            <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-[15px]">
              <input type="checkbox" className="size-5 accent-ac" checked={p.sinColor} onChange={(e) => set('sinColor', e.target.checked)} />
              No lo indicó: lo define el laboratorio
            </label>
          </Seccion>

          {/* 06 · Archivos */}
          <Seccion id="archivos" n="06" titulo="Archivos" ayuda="Escaneo, fotos y la orden. Decí qué es cada uno: el odontólogo los guarda como «escaneo 33423» y después nadie sabe cuál era." listo={requisitos[5].ok} orden={5}>
            <label
              className="grid cursor-pointer justify-items-center gap-1.5 rounded-[20px] border-2 border-dashed border-ctl bg-[radial-gradient(80%_120%_at_50%_0%,color-mix(in_srgb,var(--acS)_70%,transparent),transparent)] px-4 py-7 text-center transition duration-200 hover:-translate-y-0.5 hover:border-ac hover:bg-acS/60 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-fo"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                agregarArchivos(e.dataTransfer.files)
              }}
            >
              <span className="grid size-12 place-items-center rounded-[16px] bg-gradient-to-b from-[color-mix(in_srgb,var(--ac)_80%,white)] to-ac text-acI shadow-boton">
                <Upload aria-hidden className="size-6" />
              </span>
              <span className="text-[16px] font-semibold">Arrastrá los archivos o tocá para elegirlos</span>
              <span className="text-[13px] text-ink3">STL, PLY, OBJ · JPG, PNG · PDF · hasta 300 MB cada uno</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  agregarArchivos(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            {p.archivos.length > 0 && (
              <ul className="m-0 grid list-none gap-3 p-0">
                {p.archivos.map((a, i) => (
                  <li key={`${a.archivo.name}-${i}`} className="lamina grid gap-3 rounded-[18px] p-4 shadow-none" data-tono={a.categoria ? 'base' : 'calido'}>
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-acS to-[color-mix(in_srgb,var(--acS)_40%,var(--sf))] text-acT shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ac)_22%,transparent)]">
                        {a.tipo === 'escaneo' ? <FileBox aria-hidden className="size-5" /> : a.tipo === 'foto' ? <ImageIcon aria-hidden className="size-5" /> : <Clipboard aria-hidden className="size-5" />}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-mono text-[14px] font-medium">{a.archivo.name}</span>
                        <span className="font-mono text-[12px] text-ink3 uppercase">
                          {a.tipo} · {tam(a.archivo.size)}
                        </span>
                      </span>
                      <button type="button" aria-label={`Quitar ${a.archivo.name}`} onClick={() => set('archivos', p.archivos.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-[12px] text-ink3 transition hover:bg-baS hover:text-ba">
                        <X aria-hidden className="size-4" />
                      </button>
                    </div>
                    <div className="grid gap-1.5">
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        ¿Qué es este archivo?
                        {!a.categoria && <span className="rounded-full bg-waS px-2 py-px text-[12px] font-semibold text-wa">elegí uno</span>}
                      </span>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Categoría de ${a.archivo.name}`}>
                        {CATEGORIAS[a.tipo].map((c) => (
                          <Chip key={c} on={a.categoria === c} onClick={() => editarArchivo(i, { categoria: c })} className="min-h-10 rounded-full px-3.5 text-[14px]">
                            {c}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor={`com-${i}`} className="text-[14px] font-semibold">Comentario <span className="font-normal text-ink3">(opcional)</span></label>
                      <input id={`com-${i}`} value={a.comentario} onChange={(e) => editarArchivo(i, { comentario: e.target.value })} placeholder={COMENTARIOS[a.tipo] ?? 'Ej.: lo que tenga que saber el laboratorio'} className="campo min-h-11 px-3.5 text-[15px]" />
                    </div>
                    <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-ink3">
                      En el caso se va a ver como:
                      <strong className={cn('font-semibold', a.categoria ? 'text-ink' : 'text-wa')}>{nombreEnElCaso(a)}</strong>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-[15px]">
              <input type="checkbox" className="size-5 accent-ac" checked={p.llegaImpresion} onChange={(e) => set('llegaImpresion', e.target.checked)} />
              No hay escaneo: llega una impresión física con el cadete
            </label>
          </Seccion>

          {/* 07 · Fecha de entrega */}
          <Seccion id="entrega" n="07" titulo="Fecha de entrega" ayuda={item ? `${item.nombre}: ${minimo} días hábiles como mínimo. Cada día muestra cuánto trabajo tiene.` : 'Elegí el día. Se sugiere según el trabajo y la carga de cada día.'} listo={!!p.fecha} delMensaje={delMensaje.has('fecha')} tono="tinte" orden={6}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5" role="group" aria-label="Fecha de entrega">
              {habiles.map((d) => {
                const on = p.fecha === d.clave
                const cargaDia = cargaDe(d)
                const lleno = cargaDia >= capacidad
                const antes = d.habiles < minimo
                return (
                  <button key={d.clave} type="button" aria-pressed={on} onClick={() => set('fecha', d.clave, 'fecha')} className={cn('chip grid min-h-[112px] content-between justify-items-start gap-1.5 rounded-[18px] p-3 text-left', !on && antes && 'opacity-75', !on && lleno && 'text-ba')}>
                    <span className="font-mono text-[11px] font-semibold tracking-[0.1em] uppercase opacity-80">{NOMBRE_DIA[d.diaSemana]}</span>
                    <span className="display text-[34px] leading-none font-bold">
                      {diaNum(d)}
                      <span className="text-[13px] font-medium opacity-70">/{mesNum(d)}</span>
                    </span>
                    <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-current/20">
                      <span className="block h-full rounded-full bg-current" style={{ width: `${Math.min(100, (cargaDia / capacidad) * 100)}%` }} />
                    </span>
                    <span className="text-[11.5px] leading-tight font-semibold">
                      {cargaDia}/{capacidad}
                      {sugerida?.clave === d.clave && ' · sugerida'}
                      {lleno && ' · lleno'}
                      {antes && ' · urgente'}
                    </span>
                  </button>
                )
              })}
            </div>
            {fechaSel && fechaSel.habiles < minimo && (
              <p role="status" className="m-0 flex items-start gap-2 rounded-[14px] bg-waS p-3 text-[14px]">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-wa" />
                {fechaSel.texto} es antes del plazo habitual de {minimo} días hábiles: queda sujeta a que el laboratorio la confirme.
              </p>
            )}
            {fechaSel && cargaDe(fechaSel) >= capacidad && (
              <p role="status" className="m-0 flex items-start gap-2 rounded-[14px] bg-baS p-3 text-[14px]">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ba" />
                El {fechaSel.texto} ya está lleno ({cargaDe(fechaSel)} de ~{capacidad}). Conviene elegir otro día.
              </p>
            )}
          </Seccion>

          {/* 08 · Orden firmada */}
          <Seccion id="orden" n="08" titulo="Orden firmada" ayuda="La orden del odontólogo es obligatoria para el laboratorio (Decreto 1630/71). Todavía llega mucha en papel: acá se transcribe mirando la foto." listo={ordenOk} tono="calido" orden={7}>
            <Segmented
              label="Cómo llegó la orden"
              value={p.orden ?? ('' as 'papel')}
              onChange={(v) => set('orden', v)}
              options={[
                { id: 'papel', label: 'Llegó en papel', icon: <FileText aria-hidden className="size-4" /> },
                { id: 'caja', label: 'Viene con la caja', icon: <Layers aria-hidden className="size-4" /> },
                { id: 'digital', label: 'La cargó el odontólogo', icon: <ShieldCheck aria-hidden className="size-4" /> },
              ]}
            />
            {p.orden === 'papel' && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <Camera aria-hidden className="size-4 text-acT" />
                    1. La foto de la orden
                  </span>
                  {p.ordenFoto ? (
                    <>
                      <LenteImagen src={fotoOrden!} alt="Foto de la orden en papel" />
                      <button type="button" onClick={() => set('ordenFoto', null)} className="min-h-9 w-fit rounded-[10px] px-2 text-[13px] font-medium text-acT hover:bg-acS">Cambiar la foto</button>
                    </>
                  ) : (
                    <label className="grid cursor-pointer justify-items-center gap-1 rounded-[18px] border-2 border-dashed border-ctl bg-sf/60 px-4 py-6 text-center transition hover:border-ac hover:bg-sf focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-fo">
                      <Camera aria-hidden className="size-6 text-acT" />
                      <span className="text-[15px] font-semibold">Sacale una foto o escaneala</span>
                      <span className="text-[13px] text-ink3">JPG o PNG. Queda en el caso como respaldo.</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) set('ordenFoto', f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className="grid gap-3 rounded-[18px] bg-sf/70 p-4 shadow-[inset_0_0_0_1px_var(--ln)]">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <PenLine aria-hidden className="size-4 text-acT" />
                    2. Transcribila vos (son pocos datos)
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label htmlFor="ot" className="text-[14px] font-semibold">Número de orden</label>
                      <input id="ot" value={p.numeroOrden} onChange={(e) => set('numeroOrden', e.target.value.toUpperCase())} placeholder="OT-2291" className="campo min-h-11 px-3.5 font-mono text-[15px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="ot-fecha" className="text-[14px] font-semibold">Fecha de la orden</label>
                      <input id="ot-fecha" type="date" value={p.fechaOrden} onChange={(e) => set('fechaOrden', e.target.value)} className="campo min-h-11 px-3.5 text-[15px]" />
                    </div>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[15px]">
                    <input type="checkbox" className="mt-0.5 size-5 accent-ac" checked={p.ordenFirma} onChange={(e) => set('ordenFirma', e.target.checked)} />
                    <span>
                      Tiene la <strong className="font-semibold">firma y el sello</strong> del odontólogo
                      <span className="block text-[13px] text-ink3">Sin firma no es una orden válida: se le pide al odontólogo.</span>
                    </span>
                  </label>
                </div>
                <p className="m-0 flex items-start gap-2 rounded-[14px] bg-acS/80 p-3 text-[14px] text-ink2">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-acT" />
                  <span>
                    <strong className="font-semibold text-ink">Se transcribe a mano, sin OCR.</strong> La letra del odontólogo no se lee bien con IA y las órdenes tienen pocos datos. La foto queda adjunta al caso como respaldo legal.
                  </span>
                </p>
              </div>
            )}
            {p.orden === 'caja' && (
              <p className="m-0 flex items-start gap-2 rounded-[14px] bg-sf/70 p-3.5 text-[14.5px] shadow-[inset_0_0_0_1px_var(--ln)]">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-acT" />
                Recepción la controla al abrir la caja. Hasta que llegue, el caso queda con la orden «pendiente».
              </p>
            )}
            {p.orden === 'digital' && (
              <p className="m-0 flex items-start gap-2 rounded-[14px] bg-okS p-3.5 text-[14.5px]">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
                El odontólogo la firmó en la app con firma electrónica y hoja de evidencia. No hay nada que transcribir.
              </p>
            )}
            {/* La meta: que no venga más en papel. El link de carga llega con la app del odontólogo (Etapa 2). */}
            <div className="grid gap-2.5 rounded-[18px] border border-dashed border-ctl p-3.5 sm:grid-cols-[1fr_auto] sm:items-center">
              <span className="text-[14.5px]">
                <strong className="font-semibold">¿Que no te llegue más en papel?</strong> Con el link de carga el odontólogo completa y firma él, y el pedido entra solo.
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bg2 px-3 py-1.5 text-[13px] font-medium text-ink2">
                <Link2 aria-hidden className="size-4" /> Llega en la Etapa 2
              </span>
            </div>
          </Seccion>

          {/* Notas */}
          <Card className="entra grid gap-2 p-5 sm:p-6" style={{ '--d': 8 } as CSSProperties}>
            <label htmlFor="notas" className="text-[14px] font-semibold">Notas para el laboratorio <span className="font-normal text-ink3">(opcional)</span></label>
            <textarea id="notas" rows={2} value={p.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Ej.: el paciente es bruxómano; probar antes de terminar" className="campo w-full resize-y p-3.5 text-[15px]" />
          </Card>
        </div>

        {/* Ficha del pedido: dice qué falta y lleva a esa parte. */}
        <aside aria-label="Ficha del pedido" className="min-w-0 flex-[1_1_330px] lg:sticky lg:top-24">
          <Card className="grid gap-4 p-5">
            <div className="flex items-center gap-3.5">
              <span aria-hidden className="display grid size-[68px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[color-mix(in_srgb,var(--ac)_70%,white)] via-ac to-[color-mix(in_srgb,var(--ac)_75%,black)] text-[26px] font-bold text-acI shadow-[inset_0_1px_0_rgb(255_255_255/.4),0_14px_24px_-10px_var(--ac)]">
                {iniciales || <Stethoscope className="size-7" />}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="display truncate text-[26px] leading-tight font-semibold tracking-tight">{p.paciente || 'Paciente'}</span>
                <span className="truncate text-[15px] text-ink2">{od ? `${od.nombre_completo}${paga ? ` · ${paga.razon_social}` : ''}` : 'Sin odontólogo'}</span>
              </span>
              <Codigo className="self-start text-[12px]">⏱ {reloj}</Codigo>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-ctl/50 to-transparent" />

            <section aria-label="Pieza" className="grid gap-2">
              <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.1em] text-acT uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-ac" />
                Pieza a trabajar
              </span>
              <div className="grid gap-2 rounded-[18px] bg-[linear-gradient(150deg,color-mix(in_srgb,var(--ac)_16%,var(--sf)),color-mix(in_srgb,var(--ac)_6%,var(--sf)))] p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ac)_20%,transparent)]">
                <div className="flex items-end justify-between gap-3">
                  <span className={cn('display leading-none font-bold tracking-tight', p.piezas.length ? 'text-[56px] text-acT' : 'text-[40px] text-ink3')}>{p.piezas.length ? p.piezas.join(' · ') : '—'}</span>
                  <span className="pb-1 text-right text-[13px] text-ink2">{p.piezas.length ? (p.piezas.length > 1 ? `${p.piezas.length} piezas` : 'FDI') : 'Elegila en el paso 04'}</span>
                </div>
                <MiniOdontograma piezas={p.piezas} />
              </div>
            </section>

            <section aria-label="Trabajo" className="grid gap-2">
              <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.1em] text-acT uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-ac" />
                Trabajo
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Mosaico icono={Stethoscope} k="Trabajo" vacio={!item}>{item?.nombre}{p.material && materiales.length > 1 ? ` · ${p.material.toLowerCase()}` : ''}</Mosaico>
                <Mosaico icono={Layers} k="Va sobre" vacio={!familia || !(pideSoporte || soloImplante)}>{soporte === 'implante' ? 'Implante' : 'Muñón'}</Mosaico>
                <Mosaico icono={Palette} k="Color" vacio={!p.color && !p.sinColor}>
                  <span className="flex items-center gap-1.5">
                    {p.color && !p.sinColor && <span aria-hidden className="size-4 rounded-full border border-black/15" style={{ background: TONOS[p.color] }} />}
                    {p.sinColor ? 'Lo define el lab' : p.color}
                  </span>
                </Mosaico>
                <Mosaico icono={CalendarClock} k="Entrega" vacio={!fechaSel}>{fechaSel?.texto}</Mosaico>
              </div>
            </section>

            <section aria-label="Archivos y orden" className="grid gap-2">
              <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.1em] text-info uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-info" />
                Archivos y orden
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Mosaico icono={FileBox} k="Archivos" vacio={!resumen[5][1]}>{resumen[5][1]}</Mosaico>
                <Mosaico icono={FileText} k="Orden" vacio={!resumen[7][1]}>{resumen[7][1]}</Mosaico>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-transparent via-ctl/50 to-transparent" />

            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <span className="display text-[16px] font-semibold">Datos cargados</span>
                <span className="font-mono text-[14px] text-ink2">{listos} de {requisitos.length}</span>
              </div>
              <div aria-hidden className="h-2.5 overflow-hidden rounded-full bg-ctl/25 shadow-[inset_0_1px_2px_rgb(24_32_44/.18)]">
                <div className="h-full rounded-full bg-gradient-to-r from-ac to-[color-mix(in_srgb,var(--ac)_55%,var(--ok))] shadow-[0_0_12px_var(--ac)] transition-[width] duration-500" style={{ width: `${(listos / requisitos.length) * 100}%` }} />
              </div>
              {completo ? (
                <p className="m-0 flex items-center gap-2 text-[14.5px] font-semibold text-ok">
                  <Check aria-hidden className="size-4" strokeWidth={3} />
                  Está todo. Revisalo y crealo.
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0" aria-label="Lo que falta">
                  {faltan.map((r) => (
                    <li key={r.texto}>
                      <button type="button" onClick={() => ir(r.id)} className="group flex min-h-10 w-full items-center gap-2.5 rounded-[12px] px-2 text-left text-[14.5px] transition hover:bg-bg2/80">
                        <span aria-hidden className="grid size-5 place-items-center rounded-full border border-dashed border-ctl text-ink3 transition group-hover:border-ac group-hover:text-acT">
                          <ArrowRight className="size-3" />
                        </span>
                        {r.texto}
                        <span className="ml-auto text-[12.5px] text-ink3">obligatorio</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-[16px] bg-bg2/70 p-3 text-[14px] text-ink2">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-sf shadow-[0_2px_6px_rgb(24_32_44/.12)]">
                <Stethoscope className="size-4.5 text-acT" />
              </span>
              <span>
                <strong className="font-semibold text-ink">Entra a Revisión técnica.</strong> Al crearlo, el equipo lo ve con los archivos, sus categorías y tus notas.
              </span>
            </div>

            {crear.error && <Aviso>{crear.error.message}</Aviso>}
            {paso && <p role="status" className="m-0 text-[14px] font-medium text-acT">{paso}</p>}
            <Button variant="ink" size="lg" className="min-h-[54px] w-full justify-between px-5" disabled={!completo || crear.isPending} onClick={() => crear.mutate()}>
              {crear.isPending ? 'Creando…' : 'Crear caso y pasar a revisión'}
              <ArrowRight aria-hidden className="size-5" />
            </Button>
          </Card>
        </aside>
      </div>
    </>
  )
}
