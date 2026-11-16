import type { Climatology } from '../lib/api'
import { MONTHS_LONG } from '../lib/format'
import { INK, SERIES } from '../lib/scales'

const R0 = 8
const R1 = 30

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
}

/** Year clock: 12 slices (Jan at the top), radius by the median hotspots; the fire season highlighted. */
export function SeasonDial({ climatology, season, size = 40 }: { climatology: Climatology[]; season: number[]; size?: number }) {
  const max = Math.max(1, ...climatology.map((c) => c.median))
  const peak = climatology.reduce((a, b) => (b.median > a.median ? b : a))
  return (
    <svg
      width={size}
      height={size}
      viewBox="-32 -32 64 64"
      role="img"
      aria-label={`Distribution of hotspots over the year, peaking in ${MONTHS_LONG[peak.month - 1]}`}
    >
      {climatology.map((c) => {
        const r = R0 + (R1 - R0) * Math.sqrt(c.median / max)
        const a0 = (c.month - 1) * 30 + 2
        const a1 = c.month * 30 - 2
        return (
          <path
            key={c.month}
            d={`M ${polar(R0, a0)} L ${polar(r, a0)} A ${r} ${r} 0 0 1 ${polar(r, a1)} L ${polar(R0, a1)} A ${R0} ${R0} 0 0 0 ${polar(R0, a0)} Z`}
            fill={season.includes(c.month) ? SERIES.accent : INK.bar}
          />
        )
      })}
    </svg>
  )
}
