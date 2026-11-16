import { fmtPct } from '../lib/format'

function tone(pct: number | null): { tone: string; label: string } {
  if (pct == null) return { tone: 'normal', label: 'no baseline' }
  if (pct >= 100) return { tone: 'critical', label: 'far above normal' }
  if (pct >= 25) return { tone: 'serious', label: 'above normal' }
  if (pct <= -25) return { tone: 'good', label: 'below normal' }
  return { tone: 'normal', label: 'within normal' }
}

/** Anomaly relative to the median: the number carries the band's color, the label stays understated. */
export function Badge({ pct }: { pct: number | null }) {
  const t = tone(pct)
  return (
    <span className="badge" data-tone={t.tone}>
      <b className="num">{fmtPct(pct)}</b> {t.label}
    </span>
  )
}
