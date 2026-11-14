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
