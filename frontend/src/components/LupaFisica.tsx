import { useId, type CSSProperties, type ReactNode, type Ref } from 'react'
import { cn } from '../lib/utils'

/** Radio exterior de la lupa en px (aro incluido) y radio del cristal (lo que se ve a través). */
export const R_LUPA = 96
export const R_CRISTAL = 86

export type RefsLupa = {
  raiz?: Ref<HTMLDivElement>
  giro?: Ref<HTMLDivElement>
  barrido?: Ref<HTMLDivElement>
  lectura?: Ref<HTMLDivElement>
}

/**
 * Lupa física, solo dibujo: sombra proyectada, mango de grafito con virola de acero y una banda
 * del color de la marca, aro metálico con bisel, cristal con reflejos y un barrido de luz.
 * Quien la usa mueve `raiz` y gira `giro` (el mango); lo que se ve dentro del cristal va como `children`
 * (en el visor 3D el cristal es transparente y el dibujo del escaneo ampliado va debajo, en el canvas).
 */
export function CuerpoLupa({ refs = {}, children, lectura = '×3,0', estilo, className }: { refs?: RefsLupa; children?: ReactNode; lectura?: string; estilo?: CSSProperties; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <div ref={refs.raiz} aria-hidden className={cn('lupa', className)} style={{ width: R_LUPA * 2, height: R_LUPA * 2, ...estilo }}>
      <div className="lupa-sombra" />

      <div ref={refs.giro} className="lupa-giro">
        <svg className="lupa-mango" width="206" height="44" viewBox="0 0 206 44">
          <defs>
            <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6f8fa" />
              <stop offset=".35" stopColor="#a4adb8" />
              <stop offset=".55" stopColor="#eef1f4" />
              <stop offset="1" stopColor="#68727e" />
            </linearGradient>
            <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6d7886" />
              <stop offset=".38" stopColor="#38414d" />
              <stop offset="1" stopColor="#12171d" />
            </linearGradient>
            <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity=".34" />
              <stop offset=".45" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity=".38" />
            </linearGradient>
            <clipPath id={`${id}c`}>
              <path d="M40 5 C 72 3 134 1 184 4 Q 205 6 205 22 Q 205 38 184 40 C 134 43 72 41 40 39 Z" />
            </clipPath>
          </defs>
          {/* Virola de acero: la pieza que une el aro con el mango */}
          <path d="M0 9 C 12 7 28 5 44 4 L 44 40 C 28 39 12 37 0 35 Z" fill={`url(#${id}a)`} />
          <path d="M14 7 V37 M28 5.5 V38.5" stroke="#000" strokeOpacity=".28" strokeWidth="1.4" />
          <path d="M15.2 7 V37 M29.2 5.5 V38.5" stroke="#fff" strokeOpacity=".7" strokeWidth="1" />
          {/* Empuñadura */}
          <path d="M40 5 C 72 3 134 1 184 4 Q 205 6 205 22 Q 205 38 184 40 C 134 43 72 41 40 39 Z" fill={`url(#${id}g)`} />
          <g clipPath={`url(#${id}c)`}>
            <rect x="98" y="0" width="12" height="44" style={{ fill: 'var(--ac)' }} />
            <rect x="98" y="0" width="12" height="44" fill="#fff" opacity=".12" transform="translate(0 0)" />
            {[132, 141, 150, 159, 168].map((x) => (
              <g key={x}>
                <path d={`M${x} 3 V41`} stroke="#000" strokeOpacity=".4" strokeWidth="1.6" />
                <path d={`M${x + 1.4} 3 V41`} stroke="#fff" strokeOpacity=".16" strokeWidth="1" />
              </g>
            ))}
            <rect x="40" y="0" width="170" height="44" fill={`url(#${id}s)`} />
          </g>
          <path d="M50 9 C 86 6 136 5 188 8" stroke="#fff" strokeOpacity=".3" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
      </div>

      <div className="lupa-aro-sombra">
        <div className="lupa-aro" />
      </div>
      <div className="lupa-aro-brillo" />
      <div className="lupa-bisel" />

      <div className="lupa-cristal">
        {children}
        <div ref={refs.barrido} className="lupa-barrido-envuelto">
          <div className="lupa-barrido" />
        </div>
        <svg className="pointer-events-none absolute inset-0" viewBox="0 0 172 172" width="100%" height="100%">
          <defs>
            <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity=".95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}f`}>
              <feGaussianBlur stdDeviation=".9" />
            </filter>
          </defs>
          {/* Un solo reflejo fino pegado al borde, para que se lea como cristal sin tapar lo que hay debajo */}
          <path d="M20 76 A68 68 0 0 1 70 22" stroke={`url(#${id}r)`} strokeWidth="4" strokeLinecap="round" fill="none" filter={`url(#${id}f)`} opacity=".5" />
        </svg>
        <span className="lupa-mira" />
      </div>

      <div ref={refs.lectura} className="lupa-lectura" style={{ opacity: 0 }}>
        {lectura}
      </div>
    </div>
  )
}
