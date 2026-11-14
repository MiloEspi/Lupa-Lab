import { X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { cn } from '../../lib/utils'

export const SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map(String)
export const INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map(String)
const TODAS = new Set([...SUPERIOR, ...INFERIOR])

/** Saca las piezas FDI válidas de un texto libre: "21, 22 y 23" -> ['21','22','23']. */
export const leerPiezas = (texto: string) => [...new Set((texto.match(/\b[1-4][1-8]\b/g) ?? []).filter((n) => TODAS.has(n)))]

/**
 * Selector de piezas FDI. Al pasar el mouse (o el dedo) por una fila, las piezas cercanas se agrandan
 * como una lupa, igual que el odontograma de Lupa Dental: apuntar es fácil aunque haya 16 botones.
 */
export function SelectorPiezas({
  seleccion,
  onToggle,
  onCambiar,
  multiple,
}: {
  seleccion: string[]
  onToggle: (n: string) => void
  onCambiar: (piezas: string[]) => void
  multiple: boolean
}) {
  const [texto, setTexto] = useState('')
  const botones = useRef(new Map<string, HTMLButtonElement>())

  const lupa = (e: PointerEvent<HTMLDivElement>, piezas: string[]) => {
    piezas.forEach((n) => {
      const b = botones.current.get(n)
      if (!b) return
      const r = b.getBoundingClientRect()
      const d = Math.abs(e.clientX - (r.left + r.width / 2))
      const s = 1 + 0.72 * Math.exp(-(d * d) / (2 * 30 * 30))
      b.style.transform = `scale(${s.toFixed(3)})`
      b.style.zIndex = String(Math.round(s * 10))
    })
  }
  const soltar = (piezas: string[]) =>
    piezas.forEach((n) => {
      const b = botones.current.get(n)
      if (b) {
        b.style.transform = ''
        b.style.zIndex = ''
      }
    })

  const fila = (piezas: string[], etiquetas: [string, string], arriba: boolean) => (
    <div className="grid gap-1.5">
      {arriba && (
        <div className="grid grid-cols-2 gap-3 font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">
          <span className="text-center">{etiquetas[0]}</span>
          <span className="text-center">{etiquetas[1]}</span>
        </div>
      )}
      <div
        className="grid grid-cols-[repeat(8,minmax(0,1fr))_14px_repeat(8,minmax(0,1fr))] gap-1.5 py-2"
        onPointerMove={(e) => lupa(e, piezas)}
        onPointerLeave={() => soltar(piezas)}
        onPointerCancel={() => soltar(piezas)}
      >
        {piezas.map((n, i) => (
          <span key={n} className="contents">
            {i === 8 && <span aria-hidden className="mx-auto h-full w-px bg-gradient-to-b from-transparent via-ctl/50 to-transparent" />}
            <button
              ref={(b) => {
                if (b) botones.current.set(n, b)
                else botones.current.delete(n)
              }}
              type="button"
              aria-pressed={seleccion.includes(n)}
              aria-label={`Pieza ${n}`}
              onClick={() => onToggle(n)}
              className="pieza min-h-11 font-mono text-[13px] font-semibold"
            >
              {n}
            </button>
          </span>
        ))}
      </div>
      {!arriba && (
        <div className="grid grid-cols-2 gap-3 font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">
          <span className="text-center">{etiquetas[0]}</span>
          <span className="text-center">{etiquetas[1]}</span>
        </div>
      )}
    </div>
  )

  return (
    <div className="grid gap-3">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <span className="text-[14px] text-ink2">{seleccion.length ? (multiple ? 'Piezas:' : 'Pieza:') : 'Ninguna pieza elegida. Tocá los dientes que alcanza el trabajo.'}</span>
        {seleccion.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onToggle(n)}
            aria-label={`Quitar la pieza ${n}`}
            className="chip inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-mono text-[14px] font-semibold"
            aria-pressed
          >
            {n}
            <X aria-hidden className="size-3.5" />
          </button>
        ))}
        {seleccion.length > 0 && (
          <button type="button" onClick={() => onCambiar([])} className="ml-auto min-h-9 rounded-[10px] px-2 text-[13px] font-medium text-acT hover:bg-acS">
            Limpiar
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-[20px] border border-ln bg-[radial-gradient(90%_100%_at_50%_0%,color-mix(in_srgb,var(--sf)_70%,transparent),transparent),linear-gradient(180deg,color-mix(in_srgb,var(--bg2)_70%,var(--sf)),color-mix(in_srgb,var(--bg2)_90%,var(--sf)))] p-3 shadow-[inset_0_2px_10px_rgb(24_32_44/.08),0_1px_0_rgb(255_255_255/.8)]">
        <div role="group" aria-label="Piezas dentales" className="grid min-w-[600px] gap-1">
          {fila(SUPERIOR, ['1 · Superior derecho', '2 · Superior izquierdo'], true)}
          <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-ctl/50 to-transparent" />
          {fila(INFERIOR, ['4 · Inferior derecho', '3 · Inferior izquierdo'], false)}
        </div>
      </div>

      <label className={cn('flex items-center gap-3 text-[14px] text-ink2')}>
        <span className="shrink-0">O escribilas</span>
        <input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            const n = leerPiezas(e.target.value)
            onCambiar(multiple ? n : n.slice(0, 1))
          }}
          placeholder="21, 22, 23"
          inputMode="numeric"
          className="campo min-h-11 min-w-0 flex-1 px-3.5 font-mono text-[15px]"
        />
      </label>
    </div>
  )
}
