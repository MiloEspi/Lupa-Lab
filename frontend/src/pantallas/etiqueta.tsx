/**
 * Etiqueta de la caja (S13): QR, número, odontólogo, pieza, trabajo, material, color y fecha
 * prometida (docs/03 §11). Se imprime en una etiquetadora o en una hoja de etiquetas: el tamaño
 * es el de la etiqueta (70 × 50 mm) y al imprimir solo sale ella.
 */
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { api, pedir } from '../api/cliente'
import { CodigoQR } from '../components/CodigoQR'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { fechaCorta, piezasDe, tituloTrabajo } from '../lib/casos'
import { urlDeCaja } from '../lib/qr'
import { Aviso, Titulo } from '../ui/marco'

// Al imprimir se esconde todo menos la etiqueta, y la hoja toma el tamaño de ella.
const ESTILO_IMPRESION = `
@page { size: 70mm 50mm; margin: 0 }
@media print {
  body * { visibility: hidden !important }
  .etiqueta, .etiqueta * { visibility: visible !important }
  .etiqueta { position: fixed; inset: 0; box-shadow: none !important; border: 0 !important }
}`

export function Etiqueta() {
  const { id = '' } = useParams()
  const caso = useQuery({ queryKey: ['caso', id], queryFn: () => pedir(api.GET('/api/casos/{id}', { params: { path: { id } } })) })

  if (caso.isPending) return <p className="text-ink3">Cargando…</p>
  if (caso.error) return <Aviso>{caso.error.message}</Aviso>
  const c = caso.data
  const t = c.trabajos[0]
  const material = [t?.material, t?.color].filter(Boolean).join(' · ')

  return (
    <>
      <style>{ESTILO_IMPRESION}</style>
      <Titulo
        rotulo="Etiqueta de la caja"
        accion={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link to={`/casos/${c.id}`}>
                <ArrowLeft aria-hidden className="size-4" /> Volver al caso
              </Link>
            </Button>
            <Button onClick={() => window.print()}>
              <Printer aria-hidden className="size-4" /> Imprimir
            </Button>
          </div>
        }
      >
        {c.codigo}
      </Titulo>
      <p className="m-0 max-w-[62ch] text-ink2">
        Pegala en la caja. Quien la escanee con el celular abre el caso en producción; tiene que haber iniciado sesión.
      </p>

      <Card className="w-fit p-5">
        {/* La etiqueta en sí: fondo blanco y negro puro, para que se lea y se escanee bien impresa. */}
        <section aria-label={`Etiqueta de ${c.codigo}`} className="etiqueta grid h-[50mm] w-[70mm] grid-cols-[34mm_1fr] items-center gap-[2mm] bg-white p-[2.5mm] text-black shadow-[0_0_0_1px_#ccc]">
          <CodigoQR texto={urlDeCaja(c.id)} titulo={`QR de ${c.codigo}`} className="size-[34mm] [&>svg]:size-full" />
          <div className="grid min-w-0 content-center gap-[0.6mm] leading-tight">
            <strong className="text-[6mm] leading-none font-bold">{c.codigo}</strong>
            <span className="truncate text-[3.1mm] font-semibold">{c.profesional.nombre}</span>
            <span className="text-[3.1mm]">
              Pieza <strong>{piezasDe(t)}</strong>
            </span>
            <span className="text-[2.8mm]">{tituloTrabajo(t)}</span>
            {material && <span className="text-[2.8mm]">{material}</span>}
            <span className="mt-[0.8mm] text-[3.1mm] font-semibold">Entrega: {fechaCorta(c.fecha_prometida)}</span>
          </div>
        </section>
      </Card>
    </>
  )
}
