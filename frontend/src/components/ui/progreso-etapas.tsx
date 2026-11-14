import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils'

/**
 * Un tramo por etapa del caso: los hechos se llenan en cadena, el actual late (en ámbar si está frenado).
 * El estado va también en texto (aria-label y rótulo), no solo en color.
 * Las etapas vienen de la ruta congelada de cada trabajo (no son fijas: cada familia tiene la suya).
 * `etapa` = índice de la actual; igual al largo de la lista cuando el trabajo pasó por todas.
 */
export function ProgresoEtapas({ etapas, etapa, frenado = false, rotulo = true, className }: { etapas: string[]; etapa: number; frenado?: boolean; rotulo?: boolean; className?: string }) {
  const terminado = etapa >= etapas.length
  const nombre = terminado ? 'Terminado' : etapas[etapa]
  return (
    <div role="img" aria-label={`Etapa ${Math.min(etapa + 1, etapas.length)} de ${etapas.length}: ${nombre}${frenado ? ', frenado' : ''}`} className={cn('grid gap-1.5', className)}>
      <div aria-hidden className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(etapas.length, 1)}, minmax(0, 1fr))` }}>
        {etapas.map((e, i) => (
          <span key={`${e}-${i}`} className="seg" data-estado={i < etapa ? 'hecha' : i === etapa ? 'actual' : 'pendiente'} data-frenado={i === etapa && frenado} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      {rotulo && (
        <span aria-hidden className="flex items-baseline justify-between gap-2 text-[13.5px]">
          <span className={cn('font-semibold', frenado ? 'text-wa' : 'text-ink')}>{nombre}</span>
          <span className="font-mono text-[11.5px] text-ink3">
            {Math.min(etapa + 1, etapas.length)}/{etapas.length}
          </span>
        </span>
      )}
    </div>
  )
}
