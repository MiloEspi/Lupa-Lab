/**
 * Catálogo: qué hace el laboratorio, por qué etapas pasa cada trabajo y qué se revisa.
 * Todos lo leen; Administración lo edita. Cambiar una ruta no toca los casos ya creados.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api, pedir, type Esquemas } from '../api/cliente'
import { puede, useYo } from '../lib/sesion'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Field } from '../components/ui/field'
import { Aviso, Titulo } from '../ui/marco'

type Catalogo = Esquemas['Catalogo']
type Paso = Esquemas['Paso']
type Rol = Esquemas['Rol']

export function CatalogoPantalla() {
  const { data: yo } = useYo()
  const editable = puede(yo, 'gestionar_catalogo')
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => pedir(api.GET('/api/catalogo')) })
  const [elegida, setElegida] = useState<string | null>(null)

  if (catalogo.isPending) return <p className="text-ink3">Cargando…</p>
  if (catalogo.error) return <Aviso>{catalogo.error.message}</Aviso>
  const datos = catalogo.data
  const familia = datos.familias.find((f) => f.id === elegida) ?? datos.familias[0]

  return (
    <>
      <Titulo rotulo="Qué hace el laboratorio">Catálogo</Titulo>
      <Aviso tono="info">
        Borrador cargado del prototipo: las rutas, el checklist y los códigos se confirman en la reunión con el laboratorio.
      </Aviso>
      <div className="mt-5 grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Familias" className="grid content-start gap-2">
          {datos.familias.map((f) => {
            const activa = f.id === familia?.id
            return (
              <button
                key={f.id}
                onClick={() => setElegida(f.id)}
                aria-current={activa}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-2xl border px-3 text-left transition-colors',
                  activa ? 'border-ink bg-sf' : 'border-ln bg-sf/60 hover:bg-sf',
                )}
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-xl font-mono text-[15px] font-semibold text-white"
                  style={{ background: f.color }}
                >
                  {f.letra}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{f.nombre}</span>
                  <span className="block truncate text-[12px] text-ink3">
                    {datos.items.filter((i) => i.familia === f.id).length} trabajos
                  </span>
                </span>
              </button>
            )
          })}
        </nav>
        {familia && <DetalleFamilia key={familia.id} familia={familia} datos={datos} editable={editable} />}
      </div>
    </>
  )
}

function DetalleFamilia({ familia, datos, editable }: { familia: Esquemas['Familia']; datos: Catalogo; editable: boolean }) {
  const items = datos.items.filter((i) => i.familia === familia.id)
  const rutaIds = [...new Set(items.map((i) => i.plantilla_etapas))]
  const checklistIds = [...new Set(items.map((i) => i.plantilla_checklist).filter(Boolean))] as string[]
  return (
    <div className="grid min-w-0 content-start gap-6">
      <Card className="p-5">
        <h2 className="m-0 mb-3 text-[19px]">Trabajos y códigos</h2>
        <ul className="m-0 grid list-none gap-2 p-0">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sf2 px-3 py-2.5">
              <span className="font-mono text-[13px] font-semibold text-ink2">{i.codigo}</span>
              <span className="font-semibold">{i.nombre}</span>
              <span className="text-[13px] text-ink3">{i.materiales?.join(', ')}</span>
            </li>
          ))}
        </ul>
        {editable && <NuevoItem familia={familia} datos={datos} />}
      </Card>
      {rutaIds.map((id) => {
        const ruta = datos.plantillas_etapas.find((r) => r.id === id)
        if (!ruta) return null
        const otras = datos.familias.filter(
          (f) => f.id !== familia.id && datos.items.some((i) => i.familia === f.id && i.plantilla_etapas === id),
        )
        return <EditorRuta key={id} ruta={ruta} compartidaCon={otras.map((f) => f.nombre)} editable={editable} />
      })}
      {checklistIds.map((id) => {
        const lista = datos.plantillas_checklist.find((c) => c.id === id)
        return lista ? <EditorChecklist key={id} checklist={lista} editable={editable} /> : null
      })}
      {items[0]?.datos_pedidos?.length ? (
        <Card className="p-5">
          <h2 className="m-0 mb-3 text-[19px]">Datos que pide el pedido</h2>
          <div className="flex flex-wrap gap-2">
            {items[0].datos_pedidos.map((d) => (
              <Badge key={d}>{d}</Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function useGuardarCatalogo<T>(fn: () => Promise<T>, alTerminar?: () => void) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['catalogo'] })
      alTerminar?.()
    },
  })
}

function EditorRuta({ ruta, compartidaCon, editable }: { ruta: Esquemas['PlantillaEtapas']; compartidaCon: string[]; editable: boolean }) {
  const { data: yo } = useYo()
  const roles = yo?.roles_disponibles ?? []
  const nombreRol = (r: string) => roles.find((x) => x.valor === r)?.nombre ?? r
  const [editando, setEditando] = useState(false)
  const [pasos, setPasos] = useState<Paso[]>(ruta.pasos)
  const guardar = useGuardarCatalogo(
    () => pedir(api.PATCH('/api/catalogo/rutas/{id}', { params: { path: { id: ruta.id } }, body: { pasos } })),
    () => setEditando(false),
  )
  const cambiar = (i: number, cambio: Partial<Paso>) => setPasos((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  const mover = (i: number, d: -1 | 1) =>
    setPasos((ps) => {
      const copia = [...ps]
      ;[copia[i], copia[i + d]] = [copia[i + d], copia[i]]
      return copia
    })

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[19px]">Ruta de etapas</h2>
        {editable && !editando && (
          <Button variant="ghost" onClick={() => setEditando(true)}>
            <Pencil aria-hidden className="size-4" /> Editar ruta
          </Button>
        )}
      </div>
      <p className="mt-0 mb-4 text-[13px] text-ink3">
        {ruta.nombre} · se copia a cada caso nuevo
        {compartidaCon.length > 0 && ` · también la usan: ${compartidaCon.join(', ')}`}
      </p>
      {!editando ? (
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
          {ruta.pasos.map((p, i) => (
            <li key={i} className={cn('rounded-xl border px-3 py-2', p.en_consultorio ? 'border-wa/40 bg-waS' : 'border-ln bg-sf2')}>
              <span className="font-mono text-[12px] text-ink3">{String(i + 1).padStart(2, '0')}</span>{' '}
              <span className="font-semibold">{p.nombre}</span>
              <span className="block text-[12px] text-ink3">{p.en_consultorio ? 'En el consultorio' : nombreRol(p.rol)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="grid gap-2">
          {pasos.map((p, i) => (
            <div key={i} className="grid items-end gap-2 rounded-xl bg-sf2 p-2 sm:grid-cols-[1fr_180px_auto]">
              <Field label={`Etapa ${i + 1}`} value={p.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} />
              <label className="grid gap-1.5 text-[14px] font-semibold">
                Quién la tiene
                <select className="campo min-h-11 px-3" value={p.rol} onChange={(e) => cambiar(i, { rol: e.target.value as Rol })}>
                  {roles.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Bajar" disabled={i === pasos.length - 1} onClick={() => mover(i, 1)}>
                  <ArrowDown aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${p.nombre}`}
                  onClick={() => setPasos((ps) => ps.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink2 sm:col-span-3">
                <input type="checkbox" checked={!!p.en_consultorio} onChange={(e) => cambiar(i, { en_consultorio: e.target.checked })} />
                Prueba en el consultorio (el trabajo sale y vuelve)
              </label>
            </div>
          ))}
          <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setPasos((ps) => [...ps, { nombre: '', rol: 'produccion' }])}>
            <Plus aria-hidden className="size-4" /> Sumar etapa
          </Button>
          {compartidaCon.length > 0 && <Aviso tono="info">Esta ruta la comparten otras familias: el cambio les llega a todas.</Aviso>}
          {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
          <div className="flex gap-2">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              Guardar ruta
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPasos(ruta.pasos)
                setEditando(false)
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function EditorChecklist({ checklist, editable }: { checklist: Esquemas['PlantillaChecklist']; editable: boolean }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(checklist.items.join('\n'))
  const items = texto.split('\n').map((t) => t.trim()).filter(Boolean)
  const guardar = useGuardarCatalogo(
    () => pedir(api.PATCH('/api/catalogo/checklists/{id}', { params: { path: { id: checklist.id } }, body: { items } })),
    () => setEditando(false),
  )
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[19px]">Checklist de revisión técnica</h2>
        {editable && !editando && (
          <Button variant="ghost" onClick={() => setEditando(true)}>
            <Pencil aria-hidden className="size-4" /> Editar
          </Button>
        )}
      </div>
      {!editando ? (
        <ol className="m-0 grid gap-1.5 pl-5">
          {checklist.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ol>
      ) : (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-[14px] font-semibold">
            Un punto por renglón
            <textarea className="campo min-h-40 p-3 font-normal" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
          <div className="flex gap-2">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              Guardar checklist
            </Button>
            <Button variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function NuevoItem({ familia, datos }: { familia: Esquemas['Familia']; datos: Catalogo }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [materiales, setMateriales] = useState('')
  const modelo = datos.items.find((i) => i.familia === familia.id)
  const guardar = useGuardarCatalogo(
    () =>
      pedir(
        api.POST('/api/catalogo/items', {
          body: {
            familia: familia.id,
            nombre,
            codigo,
            materiales: materiales.split(',').map((m) => m.trim()).filter(Boolean),
            datos_pedidos: modelo?.datos_pedidos ?? [],
            // Un trabajo nuevo hereda la ruta y el checklist de su familia; se cambian después.
            plantilla_etapas: modelo?.plantilla_etapas ?? datos.plantillas_etapas[0].id,
            plantilla_checklist: modelo?.plantilla_checklist ?? null,
          },
        }),
      ),
    () => {
      setAbierto(false)
      setNombre('')
      setCodigo('')
      setMateriales('')
    },
  )
  if (!abierto)
    return (
      <Button variant="ghost" className="mt-3" onClick={() => setAbierto(true)}>
        <Plus aria-hidden className="size-4" /> Sumar un trabajo
      </Button>
    )
  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-ln p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        guardar.mutate()
      }}
    >
      <Field label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Field label="Código" required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      <Field label="Materiales" hint="Separados por coma." value={materiales} onChange={(e) => setMateriales(e.target.value)} />
      {guardar.error && <div className="sm:col-span-3"><Aviso>{guardar.error.message}</Aviso></div>}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" disabled={guardar.isPending}>
          Guardar trabajo
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
