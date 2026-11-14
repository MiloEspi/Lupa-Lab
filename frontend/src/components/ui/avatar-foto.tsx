import { cn } from '../../lib/utils'

const COLORES: Record<string, string> = { AN: '#DCE6F7', DP: '#F3E3C8', NI: '#E5DDF3', MA: '#F2DCD2', SO: '#D6EBDF', LA: '#F1D9E0' }

export function Avatar({ ini, className }: { ini: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('display inline-grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-bold text-[#18202C] shadow-[inset_0_1px_0_rgb(255_255_255/.7),0_6px_12px_-6px_rgb(24_32_44/.45),0_0_0_2px_rgb(255_255_255/.7)]', className)}
      style={{ background: `radial-gradient(circle at 30% 25%, #fff8, transparent 55%), ${COLORES[ini] ?? '#E9E7E1'}` }}
    >
      {ini}
    </span>
  )
}

/** Fondos de ejemplo para las fotos del avance (no hay fotos reales en el prototipo). */
export const FONDOS_FOTO = {
  orden: 'linear-gradient(135deg, #ECE8DF, #D9D3C7)',
  diseno: 'radial-gradient(circle at 45% 45%, #CFE3F6, #8DB2D6 55%, #5C7FA6)',
  fres1: 'radial-gradient(circle at 50% 55%, #FFFDF8 0 22%, #CFC8BC 23% 31%, #EDEAE4 32%)',
  fres2: 'radial-gradient(circle at 45% 50%, #FBF8F2 0 26%, #C4BCAE 27% 35%, #E6E2DA 36%)',
}

/** Una foto: de ejemplo (solo `bg`) o una que se subió de verdad (`src`, una dirección local del navegador). */
export type FotoData = { nombre: string; bg: string; src?: string }

/**
 * Miniatura de una foto. Si se le pasa `onAbrir` es un botón que la abre en grande; si no, es solo una imagen.
 */
export function Foto({ nombre, bg, src, className, onAbrir }: FotoData & { className?: string; onAbrir?: () => void }) {
  const base = cn('relative flex items-end overflow-hidden rounded-[14px] border border-ln p-2 text-left', className)
  const contenido = (
    <>
      {src && <img src={src} alt="" className="absolute inset-0 size-full object-cover" />}
      <span className="relative max-w-full truncate rounded-full bg-white/90 px-2 py-0.5 text-[12px] text-[#18202C]">{nombre}</span>
    </>
  )
  return onAbrir ? (
    <button type="button" aria-label={`Ver la foto ${nombre} en grande`} onClick={onAbrir} className={cn(base, 'cursor-zoom-in transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-12px_rgb(24_32_44/.5)]')} style={{ background: bg }}>
      {contenido}
    </button>
  ) : (
    <div role="img" aria-label={`Foto ${nombre}`} className={base} style={{ background: bg }}>
      {contenido}
    </div>
  )
}
