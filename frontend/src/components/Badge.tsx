import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { fmtPct } from '../lib/format'

function tone(pct: number | null): { tone: string; label: string; Icon: typeof Minus } {
  if (pct == null) return { tone: 'normal', label: 'sem referência', Icon: Minus }
  if (pct >= 100) return { tone: 'critical', label: 'muito acima do normal', Icon: AlertTriangle }
  if (pct >= 25) return { tone: 'serious', label: 'acima do normal', Icon: ArrowUpRight }
  if (pct <= -25) return { tone: 'good', label: 'abaixo do normal', Icon: ArrowDownRight }
  return { tone: 'normal', label: 'dentro do normal', Icon: Minus }
}

/** Anomalia em relação à mediana, com cor e rótulo por faixa. */
export function Badge({ pct }: { pct: number | null }) {
  const t = tone(pct)
  return (
    <span className="badge" data-tone={t.tone}>
      <t.Icon size={13} />
      <span className="num">{fmtPct(pct)}</span>
      <span style={{ fontWeight: 500 }}>{t.label}</span>
    </span>
  )
}
