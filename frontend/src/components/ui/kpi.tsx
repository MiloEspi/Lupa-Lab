import { Card } from './card'

/** Indicador con barra de capacidad opcional (ej.: 62 de ~70 trabajos del día). */
export function Kpi({ label, valor, de, hint }: { label: string; valor: number | string; de?: number; hint?: string }) {
  const pct = de && typeof valor === 'number' ? Math.min(100, Math.round((valor / de) * 100)) : null
  return (
    <Card className="p-4">
      <p className="m-0 text-[13px] font-medium text-ink2">{label}</p>
      <p className="m-0 mt-1 flex items-baseline gap-1.5 text-[32px] leading-none font-semibold tracking-tight">
        {valor}
        {de && <span className="text-[16px] font-normal text-ink3">/ {de}</span>}
      </p>
      {pct !== null && (
        <div
          role="meter"
          aria-valuenow={Number(valor)}
          aria-valuemin={0}
          aria-valuemax={de}
          aria-label={label}
          className="mt-3 h-2 overflow-hidden rounded-full bg-bg2"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-ac to-[color-mix(in_srgb,var(--ac)_60%,white)]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {hint && <p className="m-0 mt-2 text-[13px] text-ink3">{hint}</p>}
    </Card>
  )
}
