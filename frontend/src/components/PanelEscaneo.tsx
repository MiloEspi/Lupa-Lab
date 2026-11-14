import { Box, Download, Eye, EyeOff, Layers, Lock, MapPinPlus, PanelRightClose, PanelRightOpen, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { descargarMalla, descargarVersion, useEscaneo, type ArchivoCaso, type NotaCaso } from '../lib/escaneo'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Segmented } from './ui/segmented'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { VisorReal, extDe, type CapaDef, type EstiloCapa, type Vista } from './VisorReal'

const FORMATOS = ['stl', 'ply', 'obj']
const VISTAS: { id: Vista; label: string }[] = [
  { id: 'inferior', label: 'Arcada inferior' },
  { id: 'superior', label: 'Superior' },
  { id: 'mordida', label: 'Mordida' },
]
// Un color por versión para distinguirlas cuando se superponen.
const TINTES = ['#6FA8E8', '#EFC98A', '#6FCFB8', '#C79BE8', '#EE9F9F']
const SIN_ESCANEO: ArchivoCaso = { id: '', nombre: '', tipo: 'inicial', version: 0, autor: '', cuando: '', origen: '', bloqueado: true, resumen: '', formato: '', capas: [] }
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB` : `${Math.round(n / 1000)} KB`)

type CapaFila = { def: CapaDef; versiones: ArchivoCaso[] }

/**
 * Escaneo del caso con versiones: el original del odontólogo queda intacto (solo lectura) y lo que
 * se hace en exocad entra como una versión nueva. Cada nota pertenece a la versión donde se hizo.
 * Se pueden superponer versiones con opacidad por capa, y descargar todo para abrirlo en exocad.
 * Es el panel del prototipo; los datos salen de la API (lib/escaneo.ts).
 */
export function PanelEscaneo({
  autor,
  casoId,
  archivoInicial,
  permitirVersiones = true,
  titulo = 'Escaneo con las marcas del equipo',
  etiquetaMarcar = 'Agregar nota en el escaneo',
  alto = '500px',
  panelPorDefecto,
  compacto = false,
}: {
  /** Quién escribe y sube: "Ana, recepción". */
  autor: string
  casoId: string
  archivoInicial?: string
  permitirVersiones?: boolean
  titulo?: string
  etiquetaMarcar?: string
  alto?: string
  /** Si se pasa, el panel de notas y capas se abre o se cierra cada vez que este valor cambia (el modo "enfoque" lo cierra). */
  panelPorDefecto?: boolean
  /** Archivos como una fila de botones chicos en vez de tarjetas grandes: el visor sube en la pantalla. */
  compacto?: boolean
}) {
  const { archivos, notas: guardadas, agregarNota, editarNota, agregarVersion } = useEscaneo(casoId)
  // Nota nueva todavía sin guardar: se ve en el visor y en la lista, pero recién existe al escribirle algo.
  const [nueva, setNueva] = useState<NotaCaso | null>(null)
  const notas = nueva ? [...guardadas, nueva] : guardadas
  const inicial = archivoInicial ?? archivos[archivos.length - 1]?.id ?? ''
  const [archivoId, setArchivoId] = useState(inicial)
  const [vista, setVista] = useState<Vista>('inferior')
  const [modoNota, setModoNota] = useState(false)
  const [notaSel, setNotaSel] = useState<number | null>(() => notas.find((n) => n.archivoId === inicial)?.n ?? null)
  const [editando, setEditando] = useState<{ n: number; nueva: boolean } | null>(null)
  const [borrador, setBorrador] = useState('')
  const [pendiente, setPendiente] = useState<File | null>(null)
  const [alcance, setAlcance] = useState<'protesis' | 'completo'>('protesis')
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  // Vista del visor: notas, panel lateral, maximizado, capas y comparación.
  const [notasVisibles, setNotasVisibles] = useState(true)
  const [panelVisible, setPanelVisible] = useState(true)
  const [maximizado, setMaximizado] = useState(false)
  const [pestana, setPestana] = useState('notas')
  const [comparar, setComparar] = useState(false)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [opacidad, setOpacidad] = useState<Record<string, number>>({})
  const [ocultas, setOcultas] = useState<string[]>([])
  const [aviso, setAviso] = useState('')
  const envoltorio = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (panelPorDefecto !== undefined) setPanelVisible(panelPorDefecto)
  }, [panelPorDefecto])

  const activo = archivos.find((a) => a.id === archivoId) ?? archivos[archivos.length - 1] ?? SIN_ESCANEO
  const base = archivos.find((a) => a.id === activo.basadoEn)
  const puedeComparar = permitirVersiones && archivos.length > 1
  const enComparacion = comparar && puedeComparar
  const versionesVistas = enComparacion ? archivos.filter((a) => seleccion.includes(a.id)) : [activo]
  const idsVistos = versionesVistas.map((a) => a.id)
  const delVisor = notas.filter((n) => idsVistos.includes(n.archivoId))
  const delActivo = notas.filter((n) => n.archivoId === activo.id)
  const deOtras = notas.length - delActivo.length

  // Capas únicas por archivo: lo que comparten dos versiones (las arcadas) se dibuja una sola vez.
  const filas: CapaFila[] = useMemo(() => {
    const m = new Map<string, CapaFila>()
    versionesVistas.forEach((a) =>
      a.capas.forEach((c) => {
        const f = m.get(c.url)
        if (f) f.versiones.push(a)
        else m.set(c.url, { def: c, versiones: [a] })
      }),
    )
    return [...m.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsVistos.join('|'), archivos.length])
  const capasVisor: CapaDef[] = filas.map((f) => ({ ...f.def, id: f.def.url }))

  const tinteDe = (f: CapaFila) => (enComparacion && versionesVistas.length > 1 && f.versiones.length < versionesVistas.length ? TINTES[f.versiones[0].version % TINTES.length] : undefined)
  const estilos: Record<string, EstiloCapa> = {}
  filas.forEach((f) => {
    const o = opacidad[f.def.url]
    estilos[f.def.url] = { opacidad: o === undefined ? undefined : o / 100, color: tinteDe(f) }
  })

  const elegir = (id: string) => {
    if (id === archivoId) return
    setArchivoId(id)
    setModoNota(false)
    setEditando(null)
    setNotaSel(notas.find((n) => n.archivoId === id)?.n ?? null)
  }

  const alternarComparar = () => {
    if (!comparar) {
      // Arranca con las dos últimas versiones: la más nueva semitransparente encima de la anterior,
      // así lo que cambió (lo que sobresale) se ve de otro color.
      const ultimas = archivos.slice(-2)
      setSeleccion(ultimas.map((a) => a.id))
      const anteriores = new Set(ultimas[0].capas.map((c) => c.url))
      const nuevas = ultimas[ultimas.length - 1].capas.filter((c) => !anteriores.has(c.url))
      setOpacidad((o) => Object.fromEntries([...Object.entries(o), ...nuevas.filter((c) => o[c.url] === undefined).map((c) => [c.url, 55])]))
    }
    setComparar(!comparar)
    setPestana('capas')
    setPanelVisible(true)
  }
  const alternarVersion = (id: string) => {
    const hay = seleccion.includes(id)
    if (hay && seleccion.length === 1) return // siempre queda al menos una
    setSeleccion(hay ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  }

  // --- Maximizar: ventana completa y, si el navegador deja, pantalla completa real.
  const alternarMax = () => {
    const sig = !maximizado
    setMaximizado(sig)
    if (sig) void envoltorio.current?.requestFullscreen?.().catch(() => undefined)
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }
  useEffect(() => {
    if (!maximizado) return
    const alSalir = () => !document.fullscreenElement && setMaximizado(false)
    const alTecla = (e: KeyboardEvent) => e.key === 'Escape' && setMaximizado(false)
    document.addEventListener('fullscreenchange', alSalir)
    document.addEventListener('keydown', alTecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', alSalir)
      document.removeEventListener('keydown', alTecla)
      document.body.style.overflow = antes
    }
  }, [maximizado])

  const recibirArchivo = (f: File) => {
    if (!permitirVersiones) return
    setErrorArchivo(FORMATOS.includes(extDe(f.name)) ? null : `Formato .${extDe(f.name)} no soportado. Exportá STL, PLY u OBJ desde exocad.`)
    setPendiente(f)
  }

  const guardarVersion = () => {
    if (!pendiente || !FORMATOS.includes(extDe(pendiente.name))) return
    agregarVersion.mutate(
      { archivo: pendiente, incluyeBase: alcance === 'protesis' },
      {
        onSuccess: (v) => {
          setPendiente(null)
          setComparar(false)
          setArchivoId(v.id)
          setNotaSel(null)
        },
        onError: (e) => setErrorArchivo(e.message),
      },
    )
  }

  const nuevaNota = (punto: [number, number, number], normal: [number, number, number]) => {
    const n = Math.max(0, ...guardadas.map((x) => x.n)) + 1
    setNueva({ id: 'nueva', n, archivoId: activo.id, cuando: 'ahora', punto, normal, texto: '', autor, visibilidad: 'equipo', esMia: true })
    setNotaSel(n)
    setEditando({ n, nueva: true })
    setBorrador('')
    setModoNota(false)
    setNotasVisibles(true)
    setPanelVisible(true)
    setPestana('notas')
  }
  const guardarNota = () => {
    if (!editando) return
    if (!borrador.trim()) return cancelarNota()
    const texto = borrador.trim()
    if (editando.nueva && nueva) {
      agregarNota.mutate(
        { version: nueva.archivoId, punto: nueva.punto, normal: nueva.normal, texto },
        {
          onSuccess: (guardada) => {
            setNueva(null)
            setNotaSel(guardada.numero)
            setEditando(null)
          },
          onError: (e) => setAviso(e.message),
        },
      )
      return
    }
    const nota = guardadas.find((x) => x.n === editando.n)
    if (nota) editarNota.mutate({ version: nota.archivoId, id: nota.id, texto }, { onSuccess: () => setEditando(null), onError: (e) => setAviso(e.message) })
  }
  const cancelarNota = () => {
    if (editando?.nueva) {
      setNueva(null)
      setNotaSel(null)
    }
    setEditando(null)
  }
  const alternarModoNota = () => {
    const sig = !modoNota
    setModoNota(sig)
    if (sig) setNotasVisibles(true)
  }

  const bajar = async () => {
    setAviso('Preparando el .zip…')
    try {
      const nombre = await descargarVersion(casoId, activo.id)
      setAviso(`Listo: se descargó ${nombre}. Abrí las mallas en exocad; las notas van en notas.csv.`)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo descargar.')
    }
  }

  const lateral = (
    <Tabs value={pestana} onValueChange={setPestana} className="grid gap-2">
      <TabsList className="w-full">
        <TabsTrigger value="notas" className="flex-1">Notas ({delVisor.length})</TabsTrigger>
        <TabsTrigger value="capas" className="flex-1">Capas</TabsTrigger>
      </TabsList>

      <TabsContent value="notas">
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`Notas de ${activo.nombre}`}>
          {delVisor.length === 0 && <li className="rounded-[14px] bg-sf2 p-3 text-[14px] text-ink3">Todavía no hay notas en esta versión.</li>}
          {delVisor.map((n) => {
            const on = n.n === notaSel
            const edit = editando?.n === n.n
            const deAca = n.archivoId === activo.id
            return (
              <li key={n.n}>
                {edit ? (
                  <div className="grid gap-2 rounded-[14px] border border-ac bg-acS p-3">
                    <label htmlFor={`nota-${n.n}`} className="text-[13px] font-semibold text-ink2">Nota {n.n}: ¿qué viste en este punto?</label>
                    <textarea
                      id={`nota-${n.n}`}
                      autoFocus
                      rows={3}
                      value={borrador}
                      onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          guardarNota()
                        }
                        if (e.key === 'Escape') cancelarNota()
                      }}
                      placeholder="Ej.: margen poco nítido, pedir reescaneo"
                      className="w-full resize-y rounded-[12px] border border-ctl bg-sf p-2.5 text-[15px] text-ink placeholder:text-ink3"
                    />
                    <div className="flex gap-2">
                      <Button className="min-h-10" onClick={guardarNota} disabled={!borrador.trim()}>Guardar nota</Button>
                      <Button className="min-h-10" variant="secondary" onClick={cancelarNota}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className={cn('flex items-start gap-1 rounded-[14px] border transition', on ? 'border-ac bg-acS' : 'border-ln bg-sf hover:bg-sf2')}>
                    <button type="button" aria-pressed={on} onClick={() => setNotaSel(n.n)} className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left">
                      <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-[50%_50%_50%_4px] bg-ac text-[13px] font-bold text-acI">{n.n}</span>
                      <span className="grid gap-0.5">
                        <span className="text-[15px]">{n.texto}</span>
                        <span className="text-[13px] text-ink3">
                          {n.autor}, {n.cuando}
                          {enComparacion && ` · ${archivos.find((a) => a.id === n.archivoId)?.tipo === 'inicial' ? 'original' : `v${archivos.find((a) => a.id === n.archivoId)?.version}`}`}
                        </span>
                      </span>
                    </button>
                    {n.esMia && deAca && (
                      <button
                        type="button"
                        className="mt-1.5 mr-1.5 min-h-9 shrink-0 rounded-[10px] px-2 text-[13px] font-medium text-acT hover:bg-acS"
                        onClick={() => {
                          setEditando({ n: n.n, nueva: false })
                          setBorrador(n.texto)
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
          <li>
            <Button variant={modoNota ? 'primary' : 'secondary'} className="w-full" aria-pressed={modoNota} onClick={alternarModoNota}>
              <MapPinPlus aria-hidden className="size-4" />
              {modoNota ? 'Cancelar' : etiquetaMarcar}
            </Button>
          </li>
          {permitirVersiones && !enComparacion && deOtras > 0 && (
            <li className="px-0.5 text-[13px] text-ink3">
              Hay {deOtras} {deOtras === 1 ? 'nota' : 'notas'} en {archivos.length > 2 ? 'otras versiones' : activo.tipo === 'inicial' ? `la versión ${archivos[archivos.length - 1].version}` : 'el escaneo inicial'}.{' '}
              <button type="button" className="font-medium text-acT underline" onClick={() => elegir(activo.tipo === 'inicial' ? archivos[archivos.length - 1].id : archivos[0].id)}>
                Verlas
              </button>
            </li>
          )}
        </ul>
      </TabsContent>

      <TabsContent value="capas" className="grid gap-2.5">
        {puedeComparar && (
          <div className="grid gap-2 rounded-[14px] bg-sf2 p-3">
            <Button variant={comparar ? 'primary' : 'secondary'} aria-pressed={comparar} onClick={alternarComparar} className="w-full">
              <Layers aria-hidden className="size-4" />
              {comparar ? 'Dejar de comparar' : 'Comparar versiones'}
            </Button>
            {comparar ? (
              <fieldset className="m-0 grid gap-1 border-0 p-0">
                <legend className="mb-1 text-[13px] font-semibold text-ink2">Versiones a superponer</legend>
                {archivos.map((a) => (
                  <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-1 hover:bg-sf">
                    <input type="checkbox" className="size-5 accent-ac" checked={seleccion.includes(a.id)} onChange={() => alternarVersion(a.id)} />
                    <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-ink3/40" style={{ background: TINTES[a.version % TINTES.length] }} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{a.tipo === 'inicial' ? 'Escaneo inicial' : `v${a.version} · ${a.nombre}`}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="m-0 text-[13px] text-ink3">Apila las versiones en el mismo lugar: bajá la opacidad de una capa para ver la que está debajo.</p>
            )}
          </div>
        )}

        <ul className="m-0 grid list-none gap-2 p-0" aria-label="Capas del escaneo">
          {filas.map((f) => {
            const k = f.def.url
            const visible = !ocultas.includes(k)
            const o = opacidad[k] ?? 100
            const tinte = tinteDe(f) ?? f.def.color
            const etiqueta = enComparacion && versionesVistas.length > 1 ? (f.versiones.length === versionesVistas.length ? 'Base' : f.versiones[0].tipo === 'inicial' ? 'Original' : `v${f.versiones[0].version}`) : null
            return (
              <li key={k} className={cn('grid gap-1 rounded-[14px] border border-ln bg-sf p-2', !visible && 'opacity-70')}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={visible}
                    aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${f.def.nombre}`}
                    className="grid size-11 shrink-0 place-items-center rounded-[10px] text-ink2 hover:bg-sf2"
                    onClick={() => setOcultas(visible ? [...ocultas, k] : ocultas.filter((x) => x !== k))}
                  >
                    {visible ? <Eye aria-hidden className="size-5" /> : <EyeOff aria-hidden className="size-5" />}
                  </button>
                  <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-ink3/40" style={{ background: tinte }} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{f.def.nombre}</span>
                  {etiqueta && <Badge tone={etiqueta === 'Base' ? 'neutral' : 'accion'} className="shrink-0 text-[12px]">{etiqueta}</Badge>}
                  <button
                    type="button"
                    aria-label={`Descargar ${f.def.nombre}`}
                    title="Descargar esta malla"
                    className="grid size-11 shrink-0 place-items-center rounded-[10px] text-acT hover:bg-acS"
                    onClick={() => void descargarMalla(f.def.url, f.def.nombre, f.def.ext ?? extDe(f.def.url))}
                  >
                    <Download aria-hidden className="size-5" />
                  </button>
                </div>
                <label className="flex min-h-11 items-center gap-3 px-2 text-[13px] text-ink2">
                  Opacidad
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={o}
                    onChange={(e) => setOpacidad({ ...opacidad, [k]: Number(e.target.value) })}
                    className="h-6 min-w-0 flex-1 accent-ac"
                    aria-valuetext={`${o} por ciento`}
                  />
                  <output className="w-10 text-right font-semibold text-ink">{o}%</output>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="m-0 text-[12px] text-ink3">Como el control de transparencia de exocad: cada capa tiene su visibilidad y su opacidad.</p>
      </TabsContent>
    </Tabs>
  )

  // Modo compacto: los archivos del caso son una fila de botones chicos y van en la misma línea que el selector de arcada.
  const pildoras =
    permitirVersiones && compacto ? (
      <div role="radiogroup" aria-label="Archivo a ver" className="flex min-w-0 flex-wrap items-center gap-2">
        {archivos.map((a) => {
          const on = a.id === activo.id
          const n = notas.filter((x) => x.archivoId === a.id).length
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={a.tipo === 'inicial' ? 'Escaneo inicial' : `Versión ${a.version}, ${a.nombre}`}
              title={a.tipo === 'inicial' ? 'Escaneo inicial, tal como llegó' : `v${a.version} · ${a.nombre}`}
              onClick={() => elegir(a.id)}
              className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] transition', on ? 'border-2 border-ac bg-acS font-semibold' : 'border-ln bg-sf hover:bg-sf2')}
            >
              {a.bloqueado ? <Lock aria-hidden className="size-3.5 shrink-0 text-ink2" /> : <Box aria-hidden className="size-3.5 shrink-0 text-acT" />}
              {/* Solo la elegida muestra el nombre completo; las otras, la sigla: así entran en una línea con el selector de arcada. */}
              {a.tipo === 'inicial' ? (on ? 'Escaneo inicial' : 'Original') : on ? `v${a.version} · ${a.nombre}` : `v${a.version}`}
              {n > 0 && <span className="rounded-full bg-bg2 px-1.5 font-mono text-[11.5px] text-ink2">{n}</span>}
            </button>
          )
        })}
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-ctl bg-sf px-3.5 text-[14px] font-medium text-ink hover:bg-sf2 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-fo" title="STL, PLY u OBJ. El original no se modifica: lo que se hace en exocad se guarda como versión nueva.">
          <Upload aria-hidden className="size-4 text-acT" />
          Subir
          <span className="sr-only"> versión desde exocad</span>
          <input
            type="file"
            accept=".stl,.ply,.obj"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) recibirArchivo(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    ) : null

  if (!archivos.length)
    return (
      <div className="grid min-h-[240px] place-items-center rounded-[18px] border border-dashed border-ctl bg-sf/60 p-8 text-center">
        <span className="grid max-w-[420px] gap-1.5">
          <Box aria-hidden className="mx-auto size-8 text-acT" />
          <strong className="text-[17px] font-semibold">Este caso no tiene escaneo cargado</strong>
          <span className="text-[14px] text-ink2">Llegó como impresión física o el escaneo todavía no se subió.</span>
        </span>
      </div>
    )

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        {pildoras ?? <h2 className="m-0 text-[18px] font-semibold">{titulo}</h2>}
        {!compacto && <Segmented<Vista> label="Qué arcada ver" value={vista} onChange={setVista} options={VISTAS} className="flex-[0_1_380px]" />}
      </div>

      {permitirVersiones && !compacto && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink2">Archivos del caso</span>
            <span className="text-[13px] text-ink3">El original no se modifica: lo que se hace en exocad se guarda como versión nueva.</span>
          </div>
          <div role="radiogroup" aria-label="Archivo a ver" className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
            {archivos.map((a) => (
              <ArchivoTarjeta key={a.id} a={a} activo={a.id === activo.id} notas={notas.filter((n) => n.archivoId === a.id).length} onPick={() => elegir(a.id)} />
            ))}
            <label className="grid min-h-[84px] cursor-pointer content-center justify-items-center gap-1 rounded-[14px] border border-dashed border-ctl bg-sf p-3 text-center text-[14px] font-medium text-ink hover:bg-sf2 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-fo">
              <Upload aria-hidden className="size-5 text-acT" />
              Subir versión desde exocad
              <span className="text-[12px] font-normal text-ink3">STL, PLY u OBJ · o soltalo sobre el visor</span>
              <input
                type="file"
                accept=".stl,.ply,.obj"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) recibirArchivo(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      )}

      {pendiente && (
        <div role="group" aria-label="Guardar nueva versión" className="grid gap-3 rounded-[14px] border border-ac bg-acS p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="font-semibold">Nueva versión: {pendiente.name}</strong>
            <span className="text-[13px] text-ink2">{kb(pendiente.size)} · el escaneo inicial queda como está</span>
          </div>
          {errorArchivo ? (
            <p role="alert" className="m-0 rounded-[12px] border border-ba bg-baS p-2.5 font-medium text-ba">{errorArchivo}</p>
          ) : (
            <Segmented<'protesis' | 'completo'>
              label="Qué tiene el archivo"
              value={alcance}
              onChange={setAlcance}
              options={[
                { id: 'protesis', label: 'Solo la prótesis' },
                { id: 'completo', label: 'Escena completa' },
              ]}
            />
          )}
          {!errorArchivo && (
            <p className="m-0 text-[14px] text-ink2">
              {alcance === 'protesis' ? 'Se superpone al escaneo inicial, en el mismo lugar que en exocad.' : 'Reemplaza al escaneo en esta versión: debe traer también las arcadas.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!errorArchivo && (
              <Button onClick={guardarVersion} disabled={agregarVersion.isPending}>
                {agregarVersion.isPending ? 'Subiendo…' : `Guardar como versión ${Math.max(0, ...archivos.map((a) => a.version)) + 1}`}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setPendiente(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
        <span className={cn('min-w-0 flex-[1_1_300px] text-ink2', compacto && !enComparacion && 'sr-only')}>
          {enComparacion ? (
            <>Comparando {versionesVistas.length} {versionesVistas.length === 1 ? 'versión' : 'versiones'} apiladas. Cada una tiene su color; ajustá la opacidad en la pestaña Capas.</>
          ) : activo.tipo === 'inicial' ? (
            <>
              <Lock aria-hidden className="mr-1 inline size-4 align-[-3px]" />
              Original del odontólogo, solo lectura. Las notas se pueden agregar, el archivo no se toca.
            </>
          ) : (
            <>Versión {activo.version}{base ? `, parte de «${base.nombre}»` : ''}. Las notas de esta versión no aparecen en el original.</>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {compacto && <Segmented<Vista> label="Qué arcada ver" value={vista} onChange={setVista} options={VISTAS} className="w-[370px]" />}
          <Button variant="secondary" className="min-h-10" aria-pressed={panelVisible} onClick={() => setPanelVisible(!panelVisible)}>
            {panelVisible ? <PanelRightClose aria-hidden className="size-4" /> : <PanelRightOpen aria-hidden className="size-4" />}
            {panelVisible ? (compacto ? 'Ocultar notas' : 'Ocultar notas y capas') : compacto ? `Notas (${delVisor.length})` : `Notas (${delVisor.length}) y capas`}
          </Button>
          {puedeComparar && (
            <Button variant={comparar ? 'primary' : 'secondary'} aria-pressed={comparar} className="min-h-10" onClick={alternarComparar}>
              <Layers aria-hidden className="size-4" />
              {comparar ? 'Dejar de comparar' : compacto ? 'Comparar' : 'Comparar versiones'}
            </Button>
          )}
          <Button variant="secondary" className="min-h-10" title="Descargar para abrir en exocad" onClick={() => void bajar()}>
            <Download aria-hidden className="size-4" />
            {compacto ? 'Descargar' : 'Descargar para exocad'}
          </Button>
        </div>
      </div>
      <p role="status" className={cn('m-0 text-[13px] text-ink2', !aviso && 'sr-only')}>{aviso}</p>

      <div
        ref={envoltorio}
        className={cn(maximizado ? 'fixed inset-0 z-50 flex gap-3 bg-bg p-3' : 'flex flex-wrap items-start gap-4')}
      >
        <div className={cn('min-w-0', maximizado ? 'h-full flex-1' : 'flex-[999_1_460px]')}>
          <VisorReal
            capas={capasVisor}
            vista={vista}
            notas={delVisor}
            notaSel={notaSel}
            onPickNota={(n) => {
              setNotaSel(n)
              setPestana('notas')
            }}
            modoNota={modoNota}
            onAdd={nuevaNota}
            onSoltar={permitirVersiones ? recibirArchivo : undefined}
            ocultar={ocultas}
            estilos={estilos}
            notasVisibles={notasVisibles}
            onToggleNotas={() => setNotasVisibles(!notasVisibles)}
            panelVisible={panelVisible}
            onTogglePanel={() => setPanelVisible(!panelVisible)}
            maximizado={maximizado}
            onToggleMax={alternarMax}
            etiqueta={enComparacion ? `${versionesVistas.length} versiones` : `${activo.nombre}${activo.tipo === 'diseno' ? ` v${activo.version}` : ''}`}
            alto={alto}
          />
        </div>
        {panelVisible && (
          <aside aria-label="Notas y capas" className={cn(maximizado ? 'h-full w-[340px] shrink-0 overflow-y-auto rounded-ficha border border-ln bg-sf p-3' : 'min-w-0 flex-[1_1_270px] lg:max-w-[340px]')}>
            {lateral}
          </aside>
        )}
      </div>
    </div>
  )
}

function ArchivoTarjeta({ a, activo, notas, onPick }: { a: ArchivoCaso; activo: boolean; notas: number; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onPick}
      className={cn('grid min-h-[84px] content-start gap-1 rounded-[14px] border p-3 text-left transition', activo ? 'border-2 border-ac bg-acS' : 'border-ln bg-sf hover:bg-sf2')}
    >
      <span className="flex items-center gap-2">
        {a.bloqueado ? <Lock aria-hidden className="size-4 shrink-0 text-ink2" /> : <Box aria-hidden className="size-4 shrink-0 text-acT" />}
        <strong className="min-w-0 flex-1 truncate font-semibold">{a.nombre}</strong>
        <Badge tone={a.bloqueado ? 'neutral' : 'accion'} className="shrink-0 text-[12px]">{a.bloqueado ? 'Original' : `v${a.version}`}</Badge>
      </span>
      <span className="text-[13px] text-ink2">{a.autor} · {a.cuando}</span>
      <span className="text-[13px] text-ink3">{a.origen} · {a.formato}{notas ? ` · ${notas} ${notas === 1 ? 'nota' : 'notas'}` : ''}</span>
    </button>
  )
}
