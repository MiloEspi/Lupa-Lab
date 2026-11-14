import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cn } from '../../lib/utils'

const sinMovimiento = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Chispas: posiciones fijas (en %) para que no cambien entre renders. Cada una titila en su propio tiempo.
const CHISPAS: [number, number][] = [[12, 22], [28, 72], [46, 16], [63, 62], [78, 24], [90, 74], [7, 82], [55, 90], [96, 14]]

/**
 * Campo de luz: una malla de puntos con una zona que se enciende y viaja sola, más chispas que
 * titilan. Se pone como primer hijo de una tarjeta (la tarjeta tiene que ser `relative` y tener
 * borde redondeado: el campo lo copia). Si el mouse pasa por la tarjeta, la luz lo sigue.
 */
export function CampoLuz({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const padre = el?.parentElement
    if (!el || !padre) return
    let volver: ReturnType<typeof setTimeout> | undefined
    const mover = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch') return
      clearTimeout(volver)
      const r = padre.getBoundingClientRect()
      el.dataset.sigue = 'true'
      el.style.setProperty('--luz-x', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
      el.style.setProperty('--luz-y', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
    }
    // Al salir, la luz planea hasta donde arranca su recorrido y recién ahí retoma el viaje solo.
    const salir = () => {
      el.style.setProperty('--luz-x', '12%')
      el.style.setProperty('--luz-y', '28%')
      volver = setTimeout(() => {
        el.dataset.sigue = 'false'
        el.style.removeProperty('--luz-x')
        el.style.removeProperty('--luz-y')
      }, 600)
    }
    padre.addEventListener('pointermove', mover)
    padre.addEventListener('pointerleave', salir)
    return () => {
      clearTimeout(volver)
      padre.removeEventListener('pointermove', mover)
      padre.removeEventListener('pointerleave', salir)
    }
  }, [])

  return (
    <div ref={ref} aria-hidden className={cn('campo-luz', className)}>
      <div className="cl-base" />
      <div className="cl-aura" />
      <div className="cl-encendido" />
      {CHISPAS.map(([x, y], i) => (
        <i key={i} className="cl-chispa" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 0.9) % 4.2}s`, animationDuration: `${3.4 + (i % 4) * 0.7}s` }} />
      ))}
    </div>
  )
}

/** Hace que una tarjeta con `lamina-viva` encienda el borde y el brillo donde está el mouse. */
export const luzPuntero = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

const letraAlAzar = (ch: string) => {
  if (/\d/.test(ch)) return String(Math.floor(Math.random() * 10))
  if (/[a-z]/.test(ch)) return String.fromCharCode(97 + Math.floor(Math.random() * 26))
  if (/[A-Z]/.test(ch)) return String.fromCharCode(65 + Math.floor(Math.random() * 26))
  return ch
}

/**
 * El código del caso (o un título corto) en grande y "vivo": el "OC-" en un tono de acento y el número
 * con el degradado de siempre que cambia de color despacio, grano mate y un reflejo satinado que lo
 * cruza; detrás, un aura tenue, un carril de luz abajo y esquinas de mira. Al aparecer o cambiar se
 * descifra de izquierda a derecha. Para lectores de pantalla es el texto de siempre; con movimiento
 * reducido, no hay efectos.
 */
export function CodigoVivo({ prefijo = '', numero, className }: { prefijo?: string; numero: string; className?: string }) {
  const [visto, setVisto] = useState(numero)

  useEffect(() => {
    if (sinMovimiento()) return
    let paso = 0
    const total = 16
    const id = setInterval(() => {
      paso++
      const fijos = Math.floor((paso / total) * numero.length)
      setVisto(numero.split('').map((ch, i) => (i < fijos ? ch : letraAlAzar(ch))).join(''))
      if (paso >= total) {
        clearInterval(id)
        setVisto(numero)
      }
    }, 48)
    return () => clearInterval(id)
  }, [numero])

  return (
    <span className={cn('codigo-vivo display', className)}>
      <span className="sr-only">
        {prefijo}
        {numero}
      </span>
      <span aria-hidden className="inline-flex items-baseline gap-[.06em]">
        {prefijo && <span className="codigo-vivo__prefijo">{prefijo}</span>}
        <span className="codigo-vivo__num">{visto}</span>
      </span>
      <i aria-hidden className="codigo-vivo__carril" />
      {[1, 2, 3, 4].map((p) => (
        <i key={p} aria-hidden className="codigo-vivo__esq" data-p={p} />
      ))}
    </span>
  )
}
