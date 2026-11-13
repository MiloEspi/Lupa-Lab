/**
 * Cliente de la API con los tipos generados del esquema OpenAPI (`npm run api`).
 * Si el backend cambia un campo, `tsc` marca acá el error en vez de romperse en uso.
 */
import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './esquema'

export type Esquemas = components['schemas']
export type Yo = Esquemas['Yo']

function leerCookie(nombre: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nombre}=`))
    ?.split('=')[1]
}

// Django exige el token CSRF en todo pedido que cambia algo, porque la sesión va en cookie.
const conCsrf: Middleware = {
  onRequest({ request }) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const token = leerCookie('csrftoken')
      if (token) request.headers.set('X-CSRFToken', decodeURIComponent(token))
    }
    return request
  },
}

export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use(conCsrf)

export class ErrorApi extends Error {
  estado: number
  campos: Record<string, string[]>

  constructor(estado: number, cuerpo: unknown) {
    const { mensaje, campos } = leerError(cuerpo)
    super(mensaje)
    this.estado = estado
    this.campos = campos
  }
}

/** DRF contesta `{detail: "..."}` o `{campo: ["..."]}`: lo pasamos a un mensaje y errores por campo. */
function leerError(cuerpo: unknown) {
  const campos: Record<string, string[]> = {}
  let mensaje = 'Algo salió mal. Probá de nuevo en un rato.'
  if (cuerpo && typeof cuerpo === 'object') {
    for (const [clave, valor] of Object.entries(cuerpo)) {
      const lista = Array.isArray(valor) ? valor.map(String) : [String(valor)]
      if (clave === 'detail' || clave === 'non_field_errors') mensaje = lista[0]
      else campos[clave] = lista
    }
    const primero = Object.values(campos)[0]?.[0]
    if (primero && !('detail' in cuerpo)) mensaje = primero
  }
  return { mensaje, campos }
}

/** Desenvuelve la respuesta de openapi-fetch: devuelve los datos o tira un ErrorApi. */
export async function pedir<T>(promesa: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await promesa
  if (!response.ok) throw new ErrorApi(response.status, error)
  return data as T
}

/** Pide la cookie CSRF una vez al arrancar, antes del primer POST (el ingreso). */
export const prepararCsrf = () => fetch('/api/auth/csrf', { credentials: 'same-origin' })
