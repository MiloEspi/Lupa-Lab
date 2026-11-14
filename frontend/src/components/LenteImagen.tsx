import { useRef, useState, type PointerEvent } from 'react'
import { cn } from '../lib/utils'
import { CuerpoLupa, R_CRISTAL, R_LUPA } from './LupaFisica'

const ZOOMS = [2, 3, 4]

/**
 * Foto de un papel (la orden manuscrita) con la misma lupa física del visor 3D: se pasa por encima y
 * lo que hay debajo del cristal se ve ampliado. Sirve para leer la letra del odontólogo y transcribirla
 * sin hacer zoom a toda la imagen.
 */
export function LenteImagen({ src, alt, className, altoMax = 420 }: { src: string; alt: string; className?: string; altoMax?: number }) {
  const caja = useRef<HTMLDivElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const giro = useRef<HTMLDivElement>(null)
  const dentro = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(3)
  const [activa, setActiva] = useState(false)

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const c = caja.current
    const r = raiz.current
    const d = dentro.current
    if (!c || !r || !d) return
    const b = c.getBoundingClientRect()
    const x = e.clientX - b.left
    const y = e.clientY - b.top
    r.style.transform = `translate3d(${x - R_LUPA}px, ${y - R_LUPA}px, 0)`
    d.style.backgroundSize = `${b.width * zoom}px ${b.height * zoom}px`
    d.style.backgroundPosition = `${-(x * zoom - R_CRISTAL)}px ${-(y * zoom - R_CRISTAL)}px`
    if (giro.current) giro.current.style.transform = `rotate(${x > b.width * 0.6 ? 140 : 40}deg)`
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <div
        ref={caja}
        className="relative overflow-hidden rounded-[16px] border border-ln bg-bg2 shadow-[inset_0_2px_8px_rgb(24_32_44/.12)]"
        style={{ cursor: activa ? 'none' : 'zoom-in', maxHeight: altoMax }}
        onPointerEnter={() => setActiva(true)}
        onPointerLeave={() => setActiva(false)}
        onPointerMove={mover}
      >
        <img src={src} alt={alt} className="block w-full select-none" draggable={false} />
        <div style={{ opacity: activa ? 1 : 0, transition: 'opacity .2s' }} className="pointer-events-none absolute inset-0">
          <CuerpoLupa refs={{ raiz, giro }} lectura={`×${zoom}`} className="!z-10">
            <div ref={dentro} className="absolute inset-0" style={{ backgroundImage: `url("${src}")`, backgroundRepeat: 'no-repeat', backgroundColor: '#f7f4ec' }} />
          </CuerpoLupa>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink2">
        <span>Pasá la lupa por la orden:</span>
        {ZOOMS.map((z) => (
          <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)} className="chip min-h-9 rounded-full px-3 font-mono text-[13px] font-semibold">
            ×{z}
          </button>
        ))}
      </div>
    </div>
  )
}
