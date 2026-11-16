import { fmtPct } from '../lib/format'

function tone(pct: number | null): { tone: string; label: string } {
  if (pct == null) return { tone: 'normal', label: 'sem referência' }
  if (pct >= 100) return { tone: 'critical', label: 'muito acima do normal' }
  if (pct >= 25) return { tone: 'serious', label: 'acima do normal' }
  if (pct <= -25) return { tone: 'good', label: 'abaixo do normal' }
  return { tone: 'normal', label: 'dentro do normal' }
}

/** Anomalia em relação à mediana: o número leva a cor da faixa, o rótulo fica discreto. */
export function Badge({ pct }: { pct: number | null }) {
  const t = tone(pct)
  return (
    <span className="badge" data-tone={t.tone}>
      <b className="num">{fmtPct(pct)}</b> {t.label}
    </span>
  )
}
