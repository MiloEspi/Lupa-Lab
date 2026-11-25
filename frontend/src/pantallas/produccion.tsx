/**
 * Producción en el celular (S13): se escanea el QR de la caja y se llega a `/p/<id>`, con los
 * datos grandes y tres toques: iniciar la etapa, terminarla o reportar un problema. Cada toque
 * guarda quién y cuándo. Botones de 56 px (se usa con guantes) y nada que no haga falta.
 *
 * Las reglas no están acá: el backend decide si se puede (rol de la etapa, cambio sin
 * confirmar, en espera). La pantalla solo esconde lo que no aplica y muestra el motivo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Check, Play, ScanLine, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, pedir } from '../api/cliente'
import { MisCajas } from '../components/MisCajas'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { estadoCaso, fechaCorta, NOMBRE_ROL, piezasDe, TONOS_VITA, tituloTrabajo } from '../lib/casos'
import { cuando } from '../lib/escaneo'
import { casoDeQR } from '../lib/qr'
import { useYo } from '../lib/sesion'
import { Aviso } from '../ui/marco'

// --- Entrada: escanear o buscar por número ------------------------------------------------

type Detector = { detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]> }
type ConstructorDetector = new (opciones: { formats: string[] }) => Detector
const DetectorQR = (globalThis as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector

/**
 * Lee el QR con la cámara. Donde el navegador no sabe leer códigos (algunos iPhone), no se
 * ofrece: la cámara del celular abre el link de la etiqueta igual, y queda la búsqueda por número.
 */
function Escaner({ onCaso, onCerrar }: { onCaso: (id: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [ajeno, setAjeno] = useState(false)

  useEffect(() => {
    if (!DetectorQR) return
    const detector = new DetectorQR({ formats: ['qr_code'] })
    let flujo: MediaStream | undefined
    let vigente = true
    let timer: number | undefined
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (f) => {
        if (!vigente) return f.getTracks().forEach((t) => t.stop())
        flujo = f
        const el = video.current
        if (!el) return
        el.srcObject = f
        await el.play()
        timer = window.setInterval(async () => {
          try {
            const [codigo] = await detector.detect(el)
            if (!codigo) return
            const id = casoDeQR(codigo.rawValue)
            if (id) onCaso(id)
            else setAjeno(true)
          } catch {
            // un cuadro que no se pudo leer: el siguiente sí
          }
        }, 300)
      })
      .catch(() => setError('No se pudo abrir la cámara. Revisá el permiso del navegador o buscá el caso por número.'))
    return () => {
      vigente = false
      window.clearInterval(timer)
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [onCaso])

  return (
    <Card className="grid gap-3 p-4">
      <div className="relative overflow-hidden rounded-[16px] bg-black">
        <video ref={video} muted playsInline aria-label="Cámara para leer el QR de la caja" className="aspect-square w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-[20px] border-[3px] border-white/85" />
      </div>
      {error && <Aviso>{error}</Aviso>}
      {ajeno && <Aviso tono="info">Ese QR no es de una caja de Lupa Lab.</Aviso>}
      <Button variant="secondary" size="lg" onClick={onCerrar}>
        Cerrar la cámara
      </Button>
    </Card>
  )
}

export function Produccion() {
  const navegar = useNavigate()
  const [escaneando, setEscaneando] = useState(false)
  const [q, setQ] = useState('')
  const buscar = q.trim()
  const lista = useQuery({
    queryKey: ['casos', 'buscar-produccion', buscar],
    enabled: buscar.length > 0,
    queryFn: () => pedir(api.GET('/api/casos', { params: { query: { q: buscar, estado: 'abierto', limit: 8 } } })),
  })

  return (
    <div className="mx-auto grid w-full max-w-[560px] gap-4">
      <header>
        <p className="m-0 font-mono text-[12px] tracking-wider text-ink3 uppercase">Producción</p>
        <h1 className="m-0 text-[28px] leading-tight">Apuntá al QR de la caja</h1>
      </header>

      {escaneando ? (
        <Escaner onCaso={(id) => navegar(`/p/${id}`)} onCerrar={() => setEscaneando(false)} />
      ) : DetectorQR ? (
        <Button size="lg" className="min-h-[72px] text-[19px]" onClick={() => setEscaneando(true)}>
          <ScanLine aria-hidden className="size-6" /> Escanear una caja
        </Button>
      ) : (
        <Aviso tono="info">Para escanear, abrí la cámara del celular y apuntá al QR de la caja: te lleva directo al caso.</Aviso>
      )}

      <MisCajas />

      <Card className="grid gap-3 p-4">
        <label htmlFor="buscar-caja" className="text-[15px] font-semibold">
          Buscar por número de caso
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink3" />
          <input
            id="buscar-caja"
            inputMode="numeric"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej.: 412"
            className="min-h-14 w-full rounded-[14px] border border-ctl bg-sf pr-4 pl-12 text-[18px] text-ink placeholder:text-ink3"
          />
        </div>
        {lista.error && <Aviso>{lista.error.message}</Aviso>}
        {buscar && lista.data && lista.data.results.length === 0 && <p className="m-0 text-ink3">No hay casos abiertos con ese número.</p>}
        <ul className="m-0 grid list-none gap-2 p-0">
          {lista.data?.results.map((c) => (
            <li key={c.id}>
              <Link to={`/p/${c.id}`} className="grid min-h-14 grid-cols-[auto_1fr] items-center gap-x-3 rounded-[14px] border border-ln bg-sf px-3.5 py-2 text-ink no-underline hover:bg-sf2">
                <strong className="text-[18px]">{c.codigo}</strong>
                <span className="truncate text-[15px] text-ink2">
                  Pieza {piezasDe(c.trabajos[0])} · {c.trabajos[0]?.etapa_actual?.nombre ?? 'terminado'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

// --- La caja: datos grandes y tres toques --------------------------------------------------

const CAMPOS: Record<string, string> = {
  piezas: 'Piezas',
  material: 'Material',
  color: 'Color',
  soporte: 'Soporte',
  implante_marca: 'Marca del implante',
  implante_diametro: 'Diámetro del implante',
  implante_conexion: 'Conexión del implante',
  observaciones: 'Observaciones',
}
const valor = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? Object.keys(v).sort().join(', ') : String(v))

function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-mono text-[11.5px] tracking-[0.1em] text-ink3 uppercase">{rotulo}</dt>
      <dd className="m-0 text-[19px] leading-snug font-medium">{children}</dd>
    </div>
  )
}

export function CajaProduccion() {
  const { id = '' } = useParams()
  const { data: yo } = useYo()
  const cliente = useQueryClient()
  const caso = useQuery({ queryKey: ['caso', id], queryFn: () => pedir(api.GET('/api/casos/{id}', { params: { path: { id } } })) })
  const [aviso, setAviso] = useState('')
  const [reportando, setReportando] = useState(false)
  const [problema, setProblema] = useState('')

  const refrescar = () => {
    cliente.invalidateQueries({ queryKey: ['caso', id] })
    cliente.invalidateQueries({ queryKey: ['mensajes', id] })
    cliente.invalidateQueries({ queryKey: ['casos'] })
  }
  const trabajoId = caso.data?.trabajos[0]?.id ?? ''
  const ruta = { params: { path: { id, trabajo: trabajoId } } }

  const iniciar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/trabajos/{trabajo}/iniciar', ruta)),
    onSuccess: (c) => (setAviso(`Iniciaste ${c.trabajos[0]?.etapa_actual?.nombre ?? 'la etapa'}.`), refrescar()),
  })
  const terminar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/trabajos/{trabajo}/avanzar', ruta)),
    onSuccess: (c) => {
      const sigue = c.trabajos[0]?.etapa_actual
      setAviso(sigue ? `Listo. La caja pasa a ${sigue.nombre} (${NOMBRE_ROL[sigue.rol] ?? sigue.rol}).` : 'Listo. El trabajo terminó todas sus etapas.')
      refrescar()
    },
  })
  const confirmar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/cambios/confirmar', { params: { path: { id } }, body: { rehacer: false, trabajo: null, volver_a: null, comentario: '' } })),
    onSuccess: () => (setAviso('Confirmaste que leíste el cambio. Ya podés seguir.'), refrescar()),
  })
  const reportar = useMutation({
    mutationFn: () => pedir(api.POST('/api/casos/{id}/trabajos/{trabajo}/problema', { ...ruta, body: { texto: problema } })),
    onSuccess: () => {
      // Todavía no hay push (S15): por ahora queda anotado en el caso para que Supervisión lo vea.
      setAviso('Quedó anotado en el caso, en la conversación, para que Supervisión lo vea.')
      setProblema('')
      setReportando(false)
      refrescar()
    },
  })

  if (caso.isPending) return <p className="text-ink3">Cargando…</p>
  if (caso.error) return <Aviso>{caso.error.message}</Aviso>
  const c = caso.data
  const t = c.trabajos[0]
  const etapa = t?.etapas.find((e) => e.estado === 'en_curso')
  const actual = t?.etapa_actual
  const roles = yo?.membresia_activa?.roles ?? []
  const estado = estadoCaso(c)
  const pendiente = c.cambio_pendiente
  const frenado = !!pendiente || c.en_espera || c.pausado
  const abierto = c.estado === 'abierto'
  const esDeEtapa = !!actual && (roles.includes(actual.rol as never) || roles.includes('supervision'))
  const puedeConfirmar = !!pendiente && pendiente.confirma.some((r) => roles.includes(r as never))
  const puedeReportar = !!yo?.permisos.includes('avanzar_produccion') && abierto
  const enRevision = actual?.rol === 'revision'
  const errorAccion = iniciar.error ?? terminar.error ?? confirmar.error ?? reportar.error
  const trabado = iniciar.isPending || terminar.isPending || confirmar.isPending

  return (
    <div className="mx-auto grid w-full max-w-[560px] gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" className="-ml-2 min-h-11">
          <Link to="/p">
            <ArrowLeft aria-hidden className="size-4" /> Otra caja
          </Link>
        </Button>
        <Link to={`/casos/${c.id}`} className="text-[14px] font-medium">
          Ver el caso completo
        </Link>
      </div>

      <header className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-[34px] leading-none">{c.codigo}</h1>
          <Badge tone={estado.tono === 'frenado' ? 'problema' : estado.tono === 'alerta' ? 'atencion' : 'neutral'}>{estado.texto}</Badge>
        </div>
        <p className="m-0 text-[16px] text-ink2">
          {c.profesional.nombre} · Entrega {fechaCorta(c.fecha_prometida)}
        </p>
      </header>

      {aviso && <Aviso tono="ok">{aviso}</Aviso>}
      {errorAccion && <Aviso>{errorAccion.message}</Aviso>}
      {!abierto && <Aviso tono="info">El caso está {c.estado}: no se puede cambiar.</Aviso>}

      {/* Lo que frena el caso va primero: sin esto no se puede seguir. */}
      {pendiente && (
        <Card tono="calido" role="alert" className="grid gap-3 border-wa p-4">
          <div className="flex items-center gap-2 text-wa">
            <AlertTriangle aria-hidden className="size-6" />
            <strong className="text-[19px]">Cambio sin confirmar</strong>
          </div>
          <ul className="m-0 grid list-none gap-1 p-0 text-[18px]">
            {pendiente.cambios.map((d) => (
              <li key={`${d.trabajo}-${d.campo}`}>
                <strong>{CAMPOS[d.campo] ?? d.campo}:</strong> {valor(d.antes)} → <strong>{valor(d.despues)}</strong>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[15px] text-ink2">
            {pendiente.registrado_por} lo registró {cuando(pendiente.creado)}: {pendiente.motivo}
          </p>
          {puedeConfirmar ? (
            <Button size="lg" disabled={trabado} onClick={() => confirmar.mutate()}>
              <Check aria-hidden className="size-5" /> Leí el cambio
            </Button>
          ) : (
            <p className="m-0 text-[15px] font-medium text-wa">Tiene que leerlo {pendiente.confirma.map((r) => NOMBRE_ROL[r] ?? r).join(' o ')} antes de seguir.</p>
          )}
        </Card>
      )}
      {c.en_espera && (
        <Card role="alert" className="grid gap-1 border-ba bg-baS p-4">
          <strong className="text-[19px] text-ba">En espera del odontólogo</strong>
          <span className="text-[15px]">Revisión técnica le pidió algo. La caja no avanza hasta que llegue.</span>
        </Card>
      )}

      <Card className="grid gap-4 p-5">
        <div className="flex items-end gap-4">
          <span aria-label="Pieza" className="text-[64px] leading-none font-bold tracking-tight">
            {piezasDe(t)}
          </span>
          <span className="pb-1.5 text-[19px] leading-snug text-ink2">{tituloTrabajo(t)}</span>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Dato rotulo="Material">{t?.material || '—'}</Dato>
          <Dato rotulo="Color">
            <span className="inline-flex items-center gap-2">
              {t?.color && <span aria-hidden className="size-5 rounded-full border border-ctl" style={{ background: TONOS_VITA[t.color] ?? 'transparent' }} />}
              {t?.color || '—'}
            </span>
          </Dato>
          {t?.soporte === 'implante' && (
            <div className="col-span-2">
              <Dato rotulo="Implante">{[t.implante_marca, t.implante_diametro, t.implante_conexion].filter(Boolean).join(' · ')}</Dato>
            </div>
          )}
          {(t?.observaciones || c.observaciones) && (
            <div className="col-span-2">
              <Dato rotulo="Indicaciones">{[t?.observaciones, c.observaciones].filter(Boolean).join(' ')}</Dato>
            </div>
          )}
        </dl>
      </Card>

      {actual && (
        <Card className="grid gap-3 p-5">
          <div className="grid gap-1">
            <span className="font-mono text-[11.5px] tracking-[0.1em] text-ink3 uppercase">
              Etapa {actual.orden} de {actual.total} · {NOMBRE_ROL[actual.rol] ?? actual.rol}
            </span>
            <strong className="text-[26px] leading-tight">{actual.nombre}</strong>
            <span className="text-[15px] text-ink2">
              {etapa?.iniciada ? `La inició ${etapa.iniciada_por} ${cuando(etapa.iniciada)}.` : 'Todavía no la inició nadie.'}
            </span>
          </div>

          {abierto && !esDeEtapa && <p className="m-0 text-[15px] text-ink2">Esta etapa la hace {NOMBRE_ROL[actual.rol] ?? actual.rol}: vos podés mirar y reportar un problema.</p>}
          {abierto && esDeEtapa && enRevision && (
            <Button asChild size="lg" variant="secondary">
              <Link to={`/revision/${c.id}`}>Hacer la revisión técnica</Link>
            </Button>
          )}
          {abierto && esDeEtapa && !enRevision && (
            <div className="grid gap-2.5">
              {!etapa?.iniciada && (
                <Button size="lg" className="min-h-[64px] text-[19px]" disabled={frenado || trabado} onClick={() => iniciar.mutate()}>
                  <Play aria-hidden className="size-5" /> Iniciar {actual.nombre}
                </Button>
              )}
              <Button variant={etapa?.iniciada ? 'primary' : 'secondary'} size="lg" className={etapa?.iniciada ? 'min-h-[64px] text-[19px]' : ''} disabled={frenado || trabado} onClick={() => terminar.mutate()}>
                <Check aria-hidden className="size-5" /> Terminar {actual.nombre}
              </Button>
              {frenado && <p className="m-0 text-[14px] text-wa">Primero resolvé lo que frena el caso (arriba).</p>}
            </div>
          )}
        </Card>
      )}
      {!actual && abierto && <Aviso tono="info">Este trabajo ya pasó por todas sus etapas.</Aviso>}

      {puedeReportar && (
        <Card className="grid gap-3 p-4">
          {reportando ? (
            <>
              <label htmlFor="problema" className="text-[16px] font-semibold">
                ¿Qué pasó?
              </label>
              <textarea
                id="problema"
                rows={4}
                autoFocus
                value={problema}
                onChange={(e) => setProblema(e.target.value)}
                placeholder="Ej.: se astilló el borde al fresar, hay que repetir"
                className="w-full rounded-[14px] border border-ctl bg-sf p-3.5 text-[17px] text-ink placeholder:text-ink3"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="secondary" size="lg" onClick={() => setReportando(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" size="lg" disabled={!problema.trim() || reportar.isPending} onClick={() => reportar.mutate()}>
                  {reportar.isPending ? 'Enviando…' : 'Avisar'}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="danger" size="lg" onClick={() => setReportando(true)}>
              <AlertTriangle aria-hidden className="size-5" /> Reportar un problema
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
