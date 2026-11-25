import { House, MapPin, MapPinOff, Maximize2, Minimize2, Minus, PanelRightClose, PanelRightOpen, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { cn } from '../lib/utils'
import { CuerpoLupa, R_CRISTAL, R_LUPA } from './LupaFisica'

export type Vista = 'inferior' | 'superior' | 'mordida'
type V3 = [number, number, number]

/** Nota anclada a un punto de la malla, en coordenadas del modelo (las de exocad: Z hacia arriba). */
export type NotaReal = { n: number; punto: V3; normal: V3; texto: string; autor: string; visibilidad: 'equipo' | 'odontologo' }

export type CapaDef = {
  id: string
  nombre: string
  url: string
  /** Formato del archivo (stl, ply, obj). Si falta, se deduce de la URL. */
  ext?: string
  color: string
  /** En qué vistas se muestra. */
  en: Vista[]
  /** Opacidad en la vista "mordida" (ej.: la arcada antagonista semitransparente). */
  opMordida?: number
}

/** Direcciones de cámara en coordenadas de exocad (Z arriba). */
export const VISTAS_CAMARA: { id: string; label: string; dir: V3 }[] = [
  { id: 'oclusal', label: 'Oclusal', dir: [0.001, 0.001, 1] },
  { id: 'frontal', label: 'Frontal', dir: [0, -1, 0.18] },
  { id: 'posterior', label: 'Posterior', dir: [0, 1, 0.18] },
  { id: 'izquierda', label: 'Izquierda', dir: [-1, 0, 0.18] },
  { id: 'derecha', label: 'Derecha', dir: [1, 0, 0.18] },
  { id: 'base', label: 'Base', dir: [0.001, 0.001, -1] },
]

/** Lee STL, PLY u OBJ y devuelve una geometría lista para dibujar. */
function parsear(buf: ArrayBuffer, ext: string): THREE.BufferGeometry {
  if (ext === 'stl') return new STLLoader().parse(buf)
  if (ext === 'ply') return new PLYLoader().parse(buf)
  if (ext === 'obj') {
    const g = new OBJLoader().parse(new TextDecoder().decode(buf))
    const geos: THREE.BufferGeometry[] = []
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geos.push((o as THREE.Mesh).geometry)
    })
    if (!geos.length) throw new Error('El OBJ no tiene mallas.')
    return geos[0]
  }
  throw new Error(`Formato .${ext} no soportado. Probá con STL, PLY u OBJ.`)
}

export const extDe = (nombre: string) => nombre.split('.').pop()?.toLowerCase() ?? ''

function material(color: string, conColor: boolean) {
  return new THREE.MeshStandardMaterial({
    color: conColor ? 0xffffff : new THREE.Color(color),
    vertexColors: conColor,
    roughness: 0.55,
    metalness: 0.04,
    side: THREE.DoubleSide, // los escaneos son superficies abiertas: se ven desde los dos lados
  })
}

/** Color y opacidad que el usuario eligió para una capa (como el control de transparencia de exocad). */
export type EstiloCapa = { color?: string; opacidad?: number }

type Motor = {
  cargarCapas: (defs: CapaDef[]) => void
  aplicarVista: () => void
  irA: (dir: V3) => void
  enfocar: (n: NotaReal) => void
  zoom: (factor: number) => void
  encuadrar: () => void
  redibujar: () => void
  lupa: (activa: boolean) => void
  aumento: (n: number) => void
  tamano: (k: number) => void
}

type Capa = { def: CapaDef; mesh: THREE.Mesh }

const botonVisor =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] px-3 text-[14px] font-medium text-ink transition duration-150 hover:bg-acS hover:text-acT active:scale-95'

const AUMENTOS = [2, 4, 6, 10]
/** Tamaños de la lupa: k multiplica el diámetro base de 192 px. */
const TAMANOS = [
  { id: 'chica', label: 'Chica', k: 0.7 },
  { id: 'media', label: 'Media', k: 1 },
  { id: 'grande', label: 'Grande', k: 1.5 },
]
const limitar = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/** Icono de lupa con mango, para el botón de la barra. */
function IconoLupa({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M7 8.2A4 4 0 0 1 10 6.6" opacity=".7" />
      <path d="M15 15l5.6 5.6" strokeWidth="3.2" />
    </svg>
  )
}

/**
 * Visor de escaneo real: carga mallas STL/PLY/OBJ con three.js, gira, hace zoom, salta a vistas
 * de cámara y deja notas ancladas a un punto de la malla (quedan pegadas al modelo al rotarlo y se
 * atenúan si quedan detrás). Prueba descartable: ver spikes/ui-kit/README.md.
 */
export function VisorReal({
  capas,
  vista,
  notas,
  notaSel,
  onPickNota,
  modoNota = false,
  onAdd,
  onSoltar,
  ocultar = [],
  estilos = {},
  etiqueta,
  notasVisibles = true,
  onToggleNotas,
  panelVisible = true,
  onTogglePanel,
  maximizado = false,
  onToggleMax,
  alto = '480px',
}: {
  capas: CapaDef[]
  vista: Vista
  notas: NotaReal[]
  notaSel: number | null
  onPickNota: (n: number) => void
  modoNota?: boolean
  onAdd?: (punto: V3, normal: V3) => void
  /** Si se pasa, se puede soltar un archivo sobre el visor (crea una versión nueva). */
  onSoltar?: (f: File) => void
  /** Ids de capas a ocultar (ej.: la prótesis, para ver el escaneo solo). */
  ocultar?: string[]
  /** Color y opacidad por id de capa. Lo que no está acá usa el valor de la capa. */
  estilos?: Record<string, EstiloCapa>
  etiqueta?: string
  /** Mostrar u ocultar las marcas y el globo de la nota, para ver el escaneo limpio. */
  notasVisibles?: boolean
  onToggleNotas?: () => void
  /** Panel lateral (notas y capas) visible; el botón lo esconde para ver el escaneo a todo el ancho. */
  panelVisible?: boolean
  onTogglePanel?: () => void
  maximizado?: boolean
  onToggleMax?: () => void
  alto?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const motor = useRef<Motor | null>(null)
  const pines = useRef(new Map<number, HTMLButtonElement>())
  const globo = useRef<HTMLDivElement>(null)
  // Lo que el motor lee en cada cuadro vive en refs, para no recrear la escena.
  const [lupa, setLupa] = useState(false)
  const [aumento, setAumento] = useState(3)
  const [tam, setTam] = useState('media')
  const lupaRaiz = useRef<HTMLDivElement>(null)
  const lupaGiro = useRef<HTMLDivElement>(null)
  const lupaBarrido = useRef<HTMLDivElement>(null)
  const lupaLectura = useRef<HTMLDivElement>(null)
  const live = useRef({ notas, notaSel, modoNota, onAdd, vista, ocultar, etiqueta, estilos, onAumento: setAumento })
  live.current = { notas, notaSel, modoNota, onAdd, vista, ocultar, etiqueta, estilos, onAumento: setAumento }

  const [info, setInfo] = useState('Cargando escaneo…')
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setError('Este navegador no pudo iniciar WebGL.')
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 2000)
    // Luz de estudio: cielo suave + luz principal + relleno desde el otro lado.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bd, 1.0))
    const key = new THREE.DirectionalLight(0xffffff, 1.9)
    key.position.set(40, 90, 60)
    const fill = new THREE.DirectionalLight(0xfff3e6, 0.7)
    fill.position.set(-60, 30, -40)
    scene.add(key, fill)

    // El modelo viene de exocad con Z hacia arriba; three usa Y hacia arriba.
    const modelo = new THREE.Group()
    modelo.rotation.x = -Math.PI / 2
    scene.add(modelo)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.screenSpacePanning = true

    // Las geometrías se guardan por URL: cambiar de versión que comparte archivos es instantáneo.
    const cache = new Map<string, Promise<THREE.BufferGeometry>>()
    const geometria = (def: CapaDef) => {
      let p = cache.get(def.url)
      if (!p) {
        p = fetch(def.url)
          .then((r) => {
            if (!r.ok) throw new Error(`No se pudo cargar ${def.nombre}`)
            return r.arrayBuffer()
          })
          .then((buf) => {
            const geo = parsear(buf, def.ext ?? extDe(def.url))
            // Un archivo vacío (0 vértices) no es un error de red pero tampoco se puede ver: se avisa en vez de dejar el visor en blanco.
            if (!geo.attributes.position || geo.attributes.position.count === 0) throw new Error(`${def.nombre} no tiene geometría: el archivo está vacío o está dañado. Volvé a exportarlo.`)
            if (!geo.attributes.normal) geo.computeVertexNormals()
            return geo
          })
        cache.set(def.url, p)
      }
      return p
    }

    let actuales: Capa[] = []
    let sucio = true
    let vivo = true
    let ficha = 0
    // Estado de la lupa física: posición suavizada, inclinación por inercia y resorte de entrada.
    const L = { tam: 1, activa: false, dentro: true, tieneMouse: false, aumento: 3, aumentoVis: 3, x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, ang: 40, swing: 0, esc: 0, ev: 0, luz: 0 }
    // Tamaño elegido (chica, media, grande), sin pasarse de lo que entra en el visor.
    const escalaLupa = () => Math.min(L.tam, (Math.min(el.clientWidth, el.clientHeight) * 0.6) / (2 * R_LUPA))
    let anim: { t0: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; t0v: THREE.Vector3; t1v: THREE.Vector3 } | null = null

    const visibles = (): THREE.Mesh[] => actuales.filter((c) => c.mesh.visible).map((c) => c.mesh)
    const triangulos = () => visibles().reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0)

    const textoInfo = (extra = '') => {
      const k = Math.round(triangulos() / 100) / 10
      const et = live.current.etiqueta ? `${live.current.etiqueta} · ` : ''
      setInfo(`${et}${k.toLocaleString('es-AR')} mil triángulos${extra}`)
    }

    /** Dónde poner la cámara para ver todo lo visible desde una dirección (en ejes de three). */
    const encuadre = (dir: THREE.Vector3) => {
      const caja = new THREE.Box3()
      visibles().forEach((m) => caja.union(new THREE.Box3().setFromObject(m)))
      if (caja.isEmpty()) return null
      const centro = caja.getCenter(new THREE.Vector3())
      const tam = caja.getSize(new THREE.Vector3()).length()
      const dist = (tam / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 0.95
      camera.near = Math.max(0.5, dist / 100)
      camera.far = dist * 20
      camera.updateProjectionMatrix()
      return { centro, pos: centro.clone().add(dir.clone().normalize().multiplyScalar(dist)) }
    }
    const aThree = (d: V3) => new THREE.Vector3(d[0], d[2], -d[1]) // de ejes exocad a ejes three
    const DIR_INICIAL = new THREE.Vector3(0.25, 1, 0.6)

    const animarA = (pos: THREE.Vector3, objetivo: THREE.Vector3, dur = 650) => {
      anim = { t0: performance.now(), dur, p0: camera.position.clone(), p1: pos, t0v: controls.target.clone(), t1v: objetivo }
    }

    const encuadrar = (dir = DIR_INICIAL, animar = false) => {
      const e = encuadre(dir)
      if (!e) return
      if (animar) animarA(e.pos, e.centro)
      else {
        controls.target.copy(e.centro)
        camera.position.copy(e.pos)
        anim = null
      }
      sucio = true
    }

    /** Muestra u oculta capas según la vista elegida y lo que el usuario escondió. */
    const aplicarVista = () => {
      const { vista: v, ocultar: oc, estilos: es } = live.current
      actuales.forEach(({ def, mesh }) => {
        mesh.visible = def.en.includes(v) && !oc.includes(def.id)
        const mat = mesh.material as THREE.MeshStandardMaterial
        const st = es[def.id]
        if (!mesh.geometry.attributes.color) mat.color.set(st?.color ?? def.color)
        const op = st?.opacidad ?? (v === 'mordida' ? (def.opMordida ?? 1) : 1)
        mat.opacity = op
        mat.transparent = op < 1
        mat.depthWrite = op >= 1
        mesh.renderOrder = op < 1 ? 2 : 0
      })
      textoInfo()
      sucio = true
    }

    // --- Notas: se proyectan los puntos 3D a pantalla en cada cuadro y se atenúan si quedan detrás.
    const rayo = new THREE.Raycaster()
    const v = new THREE.Vector3()
    const proyectar = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const { notas: ns, notaSel: sel } = live.current
      const objetivos = visibles()
      let selPos: { x: number; y: number; oculto: boolean } | null = null
      ns.forEach((n) => {
        const b = pines.current.get(n.n)
        if (!b) return
        v.set(...n.punto)
        modelo.localToWorld(v)
        const dist = camera.position.distanceTo(v)
        rayo.set(camera.position, v.clone().sub(camera.position).normalize())
        const golpes = rayo.intersectObjects(objetivos, false)
        const oculto = golpes.length > 0 && golpes[0].distance < dist - 0.25
        v.project(camera)
        const x = (v.x * 0.5 + 0.5) * w
        const y = (-v.y * 0.5 + 0.5) * h
        // Las marcas que quedan bajo el cristal de la lupa se esconden: ahí lo que manda es la imagen ampliada.
        const bajoLupa = L.esc > 0.05 && Math.hypot(x - L.x, y - L.y) < R_CRISTAL * escalaLupa() * L.esc
        const fuera = v.z > 1 || x < 0 || x > w || y < 0 || y > h || bajoLupa
        b.style.display = fuera ? 'none' : ''
        b.style.left = `${x}px`
        b.style.top = `${y}px`
        b.style.opacity = oculto ? '0.35' : '1'
        if (n.n === sel) selPos = { x, y, oculto: oculto || fuera }
      })
      const g = globo.current
      if (g) {
        const s = selPos as { x: number; y: number; oculto: boolean } | null
        if (s && !s.oculto) {
          g.style.display = ''
          g.style.left = `${s.x > w * 0.6 ? s.x - 272 : s.x + 26}px`
          g.style.top = `${Math.min(s.y, h * 0.7) - 18}px`
        } else g.style.display = 'none'
      }
    }

    const enfocar = (n: NotaReal) => {
      const p = new THREE.Vector3(...n.punto)
      modelo.localToWorld(p)
      const nor = new THREE.Vector3(...n.normal).applyQuaternion(modelo.quaternion).normalize()
      animarA(p.clone().add(nor.multiplyScalar(26)).add(new THREE.Vector3(0, 9, 0)), p)
    }

    /** Cambia el conjunto de capas (otra versión del caso) y encuadra. */
    const cargarCapas = (defs: CapaDef[]) => {
      const mia = ++ficha
      const t0 = performance.now()
      setCargando(true)
      setError(null)
      Promise.all(defs.map(async (def) => ({ def, geo: await geometria(def) })))
        .then((lista) => {
          if (!vivo || mia !== ficha) return
          actuales.forEach((c) => {
            modelo.remove(c.mesh)
            ;(c.mesh.material as THREE.Material).dispose()
          })
          actuales = lista.map(({ def, geo }) => {
            const mesh = new THREE.Mesh(geo, material(def.color, !!geo.attributes.color))
            modelo.add(mesh)
            return { def, mesh }
          })
          aplicarVista()
          encuadrar()
          const sel = live.current.notas.find((x) => x.n === live.current.notaSel)
          if (sel) enfocar(sel)
          textoInfo(` · cargó en ${((performance.now() - t0) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} s`)
          setCargando(false)
        })
        .catch((e: Error) => {
          if (!vivo || mia !== ficha) return
          // Que no quede dibujada la versión anterior detrás del aviso: parecería que el archivo nuevo es ese.
          actuales.forEach((c) => {
            modelo.remove(c.mesh)
            ;(c.mesh.material as THREE.Material).dispose()
          })
          actuales = []
          sucio = true
          setError(e.message)
          setCargando(false)
        })
    }

    // --- Tocar el escaneo para poner una nota
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY })
    const onUp = (e: PointerEvent) => {
      if (!down || !live.current.modoNota || !live.current.onAdd) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return // fue un arrastre, no un toque
      const r = renderer.domElement.getBoundingClientRect()
      rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const g = rayo.intersectObjects(visibles(), false)[0]
      if (!g || !g.face) return
      const p = modelo.worldToLocal(g.point.clone())
      live.current.onAdd(p.toArray() as V3, g.face.normal.toArray() as V3)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    // --- Lupa física. Dentro del cristal se vuelve a dibujar la escena con una cámara más cerrada
    // (detalle real del escaneo, no píxeles agrandados), a una textura que se pega en un círculo.
    const lado = Math.round(2 * R_CRISTAL * TAMANOS[TAMANOS.length - 1].k * Math.min(devicePixelRatio, 2)) // alcanza para la lupa más grande
    const rt = new THREE.WebGLRenderTarget(lado, lado, { samples: 4 })
    const lensCam = new THREE.PerspectiveCamera()
    const lensScene = new THREE.Scene()
    const ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    const lensMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: rt.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tex; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float k = 0.86 + 0.14 * r * r;      // los bordes se comprimen un poco, como en un cristal real
          float ca = 0.014 * r * r;            // y se abre un leve borde de color
          vec4 c = texture2D(tex, 0.5 + p * k);
          float cr = texture2D(tex, 0.5 + p * (k + ca)).r;
          float cb = texture2D(tex, 0.5 + p * (k - ca)).b;
          vec3 col = c.a > 0.001 ? vec3(cr, c.g, cb) / c.a : vec3(0.0);
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
          #include <colorspace_fragment>
          float borde = 1.0 - smoothstep(0.975, 1.0, r);
          float vig = 1.0 - 0.06 * pow(r, 3.0);
          gl_FragColor = vec4(gl_FragColor.rgb * vig * c.a * borde, c.a * borde);
        }`,
      transparent: true,
      blending: THREE.CustomBlending, // reemplaza lo que había debajo: el círculo muestra solo la imagen ampliada
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
      depthTest: false,
      depthWrite: false,
    })
    const lensGeo = new THREE.CircleGeometry(1, 80)
    const lensMesh = new THREE.Mesh(lensGeo, lensMat)
    lensScene.add(lensMesh)

    const textoLectura = () => `×${L.aumento.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

    /** Mueve y gira la lupa de cartón piedra: inercia, resorte de entrada, mango que cambia de lado en los bordes. */
    const actualizarLupa = () => {
      const raiz = lupaRaiz.current
      const giro = lupaGiro.current
      if (!raiz || !giro) return false
      const w = el.clientWidth
      const h = el.clientHeight
      const objEsc = L.activa && L.dentro ? 1 : 0
      let mov = false
      if (Math.abs(objEsc - L.esc) > 0.002 || Math.abs(L.ev) > 0.002) {
        L.ev = (L.ev + (objEsc - L.esc) * 0.2) * 0.7
        L.esc = Math.max(0, L.esc + L.ev)
        mov = true
      } else L.esc = objEsc
      if (L.esc <= 0.003 && objEsc === 0) {
        if (raiz.style.display !== 'none') raiz.style.display = 'none'
        return false
      }
      const px = L.x
      const py = L.y
      L.x += (L.tx - L.x) * 0.36
      L.y += (L.ty - L.y) * 0.36
      L.vx = Math.abs(L.x - px) > 0.02 ? L.x - px : L.vx * 0.7
      L.vy = Math.abs(L.y - py) > 0.02 ? L.y - py : L.vy * 0.7
      if (Math.abs(L.tx - L.x) > 0.05 || Math.abs(L.ty - L.y) > 0.05) mov = true
      // El mango pasa al otro lado cuando la lupa se acerca a un borde, para no salirse del visor.
      const objAng = L.y > h * 0.7 ? (L.x > w * 0.6 ? 220 : 320) : L.x > w * 0.6 ? 140 : 40
      const da = ((objAng - L.ang + 540) % 360) - 180
      if (Math.abs(da) > 0.05) {
        L.ang += da * 0.12
        mov = true
      }
      const objSwing = limitar(-L.vx * 0.9, -26, 26)
      if (Math.abs(objSwing - L.swing) > 0.05) mov = true
      L.swing += (objSwing - L.swing) * 0.18
      if (Math.abs(L.aumento - L.aumentoVis) > 0.003) {
        L.aumentoVis += (L.aumento - L.aumentoVis) * 0.22
        mov = true
      }
      const s = L.esc * escalaLupa()
      const inclX = limitar(-L.vy * 0.5, -12, 12)
      const inclY = limitar(L.vx * 0.5, -12, 12)
      raiz.style.display = ''
      raiz.style.transform = `translate3d(${L.x - R_LUPA}px, ${L.y - R_LUPA}px, 0) perspective(700px) rotateX(${inclX}deg) rotateY(${inclY}deg) rotate(${(1 - Math.min(L.esc, 1)) * -40}deg) scale(${s})`
      raiz.style.opacity = String(Math.min(1, L.esc * 1.5))
      giro.style.transform = `rotate(${L.ang + L.swing}deg)`
      if (lupaBarrido.current) lupaBarrido.current.style.transform = `translateX(${limitar(L.vx * 4, -40, 40)}px)`
      const lec = lupaLectura.current
      if (lec) {
        const t = performance.now() - L.luz
        lec.textContent = textoLectura()
        lec.style.opacity = t < 1600 ? '1' : '0'
        if (t < 1700) mov = true
      }
      if (mov) sucio = true
      return true
    }

    const dibujarLupa = () => {
      if (L.esc < 0.02) return
      const w = el.clientWidth
      const h = el.clientHeight
      const s = L.esc * escalaLupa()
      const ventana = (2 * R_CRISTAL * escalaLupa()) / L.aumentoVis // cuánto del visor se ve a través del cristal
      lensCam.position.copy(camera.position)
      lensCam.quaternion.copy(camera.quaternion)
      lensCam.fov = camera.fov
      lensCam.near = camera.near
      lensCam.far = camera.far
      lensCam.aspect = w / h
      lensCam.setViewOffset(w, h, L.x - ventana / 2, L.y - ventana / 2, ventana, ventana)
      lensCam.updateProjectionMatrix()
      renderer.setRenderTarget(rt)
      renderer.render(scene, lensCam)
      renderer.setRenderTarget(null)
      ortho.right = w
      ortho.top = h
      ortho.updateProjectionMatrix()
      lensMesh.position.set(L.x, h - L.y, 0)
      lensMesh.scale.setScalar(R_CRISTAL * s)
      renderer.autoClear = false
      renderer.render(lensScene, ortho)
      renderer.autoClear = true
    }

    const aLocal = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const enHerramientas = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('[data-no-lupa]')
    const alMover = (e: PointerEvent) => {
      L.dentro = true
      if (enHerramientas(e.target)) return // sobre los botones del visor la lupa se queda quieta
      const [x, y] = aLocal(e)
      L.tx = x
      L.ty = y
      if (!L.tieneMouse) {
        L.tieneMouse = true
        L.x = x
        L.y = y
      }
    }
    const alSalir = () => {
      L.dentro = false
    }
    // La rueda cambia la potencia de la lupa (con Shift sigue siendo el zoom del visor): así no hay que alejar y acercar toda la escena.
    const alRueda = (e: WheelEvent) => {
      if (!L.activa || e.shiftKey || e.ctrlKey || enHerramientas(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      L.aumento = limitar(L.aumento * Math.exp(-e.deltaY * 0.0016), 1.5, 12)
      L.luz = performance.now()
      live.current.onAumento(Math.round(L.aumento * 10) / 10)
      sucio = true
    }
    el.addEventListener('pointermove', alMover)
    el.addEventListener('pointerdown', alMover)
    el.addEventListener('pointerleave', alSalir)
    el.addEventListener('pointerenter', alMover)
    el.addEventListener('wheel', alRueda, { capture: true, passive: false })

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      sucio = true
    })
    ro.observe(el)

    // Se dibuja solo cuando algo cambia (cámara, vista, notas): no gasta batería en reposo.
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (anim) {
        const k = Math.min(1, (performance.now() - anim.t0) / anim.dur)
        const e = 1 - Math.pow(1 - k, 3)
        camera.position.lerpVectors(anim.p0, anim.p1, e)
        controls.target.lerpVectors(anim.t0v, anim.t1v, e)
        if (k >= 1) anim = null
        sucio = true
      }
      actualizarLupa()
      const cambio = controls.update()
      if (cambio || sucio) {
        renderer.render(scene, camera)
        dibujarLupa()
        proyectar()
        sucio = false
      }
    }
    tick()

    motor.current = {
      cargarCapas,
      aplicarVista,
      irA: (d) => encuadrar(aThree(d), true),
      enfocar,
      zoom: (f) => {
        const off = camera.position.clone().sub(controls.target).multiplyScalar(f)
        animarA(controls.target.clone().add(off), controls.target.clone(), 220)
      },
      encuadrar: () => encuadrar(camera.position.clone().sub(controls.target), true),
      redibujar: () => {
        sucio = true
      },
      lupa: (activa) => {
        L.activa = activa
        if (activa) {
          if (!L.tieneMouse) {
            L.x = L.tx = el.clientWidth / 2
            L.y = L.ty = el.clientHeight / 2
          }
          L.dentro = true
          L.luz = performance.now()
        }
        sucio = true
      },
      tamano: (k) => {
        L.tam = k
        sucio = true
      },
      aumento: (n) => {
        L.aumento = limitar(n, 1.5, 12)
        L.luz = performance.now()
        sucio = true
      },
    }

    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointermove', alMover)
      el.removeEventListener('pointerdown', alMover)
      el.removeEventListener('pointerleave', alSalir)
      el.removeEventListener('pointerenter', alMover)
      el.removeEventListener('wheel', alRueda, { capture: true })
      rt.dispose()
      lensMat.dispose()
      lensGeo.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      cache.forEach((p) => void p.then((g) => g.dispose()).catch(() => undefined))
      actuales.forEach((c) => (c.mesh.material as THREE.Material).dispose())
      renderer.dispose()
      renderer.domElement.remove()
      motor.current = null
    }
    // La escena se arma una sola vez; el resto entra por refs y los efectos de abajo.
  }, [])

  // Otra versión del caso: otro conjunto de capas.
  const claveCapas = capas.map((c) => c.url).join('|')
  useEffect(() => {
    motor.current?.cargarCapas(capas)
  }, [claveCapas]) // eslint-disable-line react-hooks/exhaustive-deps
  // Cambiar de arcada reencuadra; ocultar la prótesis no.
  useEffect(() => {
    motor.current?.aplicarVista()
    motor.current?.encuadrar()
  }, [vista])
  useEffect(() => {
    motor.current?.aplicarVista()
  }, [ocultar.join('|'), JSON.stringify(estilos)]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    motor.current?.redibujar()
  }, [notas, notaSel])
  useEffect(() => {
    motor.current?.lupa(lupa)
  }, [lupa])
  useEffect(() => {
    motor.current?.tamano(TAMANOS.find((t) => t.id === tam)?.k ?? 1)
  }, [tam])
  useEffect(() => {
    const n = notas.find((x) => x.n === notaSel)
    if (n) motor.current?.enfocar(n)
    // Solo al elegir una nota: no al agregar otra.
  }, [notaSel]) // eslint-disable-line react-hooks/exhaustive-deps

  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    const f = e.dataTransfer.files[0]
    if (f && onSoltar) onSoltar(f)
  }
  const activa = notas.find((n) => n.n === notaSel)

  return (
    <div
      ref={host}
      className={cn('relative w-full overflow-hidden border border-ln', maximizado ? 'rounded-[16px]' : 'rounded-[20px]')}
      style={{
        height: maximizado ? '100%' : alto,
        background:
          'radial-gradient(70% 55% at 50% 108%, color-mix(in srgb, var(--ac) 16%, transparent), transparent 70%), radial-gradient(60% 50% at 8% 0%, rgb(255 255 255 / .75), transparent 70%), radial-gradient(120% 95% at 50% 30%, var(--st1), var(--st2))',
        boxShadow: 'inset 0 0 60px rgb(24 32 44 / .1), inset 0 1px 0 rgb(255 255 255 / .8)',
        cursor: lupa ? 'none' : modoNota ? 'crosshair' : 'grab',
      }}
      onDragOver={(e) => {
        if (!onSoltar) return
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
    >
      {notasVisibles && notas.map((n) => {
        const on = n.n === notaSel
        return (
          <button
            key={n.n}
            ref={(b) => {
              if (b) pines.current.set(n.n, b)
              else pines.current.delete(n.n)
            }}
            type="button"
            onClick={() => onPickNota(n.n)}
            aria-label={`Nota ${n.n}: ${n.texto}`}
            aria-pressed={on}
            className="absolute z-10 grid size-[34px] place-items-center rounded-[50%_50%_50%_4px] border-[3px] border-white bg-ac text-[14px] font-bold text-acI transition-opacity"
            style={{
              display: 'none',
              transform: 'translate(-50%,-50%)',
              boxShadow: on ? '0 0 0 6px color-mix(in srgb, var(--ac) 24%, transparent), 0 6px 14px rgba(20,30,40,.25)' : '0 4px 10px rgba(20,30,40,.22)',
            }}
          >
            {n.n}
          </button>
        )
      })}

      {notasVisibles && <div
        ref={globo}
        role="note"
        className="pointer-events-none absolute z-20 grid w-[250px] gap-1 rounded-[14px] border border-ln bg-sf p-3 shadow-[0_10px_30px_rgba(20,30,40,.16)]"
        style={{ display: 'none' }}
      >
        <span className="text-[13px] text-ink2">{activa ? `Nota ${activa.n} · ${activa.autor}` : ''}</span>
        <span className="text-[15px] leading-snug">{activa?.texto}</span>
      </div>}

      {/* Ángulos de cámara */}
      <div data-no-lupa role="toolbar" aria-label="Ángulos de cámara" className="absolute top-3 right-[68px] left-3 z-30 flex cursor-default gap-0.5 overflow-x-auto rounded-[18px] border border-ln bg-sf/75 p-1 shadow-[0_1px_0_rgb(255_255_255/.8)_inset,0_10px_24px_-10px_rgba(20,30,40,.3)] backdrop-blur-md">
        {VISTAS_CAMARA.map((vc) => (
          <button key={vc.id} type="button" onClick={() => motor.current?.irA(vc.dir)} className={cn(botonVisor, 'shrink-0')}>
            {vc.label}
          </button>
        ))}
      </div>
      {/* Herramientas: cada grupo separado por una línea, con su nombre al pasar el mouse o con el foco. */}
      <div data-no-lupa role="toolbar" aria-label="Herramientas del visor" aria-orientation="vertical" className="absolute top-3 right-3 z-30 flex cursor-default flex-col rounded-[18px] border border-ln bg-sf/75 p-1 shadow-[0_1px_0_rgb(255_255_255/.8)_inset,0_10px_24px_-10px_rgba(20,30,40,.3)] backdrop-blur-md">
        <BotonHerramienta tip={lupa ? 'Guardar la lupa' : 'Lupa: mirá un detalle de cerca'} activo={lupa} onClick={() => setLupa(!lupa)}>
          <IconoLupa className="size-6" />
        </BotonHerramienta>
        <span aria-hidden className="mx-2 my-1 h-px bg-ln" />
        <BotonHerramienta tip="Acercar" onClick={() => motor.current?.zoom(0.7)}>
          <Plus aria-hidden className="size-5" />
        </BotonHerramienta>
        <BotonHerramienta tip="Alejar" onClick={() => motor.current?.zoom(1.4)}>
          <Minus aria-hidden className="size-5" />
        </BotonHerramienta>
        <span aria-hidden className="mx-2 my-1 h-px bg-ln" />
        <BotonHerramienta tip="Vista inicial: ver todo" onClick={() => motor.current?.encuadrar()}>
          <House aria-hidden className="size-5" />
        </BotonHerramienta>
        {(onToggleNotas || onTogglePanel) && <span aria-hidden className="mx-2 my-1 h-px bg-ln" />}
        {onToggleNotas && (
          <BotonHerramienta tip={notasVisibles ? 'Ocultar notas' : 'Mostrar notas'} activo={!notasVisibles} onClick={onToggleNotas}>
            {notasVisibles ? <MapPin aria-hidden className="size-5" /> : <MapPinOff aria-hidden className="size-5" />}
          </BotonHerramienta>
        )}
        {onTogglePanel && (
          <BotonHerramienta tip={panelVisible ? 'Ocultar panel lateral' : 'Mostrar panel lateral'} activo={!panelVisible} onClick={onTogglePanel}>
            {panelVisible ? <PanelRightClose aria-hidden className="size-5" /> : <PanelRightOpen aria-hidden className="size-5" />}
          </BotonHerramienta>
        )}
        {onToggleMax && (
          <>
            <span aria-hidden className="mx-2 my-1 h-px bg-ln" />
            <BotonHerramienta tip={maximizado ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'} activo={maximizado} onClick={onToggleMax}>
              {maximizado ? <Minimize2 aria-hidden className="size-5" /> : <Maximize2 aria-hidden className="size-5" />}
            </BotonHerramienta>
          </>
        )}
      </div>

      {lupa && (
        <div data-no-lupa role="group" aria-label="Ajustes de la lupa" className="absolute top-[68px] left-3 z-30 grid max-w-[calc(100%-84px)] cursor-default gap-1.5 rounded-[20px] border border-ln bg-sf/85 p-2 shadow-[0_10px_22px_-10px_rgba(20,30,40,.35)] backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-1">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-b from-[color-mix(in_srgb,var(--ac)_80%,white)] to-ac text-acI">
              <IconoLupa className="size-4.5" />
            </span>
            <span className="px-1 text-[12px] font-semibold text-ink2">Potencia</span>
            {AUMENTOS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={Math.round(aumento) === n}
                onClick={() => {
                  setAumento(n)
                  motor.current?.aumento(n)
                }}
                className="chip min-h-9 min-w-11 rounded-full px-2.5 font-mono text-[13px] font-semibold"
              >
                ×{n}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-8" />
            <span className="px-1 text-[12px] font-semibold text-ink2">Tamaño</span>
            {TAMANOS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tam === t.id} onClick={() => setTam(t.id)} className="chip min-h-9 rounded-full px-3 text-[13px] font-semibold">
                {t.label}
              </button>
            ))}
          </div>
          <span className="hidden px-1 text-[12px] text-ink2 sm:block">
            Rueda = potencia · <kbd className="font-mono">Shift</kbd> + rueda = zoom
          </span>
        </div>
      )}
      {modoNota && (
        <span className="pointer-events-none absolute top-[72px] left-1/2 z-30 -translate-x-1/2 rounded-full bg-ac px-3.5 py-2 text-[14px] font-semibold whitespace-nowrap text-acI">
          {lupa ? 'Tocá con la lupa donde va la nota' : 'Tocá el escaneo donde va la nota'}
        </span>
      )}
      {/* La lupa física: el cristal es transparente y debajo está el canvas con el escaneo ampliado. */}
      <CuerpoLupa refs={{ raiz: lupaRaiz, giro: lupaGiro, barrido: lupaBarrido, lectura: lupaLectura }} estilo={{ display: 'none' }} lectura="×3,0" />
      {cargando && !error && (
        <span role="status" className="pointer-events-none absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ln bg-sf px-4 py-2 text-[14px] font-medium text-ink2 shadow-[0_4px_14px_rgba(20,30,40,.10)]">
          Cargando el escaneo…
        </span>
      )}
      {error && (
        <p role="alert" className="absolute inset-x-6 top-1/2 z-30 m-0 -translate-y-1/2 rounded-[14px] border border-ba bg-baS p-3 text-center font-medium text-ba">
          {error}
        </p>
      )}
      {arrastrando && (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-[16px] border-2 border-dashed border-ac bg-acS/85 p-4 text-center text-[17px] font-semibold text-acT">
          Soltá el STL, PLY u OBJ para guardarlo como una versión nueva
        </div>
      )}

      <span aria-hidden className="pointer-events-none absolute bottom-3 left-4 max-w-[40%] text-[12px] leading-tight text-ink2">{lupa ? 'Arrastrá: girar · Rueda: potencia de la lupa · Clic derecho: mover' : 'Arrastrá: girar · Rueda: zoom · Clic derecho: mover'}</span>
      <span className="pointer-events-none absolute right-4 bottom-3 max-w-[55%] text-right text-[13px] leading-tight text-ink2">{info}</span>
    </div>
  )
}

/** Botón del visor con su nombre visible al pasar el mouse o con el foco del teclado. */
function BotonHerramienta({ tip, activo = false, onClick, children }: { tip: string; activo?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={tip}
      aria-pressed={activo || undefined}
      data-tip={tip}
      onClick={onClick}
      className={cn(
        botonVisor,
        'relative size-11 px-0',
        'after:pointer-events-none after:absolute after:top-1/2 after:right-full after:mr-2 after:-translate-y-1/2 after:rounded-[8px] after:bg-ink after:px-2 after:py-1 after:text-[12px] after:font-medium after:whitespace-nowrap after:text-bg after:opacity-0 after:transition-opacity after:content-[attr(data-tip)] hover:after:opacity-100 focus-visible:after:opacity-100',
        activo && 'bg-acS text-acT',
      )}
    >
      {children}
    </button>
  )
}
