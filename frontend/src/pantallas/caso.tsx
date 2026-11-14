/**
 * Vista simple del caso, para que los enlaces de la lista funcionen. La pantalla completa del
 * prototipo (cabecera, recorrido, visor 3D, conversación) se pasa en la S10.
 */
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileBox } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { api, pedir } from '../api/cliente'
import { Card } from '../components/ui/card'
import { CodigoGrande, Rotulo } from '../components/ui/flotante'
import { ProgresoEtapas } from '../components/ui/progreso-etapas'
import { estadoCaso, fechaCorta, indiceEtapa, nombresEtapas, piezasDe, tituloTrabajo } from '../lib/casos'
import { Aviso } from '../ui/marco'

export function CasoDetalle() {
  const { id = '' } = useParams()
  const caso = useQuery({ queryKey: ['caso', id], queryFn: () => pedir(api.GET('/api/casos/{id}', { params: { path: { id } } })) })
  const archivos = useQuery({ queryKey: ['archivos', id], queryFn: () => pedir(api.GET('/api/casos/{id}/archivos', { params: { path: { id } } })) })
  if (caso.isPending) return <p className="text-ink3">Cargando…</p>
  if (caso.error) return <Aviso>{caso.error.message}</Aviso>
  const c = caso.data
  const t = c.trabajos[0]
  const [letra, numero] = c.codigo.split('-')
  return (
    <>
      <Link to="/casos" className="inline-flex min-h-11 w-fit items-center gap-2 font-mono text-[12px] tracking-[0.1em] text-acT uppercase">
        <ArrowLeft aria-hidden className="size-4" /> Casos
      </Link>
      <Card tono="tinte" className="grid gap-4 p-6">
        <Rotulo>{tituloTrabajo(t)}</Rotulo>
        <CodigoGrande prefijo={`${letra}-`} numero={numero} className="text-[64px]" />
        <p className="m-0 text-ink2">
          {c.profesional.nombre} · paga {c.cliente.nombre} · paciente {c.paciente || '—'} · pieza {piezasDe(t)} · {t?.material} {t?.color} · entrega {fechaCorta(c.fecha_prometida)}
        </p>
        <ProgresoEtapas etapas={nombresEtapas(t)} etapa={indiceEtapa(t)} frenado={!!c.cambio_pendiente} />
        <p className="m-0 font-semibold">{estadoCaso(c).texto}</p>
      </Card>
      <Card className="grid gap-2 p-5">
        <h2 className="m-0 text-[18px]">Archivos</h2>
        {archivos.data?.length === 0 && <p className="m-0 text-ink3">Sin archivos.</p>}
        <ul className="m-0 grid list-none gap-2 p-0">
          {archivos.data?.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl bg-sf2 px-3 py-2 text-[14px]">
              <FileBox aria-hidden className="size-4 text-acT" />
              <strong>{a.categoria ? `${a.tipo} · ${a.categoria}` : a.nombre}</strong>
              <span className="text-ink3">{a.nombre}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Aviso tono="info">La pantalla completa del caso (escaneo 3D, recorrido y conversación) llega en la próxima etapa.</Aviso>
    </>
  )
}
