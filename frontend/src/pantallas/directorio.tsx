/** Clientes (quien paga) y profesionales (quien pide y firma). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, Stethoscope } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { api, ErrorApi, pedir, type Esquemas } from '../api/cliente'
import { puede, useYo } from '../lib/sesion'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Field } from '../components/ui/field'
import { Aviso, Titulo } from '../ui/marco'
import { Interruptor, Segmentado } from '../ui/segmentado'

type Cliente = Esquemas['Cliente']
type Profesional = Esquemas['Profesional']
type Vista = 'clientes' | 'profesionales'
/** null = nada abierto, 'nuevo' = alta, o el objeto que se edita. */
type Seleccion<T> = null | 'nuevo' | T

function useDemorado(valor: string, ms = 250) {
  const [demorado, setDemorado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return demorado
}

export function Directorio() {
  const { data: yo } = useYo()
  const editable = puede(yo, 'gestionar_clientes')
  const [vista, setVista] = useState<Vista>('clientes')
  const [texto, setTexto] = useState('')
  const [inactivos, setInactivos] = useState(false)
  const q = useDemorado(texto)
  const [cliente, setCliente] = useState<Seleccion<Cliente>>(null)
  const [profesional, setProfesional] = useState<Seleccion<Profesional>>(null)
  const filtros = { q: q || undefined, activos: !inactivos }

  const clientes = useQuery({
    queryKey: ['clientes', filtros],
    queryFn: () => pedir(api.GET('/api/clientes', { params: { query: filtros } })),
    enabled: vista === 'clientes',
  })
  const profesionales = useQuery({
    queryKey: ['profesionales', filtros],
    queryFn: () => pedir(api.GET('/api/profesionales', { params: { query: filtros } })),
    enabled: vista === 'profesionales',
  })

  function cambiarVista(v: Vista) {
    setVista(v)
    setCliente(null)
    setProfesional(null)
  }

  const abierto = vista === 'clientes' ? cliente : profesional
  const lista = vista === 'clientes' ? clientes : profesionales

  return (
    <>
      <Titulo
        rotulo="Quién pide y quién paga"
        accion={
          editable && (
            <Button onClick={() => (vista === 'clientes' ? setCliente('nuevo') : setProfesional('nuevo'))}>
              <Plus aria-hidden className="size-4" /> {vista === 'clientes' ? 'Nuevo cliente' : 'Nuevo profesional'}
            </Button>
          )
        }
      >
        Clientes y profesionales
      </Titulo>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmentado
          etiqueta="Qué mostrar"
          valor={vista}
          onChange={cambiarVista}
          opciones={[
            { valor: 'clientes', texto: 'Clientes' },
            { valor: 'profesionales', texto: 'Profesionales' },
          ]}
        />
        <label className="campo flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3.5 sm:max-w-sm">
          <Search aria-hidden className="size-4 text-ink3" />
          <span className="sr-only">Buscar</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            placeholder={vista === 'clientes' ? 'Nombre, CUIT o mail' : 'Nombre, apellido o matrícula'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <Interruptor etiqueta="Ver dados de baja" valor={inactivos} onChange={setInactivos} />
      </div>

      <div className={cn('grid gap-6', abierto && 'xl:grid-cols-[1fr_420px]')}>
        <Card className="min-w-0 self-start p-0">
          {lista.error && <div className="p-5"><Aviso>{lista.error.message}</Aviso></div>}
          {lista.isPending && <p className="px-5 text-ink3">Cargando…</p>}
          <ul className="m-0 list-none p-0">
            {vista === 'clientes'
              ? clientes.data?.map((c) => (
                  <Fila
                    key={c.id}
                    icono={<Building2 aria-hidden className="size-5" />}
                    titulo={c.razon_social}
                    detalle={[c.cuit && `CUIT ${c.cuit}`, c.telefono || c.whatsapp, c.email].filter(Boolean).join(' · ')}
                    inactivo={c.activo === false}
                    elegido={typeof cliente === 'object' && cliente?.id === c.id}
                    onClick={() => setCliente(c)}
                  />
                ))
              : profesionales.data?.map((p) => (
                  <Fila
                    key={p.id}
                    icono={<Stethoscope aria-hidden className="size-5" />}
                    titulo={p.nombre_completo}
                    detalle={[p.matricula, p.clientes_detalle.map((c) => c.razon_social).join(', ')].filter(Boolean).join(' · ')}
                    inactivo={p.activo === false}
                    elegido={typeof profesional === 'object' && profesional?.id === p.id}
                    onClick={() => setProfesional(p)}
                  />
                ))}
          </ul>
          {lista.data?.length === 0 && (
            <p className="m-0 px-5 py-8 text-center text-ink3">{q ? `Nada coincide con "${q}".` : 'Todavía no hay nada cargado.'}</p>
          )}
        </Card>
        {vista === 'clientes' && cliente && (
          <FormCliente key={cliente === 'nuevo' ? 'nuevo' : cliente.id} inicial={cliente} editable={editable} cerrar={() => setCliente(null)} />
        )}
        {vista === 'profesionales' && profesional && (
          <FormProfesional
            key={profesional === 'nuevo' ? 'nuevo' : profesional.id}
            inicial={profesional}
            editable={editable}
            cerrar={() => setProfesional(null)}
          />
        )}
      </div>
    </>
  )
}

function Fila(p: { icono: React.ReactNode; titulo: string; detalle: string; inactivo: boolean; elegido: boolean; onClick: () => void }) {
  return (
    <li className="border-t border-ln first:border-t-0">
      <button
        onClick={p.onClick}
        aria-current={p.elegido}
        className={cn('flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-sf2/70', p.elegido && 'bg-acS')}
      >
        <span className="text-ink3">{p.icono}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.titulo}</span>
          {p.detalle && <span className="block truncate text-[13px] text-ink3">{p.detalle}</span>}
        </span>
        {p.inactivo && <Badge>De baja</Badge>}
      </button>
    </li>
  )
}

/** Estado de un formulario plano: un objeto y un setter por campo. */
function useFormulario<T extends Record<string, unknown>>(inicial: T) {
  const [valores, setValores] = useState(inicial)
  const campo = <K extends keyof T>(k: K) => ({
    value: (valores[k] ?? '') as string,
    onChange: (e: { target: { value: string } }) => setValores((v) => ({ ...v, [k]: e.target.value })),
  })
  return { valores, setValores, campo }
}

function useGuardar<T>(clave: string, crear: () => Promise<T>, actualizar: () => Promise<T>, esNuevo: boolean, cerrar: () => void) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: () => (esNuevo ? crear() : actualizar()),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: [clave] })
      cerrar()
    },
  })
}

const errorDe = (e: unknown, c: string) => (e instanceof ErrorApi ? e.campos[c]?.[0] : undefined)

function PanelFormulario({ titulo, children, onSubmit, cerrar, editable, guardando, error }: {
  titulo: string
  children: React.ReactNode
  onSubmit: () => void
  cerrar: () => void
  editable: boolean
  guardando: boolean
  error: Error | null
}) {
  return (
    <Card tono="tinte" className="entra self-start p-5 xl:sticky xl:top-6">
      <h2 className="m-0 mb-4 text-[19px]">{titulo}</h2>
      <form
        className="grid gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <fieldset disabled={!editable} className="m-0 grid gap-3 border-0 p-0">
          {children}
        </fieldset>
        {error && !(error instanceof ErrorApi && Object.keys(error.campos).length) && <Aviso>{error.message}</Aviso>}
        <div className="flex gap-2">
          {editable && (
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={cerrar}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function FormCliente({ inicial, editable, cerrar }: { inicial: 'nuevo' | Cliente; editable: boolean; cerrar: () => void }) {
  const esNuevo = inicial === 'nuevo'
  const base = esNuevo ? { razon_social: '', cuit: '', telefono: '', whatsapp: '', email: '', direccion: '', notas: '', activo: true } : inicial
  const { valores, setValores, campo } = useFormulario(base)
  const { id: _id, ...cuerpo } = valores as Cliente
  const guardar = useGuardar(
    'clientes',
    () => pedir(api.POST('/api/clientes', { body: cuerpo })),
    () => pedir(api.PATCH('/api/clientes/{id}', { params: { path: { id: (inicial as Cliente).id } }, body: cuerpo })),
    esNuevo,
    cerrar,
  )
  return (
    <PanelFormulario
      titulo={esNuevo ? 'Nuevo cliente' : valores.razon_social}
      onSubmit={() => guardar.mutate()}
      cerrar={cerrar}
      editable={editable}
      guardando={guardar.isPending}
      error={guardar.error}
    >
      <Field label="Razón social o nombre" required {...campo('razon_social')} error={errorDe(guardar.error, 'razon_social')} />
      <Field label="CUIT" inputMode="numeric" hint="Con o sin guiones." {...campo('cuit')} error={errorDe(guardar.error, 'cuit')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono" type="tel" {...campo('telefono')} />
        <Field label="WhatsApp" type="tel" {...campo('whatsapp')} />
      </div>
      <Field label="Mail" type="email" {...campo('email')} error={errorDe(guardar.error, 'email')} />
      <Field label="Dirección" {...campo('direccion')} />
      <Field label="Notas" {...campo('notas')} />
      {!esNuevo && <Interruptor etiqueta="Activo" valor={valores.activo !== false} onChange={(activo) => setValores((v) => ({ ...v, activo }))} />}
    </PanelFormulario>
  )
}

function FormProfesional({ inicial, editable, cerrar }: { inicial: 'nuevo' | Profesional; editable: boolean; cerrar: () => void }) {
  const esNuevo = inicial === 'nuevo'
  const base = esNuevo
    ? { nombre: '', apellido: '', matricula: '', telefono: '', whatsapp: '', email: '', notas: '', activo: true, clientes: [] as string[] }
    : { ...inicial, clientes: inicial.clientes ?? [] }
  const { valores, setValores, campo } = useFormulario(base)
  const todosLosClientes = useQuery({ queryKey: ['clientes', { activos: true }], queryFn: () => pedir(api.GET('/api/clientes')) })
  const { nombre, apellido, matricula, telefono, whatsapp, email, notas, activo, clientes } = valores
  const cuerpo = { nombre, apellido, matricula, telefono, whatsapp, email, notas, activo, clientes }
  const guardar = useGuardar(
    'profesionales',
    () => pedir(api.POST('/api/profesionales', { body: cuerpo })),
    () => pedir(api.PATCH('/api/profesionales/{id}', { params: { path: { id: (inicial as Profesional).id } }, body: cuerpo })),
    esNuevo,
    cerrar,
  )
  const alternar = (id: string) =>
    setValores((v) => ({ ...v, clientes: v.clientes.includes(id) ? v.clientes.filter((c) => c !== id) : [...v.clientes, id] }))

  return (
    <PanelFormulario
      titulo={esNuevo ? 'Nuevo profesional' : `${nombre} ${apellido}`}
      onSubmit={() => guardar.mutate()}
      cerrar={cerrar}
      editable={editable}
      guardando={guardar.isPending}
      error={guardar.error}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required {...campo('nombre')} error={errorDe(guardar.error, 'nombre')} />
        <Field label="Apellido" required {...campo('apellido')} error={errorDe(guardar.error, 'apellido')} />
      </div>
      <Field label="Matrícula" hint="Sale en la orden." {...campo('matricula')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono" type="tel" {...campo('telefono')} />
        <Field label="WhatsApp" type="tel" {...campo('whatsapp')} />
      </div>
      <Field label="Mail" type="email" {...campo('email')} error={errorDe(guardar.error, 'email')} />
      <div className="grid gap-1.5">
        <span className="text-[14px] font-semibold">Pide para</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Clientes del profesional">
          {todosLosClientes.data?.map((c) => {
            const elegido = clientes.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={elegido}
                onClick={() => alternar(c.id)}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-[13px] font-medium',
                  elegido ? 'border-ink bg-ink text-bg' : 'border-ctl bg-sf2 text-ink2 hover:border-ink',
                )}
              >
                {c.razon_social}
              </button>
            )
          })}
          {todosLosClientes.data?.length === 0 && <span className="text-[13px] text-ink3">Primero cargá un cliente.</span>}
        </div>
      </div>
      <Field label="Notas" {...campo('notas')} />
      {!esNuevo && <Interruptor etiqueta="Activo" valor={activo !== false} onChange={(a) => setValores((v) => ({ ...v, activo: a }))} />}
    </PanelFormulario>
  )
}
