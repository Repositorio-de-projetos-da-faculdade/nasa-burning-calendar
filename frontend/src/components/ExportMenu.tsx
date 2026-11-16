import { Download } from 'lucide-react'
import { useState } from 'react'
import { type AreaQuery, download } from '../lib/api'

export function ExportMenu({ area, slug, defaultRange }: {
  area: AreaQuery
  slug: string
  defaultRange: { start: string; end: string }
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState(defaultRange)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Download size={15} /> Export CSV
      </button>
      {open && (
        <div className="picker-list" style={{ left: 'auto', right: 0, width: 330, padding: 12, display: 'grid', gap: 12 }}>
          <div>
            <b style={{ fontSize: 13 }}>Harmonized calendar</b>
            <p className="footnote" style={{ margin: '2px 0 8px' }}>
              Monthly series for the area: harmonized hotspots, raw MODIS and VIIRS, median and anomaly.
            </p>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => run('cal', () => download('/api/calendar.csv', area, `${slug}_calendar.csv`))}
            >
              {busy === 'cal' ? 'Generating…' : 'Download monthly series'}
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <b style={{ fontSize: 13 }}>Detected hotspots</b>
            <p className="footnote" style={{ margin: '2px 0 8px' }}>
              Every MODIS/VIIRS hotspot inside the area, with date, time, satellite, confidence and FRP.
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="date" className="picker-input" style={{ paddingLeft: 8 }} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} aria-label="Start" />
              <input type="date" className="picker-input" style={{ paddingLeft: 8 }} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} aria-label="End" />
            </div>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                run('pts', () => download('/api/hotspots.csv', { ...area, ...range }, `${slug}_hotspots_${range.start}_${range.end}.csv`))
              }
            >
              {busy === 'pts' ? 'Generating…' : 'Download hotspots for the period'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
