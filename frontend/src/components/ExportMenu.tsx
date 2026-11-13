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
      <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Download size={15} /> Exportar CSV
      </button>
      {open && (
        <div className="picker-list" style={{ left: 'auto', right: 0, width: 330, padding: 12, display: 'grid', gap: 12 }}>
          <div>
            <b style={{ fontSize: 13 }}>Calendário harmonizado</b>
            <p className="footnote" style={{ margin: '2px 0 8px' }}>
              Série mensal da área: focos harmonizados, MODIS e VIIRS brutos, mediana e anomalia.
            </p>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => run('cal', () => download('/api/calendar.csv', area, `${slug}_calendario.csv`))}
            >
              {busy === 'cal' ? 'Gerando…' : 'Baixar série mensal'}
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <b style={{ fontSize: 13 }}>Focos detectados</b>
            <p className="footnote" style={{ margin: '2px 0 8px' }}>
              Cada foco MODIS/VIIRS dentro da área, com data, hora, satélite, confiança e FRP.
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="date" className="picker-input" style={{ paddingLeft: 8 }} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} aria-label="Início" />
              <input type="date" className="picker-input" style={{ paddingLeft: 8 }} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} aria-label="Fim" />
            </div>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                run('pts', () => download('/api/hotspots.csv', { ...area, ...range }, `${slug}_focos_${range.start}_${range.end}.csv`))
              }
            >
              {busy === 'pts' ? 'Gerando…' : 'Baixar focos do período'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
