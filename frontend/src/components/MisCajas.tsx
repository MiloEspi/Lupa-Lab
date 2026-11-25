/**
 * "Mis cajas de hoy" (S14): las cajas cuya etapa en curso le toca a quien está mirando, lo urgente
 * primero. Sale de `/api/vistas/mis-cajas`; el orden y qué frena a cada caja lo decide el backend.
 * Es una lista corta para el celular: tocar una caja abre la pantalla de producción de esa caja.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, pedir, type Esquemas } from '../api/cliente'
import { fechaCorta } from '../lib/casos'
import { cn } from '../lib/utils'
import { Aviso } from '../ui/marco'
import { Card } from './ui/card'

type Caja = Esquemas['Caja']

/** Una marca por caja: lo que frena va antes que lo atrasado, y eso antes que la fecha. */
function marca(c: Caja): { texto: string; clase: string } | null {
  // Cortas, como en el prototipo: el celular no da para más y la caja ya cuenta el resto.
  if (c.bloqueo === 'cambio') return { texto: 'Cambio', clase: 'bg-waS text-wa' }
  if (c.bloqueo === 'pausa') return { texto: 'Pausa', clase: 'bg-bg2 text-ink2' }
  if (c.bloqueo === 'espera') return { texto: 'Espera', clase: 'bg-bg2 text-ink2' }
  if (c.atrasado) return { texto: 'Atrasado', clase: 'bg-baS text-ba' }
  return null
}

export function MisCajas() {
  const cajas = useQuery({
    queryKey: ['mis-cajas'],
    queryFn: () => pedir(api.GET('/api/vistas/mis-cajas')),
    // El celular vive abierto en el taller: se refresca solo para no mostrar cajas que ya pasaron.
    refetchInterval: 60_000,
  })
  const lista = cajas.data?.cajas ?? []

  return (
    <Card className="grid gap-3 p-4" aria-labelledby="mis-cajas-titulo">
      <div className="flex items-baseline justify-between">
        <h2 id="mis-cajas-titulo" className="m-0 text-[19px] font-semibold">
          Mis cajas de hoy
        </h2>
        {cajas.data && <span className="text-[14px] text-ink3">{lista.length}</span>}
      </div>
      {cajas.error && <Aviso>{cajas.error.message}</Aviso>}
      {cajas.data && lista.length === 0 && <p className="m-0 text-ink3">No tenés cajas en tu etapa ahora.</p>}
      <ul className="m-0 grid list-none gap-2 p-0">
        {lista.map((c) => {
          const m = marca(c)
          return (
            <li key={c.trabajo}>
              <Link
                to={`/p/${c.caso}`}
                className={cn(
                  'grid min-h-[64px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[16px] border p-3 text-ink no-underline hover:bg-sf2',
                  c.bloqueo === 'cambio' ? 'border-wa bg-waS' : 'border-ln bg-sf',
                )}
              >
                <span aria-hidden className="grid size-[46px] place-items-center rounded-[12px] bg-sf text-[17px] font-bold">
                  {c.pieza.split(',')[0] || '—'}
                </span>
                <span className="grid min-w-0 leading-snug">
                  <strong className="font-semibold">{c.codigo}</strong>
                  <span className="truncate text-[14px] text-ink2">
                    {c.etapa}
                    {c.iniciada && ' · en mano'}
                    {c.material && `, ${c.material.toLowerCase()}`}
                  </span>
                </span>
                {m ? (
                  <span className={cn('rounded-full px-2.5 py-1 text-[13px] font-semibold', m.clase)}>{m.texto}</span>
                ) : (
                  <span className="text-[14px] text-ink3">{fechaCorta(c.fecha_prometida)}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
