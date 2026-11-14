import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { FotoData } from './avatar-foto'

/** Foto en grande sobre un fondo oscuro. Se cierra con Esc, con un clic afuera o con el botón. */
export function Lightbox({ foto, onClose }: { foto: FotoData | null; onClose: () => void }) {
  const cerrar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!foto) return
    cerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = antes
    }
  }, [foto, onClose])
  if (!foto) return null
  return (
    <div role="dialog" aria-modal="true" aria-label={`Foto ${foto.nombre}`} onClick={onClose} className="fixed inset-0 z-[60] grid place-items-center bg-[rgb(10_16_26/.78)] p-4 backdrop-blur-sm sm:p-8">
      <figure onClick={(e) => e.stopPropagation()} className="m-0 grid max-h-full max-w-full gap-3">
        {foto.src ? (
          <img src={foto.src} alt={foto.nombre} className="max-h-[80vh] max-w-full rounded-[18px] object-contain shadow-[0_30px_80px_-20px_rgb(0_0_0/.7)]" />
        ) : (
          <div role="img" aria-label={foto.nombre} className="h-[min(70vh,640px)] w-[min(88vw,960px)] rounded-[18px] shadow-[0_30px_80px_-20px_rgb(0_0_0/.7)]" style={{ background: foto.bg }} />
        )}
        <figcaption className="flex items-center justify-between gap-3 text-[14px] text-white/90">
          <span className="truncate font-mono text-[12.5px]">{foto.nombre}</span>
          <button ref={cerrar} type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 font-semibold text-white transition hover:bg-white/25">
            <X aria-hidden className="size-4" />
            Cerrar
          </button>
        </figcaption>
      </figure>
    </div>
  )
}
