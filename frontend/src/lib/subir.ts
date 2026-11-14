/**
 * Sube un archivo a un caso en los dos pasos que pide el backend (S8): pedir la URL firmada
 * declarando tamaño y SHA-256, subirlo directo (a R2 en producción) y avisar que terminó.
 */
import { api, ErrorApi, pedir, type Esquemas } from '../api/cliente'

export type TipoArchivo = Esquemas['TipoArchivo']

export async function sha256(archivo: File) {
  const digest = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function csrf() {
  const valor = document.cookie.split('; ').find((c) => c.startsWith('csrftoken='))?.split('=')[1]
  return valor ? decodeURIComponent(valor) : ''
}

export async function subirArchivo(caso: string, archivo: File, datos: { tipo: TipoArchivo; categoria?: string; comentario?: string }) {
  const { archivo: registro, subida } = await pedir(
    api.POST('/api/casos/{id}/archivos', {
      params: { path: { id: caso } },
      body: { categoria: '', comentario: '', ...datos, nombre: archivo.name, tamano: archivo.size, sha256: await sha256(archivo) },
    }),
  )
  // En desarrollo la URL es del mismo servidor (pide sesión y CSRF); en producción es de R2 y no lleva cookies.
  const propia = subida.url.startsWith('/')
  const respuesta = await fetch(subida.url, {
    method: subida.metodo,
    body: archivo,
    headers: { ...subida.encabezados, ...(propia ? { 'X-CSRFToken': csrf() } : {}) },
    credentials: propia ? 'same-origin' : 'omit',
  })
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, { detail: `No se pudo subir ${archivo.name}.` })
  return pedir(api.POST('/api/casos/{id}/archivos/{archivo}/confirmar', { params: { path: { id: caso, archivo: registro.id } } }))
}
