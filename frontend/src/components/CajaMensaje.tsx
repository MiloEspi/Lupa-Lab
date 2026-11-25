/**
 * Caja para escribir en la conversación del caso, con menciones: al tipear "@" se abre la lista de
 * gente a quien se puede etiquetar (el equipo del laboratorio y el odontólogo del caso). Funciona con
 * teclado (↑ ↓ Enter/Tab, Esc) y con toque. Enter envía; Shift+Enter hace un renglón nuevo.
 *
 * La mención queda como texto ("@Ana Pérez"): no hay estado escondido. Al enviar se buscan los nombres
 * en el texto (`idsMencionados`) y esos ids viajan al backend, que los valida contra el equipo.
 */
import { AtSign } from 'lucide-react'
import { Fragment, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { escapar, llano, SIN_LETRA_DESPUES, type Mencionable } from '../lib/menciones'
import { cn } from '../lib/utils'
import { Avatar } from './ui/avatar-foto'

const iniciales = (nombre: string) =>
  nombre
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/** El "@algo" que se está tipeando justo antes del cursor, si hay uno. */
function disparoEn(texto: string, cursor: number) {
  const antes = texto.slice(0, cursor)
  // La búsqueda puede llevar espacios ("@Ana Pé") pero no terminar en uno: así, al elegir a alguien (el nombre
  // queda seguido de un espacio) la lista se cierra sola.
  const m = /(?:^|\s)@([^\s@](?:[^@\n]{0,30}[^\s@])?|)$/u.exec(antes)
  if (!m) return null
  return { inicio: cursor - m[1]!.length - 1, consulta: m[1]! }
}

function filtrar(opciones: Mencionable[], consulta: string) {
  const q = llano(consulta.trim())
  if (!q) return opciones
  const puntaje = (o: Mencionable) => {
    const nombre = llano(o.nombre)
    if (nombre.startsWith(q)) return 0
    if (nombre.split(/\s+/).some((p) => p.startsWith(q))) return 1
    if (nombre.includes(q) || llano(o.rol).includes(q)) return 2
    return 3
  }
  return opciones
    .map((o) => ({ o, p: puntaje(o) }))
    .filter((x) => x.p < 3)
    .sort((a, b) => a.p - b.p)
    .map((x) => x.o)
}

/** El texto de un mensaje con las menciones resaltadas. `yo`: nombres que son de quien mira (se marcan más fuerte). */
export function TextoConMenciones({ texto, nombres, yo = [], className }: { texto: string; nombres: string[]; yo?: string[]; className?: string }) {
  const unicos = [...new Set(nombres.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!unicos.length) return <span className={className}>{texto}</span>
  const patron = new RegExp(`(@(?:${unicos.map(escapar).join('|')})${SIN_LETRA_DESPUES})`, 'u')
  const partes = texto.split(patron)
  const mio = new Set(yo.map((n) => `@${n}`))
  return (
    <span className={cn('whitespace-pre-line', className)}>
      {partes.map((p, i): ReactNode =>
        i % 2 === 1 ? (
          <span key={i} className={cn('rounded-[6px] px-1 font-semibold', mio.has(p) ? 'bg-ac text-acI' : 'bg-acS text-acT')}>
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  )
}

export function CajaMensaje({
  value,
  onChange,
  onEnviar,
  opciones,
  placeholder,
  etiqueta,
  onElegirOdontologo,
  autoFocus,
  className,
  rows = 2,
}: {
  value: string
  onChange: (v: string) => void
  onEnviar: () => void
  opciones: Mencionable[]
  placeholder: string
  /** Texto para lectores de pantalla (la caja no lleva etiqueta visible). */
  etiqueta: string
  onElegirOdontologo?: () => void
  autoFocus?: boolean
  className?: string
  rows?: number
}) {
  const uid = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(0)
  const [activo, setActivo] = useState(0)
  /** Si se cerró con Esc, no se reabre hasta que el "@" sea otro. */
  const [cerradoEn, setCerradoEn] = useState<number | null>(null)
  const [enfocado, setEnfocado] = useState(false)
  /** Dónde dejar el cursor tras insertar un nombre: se aplica cuando React ya pintó el texto nuevo. */
  const lugarCursor = useRef<number | null>(null)

  const disparo = enfocado ? disparoEn(value, cursor) : null
  const resultados = disparo ? filtrar(opciones, disparo.consulta) : []
  const abierto = !!disparo && cerradoEn !== disparo.inicio && opciones.length > 0 && (resultados.length > 0 || disparo.consulta.length < 3)
  const idOpcion = (i: number) => `${uid}-op-${i}`

  useLayoutEffect(() => {
    if (lugarCursor.current === null) return
    area.current?.setSelectionRange(lugarCursor.current, lugarCursor.current)
    lugarCursor.current = null
  }, [value])

  const leerCursor = () => setCursor(area.current?.selectionStart ?? 0)

  const elegir = (o: Mencionable) => {
    if (!disparo) return
    const hasta = cursor
    const nuevo = `${value.slice(0, disparo.inicio)}@${o.nombre} ${value.slice(hasta)}`
    const pos = disparo.inicio + o.nombre.length + 2
    onChange(nuevo)
    lugarCursor.current = pos
    setCursor(pos)
    if (o.odontologo) onElegirOdontologo?.()
    area.current?.focus()
  }

  /** El botón "@": agrega la arroba en el cursor (con un espacio antes si hace falta) y abre la lista. */
  const abrirConBoton = () => {
    const el = area.current
    if (!el) return
    const pos = el.selectionStart ?? value.length
    const previo = value.slice(0, pos)
    const sep = previo && !/\s$/.test(previo) ? ' ' : ''
    onChange(`${previo}${sep}@${value.slice(pos)}`)
    setCerradoEn(null)
    lugarCursor.current = pos + sep.length + 1
    setCursor(pos + sep.length + 1)
    el.focus()
  }

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (abierto && resultados.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActivo((a) => (a + (e.key === 'ArrowDown' ? 1 : resultados.length - 1)) % resultados.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        elegir(resultados[Math.min(activo, resultados.length - 1)]!)
        return
      }
    }
    if (abierto && e.key === 'Escape') {
      e.preventDefault()
      setCerradoEn(disparo!.inicio)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEnviar()
    }
  }

  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={area}
        role="combobox"
        aria-label={etiqueta}
        aria-autocomplete="list"
        aria-expanded={abierto}
        aria-controls={abierto ? `${uid}-lista` : undefined}
        aria-activedescendant={abierto && resultados.length > 0 ? idOpcion(Math.min(activo, resultados.length - 1)) : undefined}
        aria-haspopup="listbox"
        autoFocus={autoFocus}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setCursor(e.target.selectionStart)
          setActivo(0)
        }}
        onKeyDown={alTeclear}
        onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') && leerCursor()}
        onClick={leerCursor}
        onSelect={leerCursor}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        className={cn('field-sizing-content max-h-44 w-full resize-none rounded-[12px] border border-ctl bg-sf py-2.5 pr-12 pl-3.5 text-[16px] leading-normal text-ink placeholder:text-ink3', rows > 1 ? 'min-h-[72px]' : 'min-h-11')}
      />
      <button
        type="button"
        aria-label="Etiquetar a alguien"
        title="Etiquetar a alguien con @"
        // onMouseDown: que la caja no pierda el foco (y se cierre la lista) antes del clic.
        onMouseDown={(e) => e.preventDefault()}
        onClick={abrirConBoton}
        className="absolute right-1.5 bottom-1.5 grid size-11 place-items-center rounded-[10px] text-ink2 hover:bg-acS hover:text-acT focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-fo"
      >
        <AtSign aria-hidden className="size-[18px]" />
      </button>

      {abierto && (
        <ul
          id={`${uid}-lista`}
          role="listbox"
          aria-label="Gente a quien etiquetar"
          className="absolute right-0 bottom-full left-0 z-30 mb-1.5 m-0 grid max-h-64 list-none gap-0.5 overflow-y-auto rounded-[14px] border border-ln bg-sf p-1.5 shadow-[0_18px_40px_-16px_rgb(24_32_44/.45)]"
        >
          <li role="presentation" className="px-2.5 pt-1 pb-0.5 font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">
            Etiquetar a
          </li>
          {resultados.length === 0 && (
            <li role="presentation" className="px-2.5 py-2 text-[14px] text-ink3">
              Nadie se llama así en el equipo.
            </li>
          )}
          {resultados.map((o, i) => (
            <li
              key={o.id}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activo}
              // onMouseDown: elegir antes de que el blur de la caja cierre la lista.
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(o)
              }}
              onMouseEnter={() => setActivo(i)}
              className={cn('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5', i === activo ? 'bg-acS' : 'hover:bg-sf2')}
            >
              <Avatar ini={iniciales(o.nombre)} className="size-8 text-[12px]" />
              <span className="grid min-w-0 leading-tight">
                <strong className="truncate text-[15px] font-semibold">{o.nombre}</strong>
                <span className="truncate text-[13px] text-ink2">{o.odontologo ? 'Odontólogo del caso · se le avisa por WhatsApp' : o.rol}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <span role="status" className="sr-only">
        {abierto ? (resultados.length ? `${resultados.length} personas para etiquetar. Usá las flechas y Enter.` : 'Nadie coincide.') : ''}
      </span>
    </div>
  )
}
