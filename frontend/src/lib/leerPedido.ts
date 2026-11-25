/**
 * Lee un WhatsApp o un mail pegado y arma un BORRADOR de pedido.
 *
 * En el prototipo son reglas simples (expresiones regulares). En el producto lo hace la IA, pero
 * el principio es el mismo: la máquina propone, reglas fijas validan (pieza FDI válida, color de la
 * guía) y una persona confirma. Nada se da por cierto sin que recepción lo vea.
 */

export const VITA = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4'] as const

export const esPiezaFDI = (p: string) => /^[1-4][1-8]$/.test(p)

export type Lectura = {
  odontologo?: string
  paciente?: string
  trabajo?: string
  material?: string
  soporte?: 'munon' | 'implante'
  implante?: { marca?: string; diametro?: string; conexion?: string }
  piezas?: string[]
  color?: string
  dia?: string
  /** Avisos para que la persona revise (ej.: un número que no es pieza FDI). */
  dudas: string[]
}

const DIAS = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes']
const MARCAS = ['Nobel', 'Straumann', 'Neodent', 'BioHorizons', 'Zimmer', 'MIS', 'Osstem', 'Rosterdent']

export function leerPedido(texto: string, odontologos: { id: string; claves: string[] }[]): Lectura {
  const t = texto.normalize('NFC')
  const bajo = t.toLowerCase()
  const r: Lectura = { dudas: [] }

  const od = odontologos.find((o) => o.claves.some((c) => bajo.includes(c)))
  if (od) r.odontologo = od.id

  // Iniciales del paciente: "de J. G.", "paciente J.G."
  const pac = /(?:[Pp]aciente|de|para)\s+([A-ZÁÉÍÓÚÑ]\.\s?[A-ZÁÉÍÓÚÑ]\.)/.exec(t)
  if (pac) r.paciente = pac[1].replace(/\.\s?/g, '. ').trim()

  if (/implante/.test(bajo)) r.soporte = 'implante'
  else if (/mu[ñn][oó]n|tallad/.test(bajo)) r.soporte = 'munon'

  if (/carilla/.test(bajo)) r.trabajo = 'carilla'
  else if (/incrustaci|inlay|onlay/.test(bajo)) r.trabajo = 'incrustacion'
  else if (/puente/.test(bajo)) r.trabajo = 'puente'
  else if (/placa/.test(bajo)) r.trabajo = 'placa'
  else if (/corona/.test(bajo)) r.trabajo = 'corona'

  if (/zirconi/.test(bajo)) r.material = 'Zirconio'
  else if (/disilicato|e\.?max/.test(bajo)) r.material = 'Disilicato'
  else if (/metalo|metal-?cer|\bmc\b/.test(bajo)) r.material = 'Metalocerámica'

  // Piezas: números de dos cifras; las que no son FDI válidas quedan como duda, no se cargan.
  // Antes se sacan fechas, horas y la cabecera de WhatsApp ("[13/11 10:01]"): si no, "13/11" se
  // leería como las piezas 13 y 11.
  const sinFechas = t
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b\d+[.,]\d+\s?mm\b/gi, ' ')
  const nums = [...sinFechas.matchAll(/(?:pieza|pza\.?|diente|la|el|\b)\s?(\d{2})\b/gi)].map((m) => m[1])
  const piezas = [...new Set(nums.filter(esPiezaFDI))]
  const raras = [...new Set(nums.filter((n) => !esPiezaFDI(n) && Number(n) > 10 && Number(n) < 90))]
  if (piezas.length) r.piezas = piezas
  if (piezas.length > 1 && r.trabajo !== 'puente') r.dudas.push(`Hay ${piezas.length} piezas (${piezas.join(', ')}): ¿son trabajos separados o un puente?`)
  raras.forEach((n) => r.dudas.push(`"${n}" no es una pieza FDI válida`))

  const col = /\b([ABCD])\s?([1-4](?:[.,]5)?)\b/i.exec(t)
  if (col) {
    const c = `${col[1].toUpperCase()}${col[2].replace(',', '.')}`
    if ((VITA as readonly string[]).includes(c)) r.color = c
    else r.dudas.push(`"${c}" no está en la guía Vita clásica`)
  }

  const dia = DIAS.find((d) => bajo.includes(d))
  if (dia) r.dia = dia.replace('miercoles', 'miércoles')

  if (r.soporte === 'implante') {
    const marca = MARCAS.find((m) => bajo.includes(m.toLowerCase()))
    const diam = /(\d[.,]\d)\s?mm/.exec(t)
    const con = /cono morse|hex[aá]gono externo|hex[aá]gono interno|\bhe\b|\bhi\b|\bcm\b/i.exec(t)
    r.implante = { marca, diametro: diam?.[1].replace(',', '.'), conexion: con?.[0] }
    if (!con) r.dudas.push('Implante sin conexión: preguntale al odontólogo')
  }
  return r
}

// --- Las indicaciones: lo que escribió el odontólogo y no son datos de la ficha ------------------------

/** Palabras que no dicen nada por sí solas: si una frase solo tiene estas y datos de la ficha, no es una indicación. */
const RELLENO = new Set(['de', 'del', 'la', 'el', 'las', 'los', 'un', 'una', 'para', 'con', 'por', 'que', 'y', 'en', 'al', 'se', 'lo', 'le', 'me', 'te', 'mi', 'es', 'son', 'hay', 'si', 'ya', 'a', 'o', 'e', 'u', 'no', 'muy', 'mas', 'más'])

/** Los fragmentos que `leerPedido` ya llevó a un campo (pieza, color, material, trabajo, día, paciente) y los saludos. */
const DATOS_YA_CARGADOS: RegExp[] = [
  /\b(?:hola|buen[oa]s?|d[ií]as?|tardes?|noches?|gracias|saludos|abrazo|dr\.?|dra\.?|doc|doctor[a]?|lab|laboratorio)\b/gi,
  /\b(?:te|les?)\s+(?:mando|env[ií]o|paso|dejo|adjunto)\b/gi,
  /\b(?:corona|carilla|incrustaci[oó]n|inlay|onlay|puente|placa|implante|mu[ñn][oó]n|tallad[oa]|escaneo|scan|archivos?|stl|ply)\b/gi,
  /\b(?:zirconi[oa]|zirconio|disilicato|e\.?max|metalo\s?cer[aá]mic[ao]|metal-?cer|monol[ií]tic[ao])\b/gi,
  /\b(?:pieza|pza\.?|diente|molar|premolar|incisivo|canino)\s?\d{0,2}\b/gi,
  /\b[1-4][1-8]\b/g,
  /\bcolor\b|\b[ABCD]\s?[1-4](?:[.,]5)?\b/gi,
  /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|ma[ñn]ana|hoy|urgente|entrega|para el)\b/gi,
  /\b(?:paciente|de|para)\s+[A-ZÁÉÍÓÚÑ]\.\s?[A-ZÁÉÍÓÚÑ]\./g,
  /\b[A-ZÁÉÍÓÚÑ]\.\s?[A-ZÁÉÍÓÚÑ]\./g,
  /\d+(?:[.,]\d+)?\s?mm\b/gi,
  /\b(?:nobel|straumann|neodent|biohorizons|zimmer|mis|osstem|rosterdent|cono morse|hex[aá]gono)\b/gi,
]

/**
 * Las frases del mensaje que traen algo más que los datos que ya leímos: la encía, los dientes vecinos, cómo
 * lo quiere, molestias, lo que hay que cuidar. Es una ayuda para no retipear: quien carga las revisa y las
 * corrige antes de crear el caso (y el mensaje completo se guarda aparte, tal cual llegó).
 * Una frase se queda si, sacados los datos ya cargados y las palabras de relleno, le quedan 2 palabras o más.
 */
export function indicacionesDelMensaje(texto: string): string {
  const sinCabecera = texto
    .normalize('NFC')
    // "[13/11 10:01] Dr. Pérez: " de WhatsApp, o "Dr. Pérez:" al principio de una línea.
    .replace(/^\s*\[[^\]]*\][^:\n]{0,40}:\s*/gm, '')
    .replace(/\r/g, '')
  const frases = sinCabecera
    // Se corta después del punto (que queda en su frase) y no en las iniciales ("J. G.", mayúscula antes del punto).
    .split(/\n+|(?<=[a-záéíóúñ0-9)][.!?]+)\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)
    .map((f) => f.trim())
    .filter(Boolean)
  const quedan = frases.filter((f) => {
    let resto = f
    for (const re of DATOS_YA_CARGADOS) resto = resto.replace(re, ' ')
    const palabras = resto.toLowerCase().match(/[a-záéíóúñü]{3,}/g) ?? []
    return palabras.filter((p) => !RELLENO.has(p)).length >= 2
  })
  return quedan.join(' ').replace(/\s+/g, ' ').trim()
}
