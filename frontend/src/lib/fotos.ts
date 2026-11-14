import type { FotoData } from '../components/ui/avatar-foto'

/** Convierte una foto elegida (o sacada con la cámara del celular) en algo que se puede mostrar. Queda en el navegador: el backend viene en la Etapa 1. */
export function fotoDeArchivo(f: File): FotoData {
  return { nombre: f.name, bg: '#E9E7E1', src: URL.createObjectURL(f) }
}

export const esImagen = (f: File) => f.type.startsWith('image/')
