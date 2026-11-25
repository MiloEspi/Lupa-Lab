/**
 * Lo que dice el QR de la caja: la dirección de producción del caso, con su id opaco (nunca
 * el número ni datos del paciente). Escanearlo no da acceso por sí solo: hay que tener sesión.
 */
export const urlDeCaja = (casoId: string) => `${location.origin}/p/${casoId}`

/** Saca el id del caso de lo que leyó la cámara. `null` si el QR no es de una caja de acá. */
export function casoDeQR(texto: string): string | null {
  const m = texto.match(/\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)
  return m ? m[1]!.toLowerCase() : null
}
