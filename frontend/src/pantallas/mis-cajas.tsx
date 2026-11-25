/** Lo mío de hoy para quien no está parado frente al QR (CAD, Control, Revisión, Recepción). */
import { MisCajas } from '../components/MisCajas'

export function MisCajasPantalla() {
  return (
    <div className="mx-auto grid w-full max-w-[640px] gap-4">
      <header>
        <h1 className="m-0 text-[28px] leading-tight">Mis cajas</h1>
        <p className="m-0 text-ink3">Las cajas que están en tu etapa, lo urgente primero.</p>
      </header>
      <MisCajas />
    </div>
  )
}
