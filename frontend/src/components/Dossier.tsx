import type { UseQueryResult } from '@tanstack/react-query'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import type { AreaQuery, CalendarData, ValidationData } from '../lib/api'
import { missingMonths } from '../lib/coverage'
import { fmt, fmtDate, fmtPct } from '../lib/format'
import { AnnualChart, SeasonChart } from './Charts'
import { ExportMenu } from './ExportMenu'
import { type CalMode, FireCalendar } from './FireCalendar'
import { Kpis } from './Kpis'
import type { Layer } from './MapPanel'
import { MethodSection } from './MethodSection'
import { PeriodReading } from './PeriodReading'
import { RankList } from './RankList'

const KIND_LABEL: Record<string, string> = {
  biome: 'Biome', state: 'State', municipality: 'Municipality', drawn: 'Drawn area', point: 'Radius', bbox: 'Rectangle',
}

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'years', label: 'Years' },
  { id: 'method', label: 'Method' },
] as const
type Tab = (typeof TABS)[number]['id']

interface Props {
  cal: UseQueryResult<CalendarData, Error>
  validation: ValidationData | undefined
  query: AreaQuery
  mode: CalMode
  setMode: (m: CalMode) => void
  layer: Layer
  setLayer: (l: Layer) => void
  open: boolean
  setOpen: (o: boolean) => void
}

/** Analysis column: a single surface over the map, one tab per question, blocks separated by hairlines. */
export function Dossier({ cal, validation, query, mode, setMode, layer, setLayer, open, setOpen }: Props) {
  // the initial tab may come from the link (#calendar, #years, #method)
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'summary')
  const pickTab = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `${location.pathname}${location.search}#${t}`)
  }
  const d = cal.data
  const slug = ('region' in query ? query.region : 'area').replace(/[^a-z0-9-]/gi, '_')
  return (
    <>
      {!open && (
        <button className="widget panel-toggle" onClick={() => setOpen(true)} aria-controls="dossier">
          <PanelRightOpen size={15} /> Open analysis
        </button>
      )}
      <main className="widget panel" id="dossier" inert={!open}>
        <div className="panel-top">
          {cal.isFetching && <div className="loading-bar" />}
          <div className="panel-head">
            <div className="panel-meta">
              {d && (
                <>
                  <p className="eyebrow num">
                    {KIND_LABEL[d.area.kind] ?? d.area.kind}{d.area.state && d.area.kind === 'municipality' ? `, ${d.area.state}` : ''} · {fmt(d.area.area_km2)} km² · data through {fmtDate(d.data_until)}
                  </p>
                  <h1 className="panel-title">{d.area.name}</h1>
                </>
              )}
            </div>
            {d && <ExportMenu area={query} slug={slug} defaultRange={{ start: `${d.data_until.slice(0, 4)}-01-01`, end: d.data_until }} />}
            <button className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Close the analysis and show only the map" title="Map only">
              <PanelRightClose size={15} />
            </button>
          </div>
          <div className="tabs" role="tablist" aria-label="Area analysis">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => pickTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* key: switching tabs replays the blocks' staggered entrance */}
        <div className="panel-stack" role="tabpanel" key={tab}>
          {cal.isError && <div className="block error-box">Could not compute this area: {cal.error.message}</div>}
          {!d && !cal.isError && <div className="block skeleton" />}
          {d && tab === 'summary' && <PeriodReading d={d} layer={layer} />}
          {d && tab === 'summary' && <Summary d={d} />}
          {d && tab === 'calendar' && <Calendar d={d} mode={mode} setMode={setMode} layer={layer} setLayer={setLayer} />}
          {d && tab === 'years' && <Years d={d} layer={layer} setLayer={setLayer} />}
          {tab === 'method' && validation && <MethodSection v={validation} />}
          <p className="block footnote">
            Source: NASA FIRMS (MODIS C6.1 and VIIRS 375 m, Standard Processing + NRT). Boundaries: INPE/TerraBrasilis
            (PRODES). Hotspots indicate active fire at the time of the satellite overpass; clouds and thick smoke can
            hide detections.
          </p>
        </div>
      </main>
    </>
  )
}

const Summary = memo(function Summary({ d }: { d: CalendarData }) {
  return (
    <>
      <Kpis data={d} />
      <section className="block">
        <h2 className="w-title">{d.current.year} vs. past years</h2>
        <p className="w-desc">
          Compared with the median and the typical range from {d.baseline[0]} to {d.baseline[1]}.
          {d.ytd.anomaly_pct != null && !missingMonths(d).length && <> Year to date: <b className="num">{fmtPct(d.ytd.anomaly_pct)}</b>.</>}
        </p>
        <SeasonChart data={d} />
      </section>
    </>
  )
})

type Period = Pick<Props, 'layer' | 'setLayer'> & { d: CalendarData }

function Calendar({ d, mode, setMode, layer, setLayer }: Period & Pick<Props, 'mode' | 'setMode'>) {
  const onSelect = useCallback((year: number, month: number) => setLayer({ year, month }), [setLayer])
  return (
    <section className="block">
      <div className="w-head">
        <h2 className="w-title">When it burns, month by month</h2>
        <div className="seg">
          <button data-active={mode === 'count'} onClick={() => setMode('count')}>Hotspots</button>
          <button data-active={mode === 'anomaly'} onClick={() => setMode('anomaly')}>Anomaly</button>
        </div>
      </div>
      <p className="w-desc">
        Each square is a month; the bigger, the more hotspots. Measured VIIRS since 2012, MODIS converted to the same scale
        before that. A click takes the map to that month.
      </p>
      {layer.year != null && layer.month != null && (
        <style>{`.cal-c[data-k="${layer.year}-${layer.month}"]::after { outline: 2px solid var(--text-primary); outline-offset: 2px; }`}</style>
      )}
      <FireCalendar data={d} mode={mode} onSelect={onSelect} />
    </section>
  )
}

function Years({ d, layer, setLayer }: Period) {
  const pick = (year: number) => setLayer({ year, month: null })
  return (
    <>
      <section className="block">
        <h2 className="w-title">The years that burned the most</h2>
        <p className="w-desc">Harmonized annual total; the shading marks the converted MODIS years. A click shows the year on the map.</p>
        <AnnualChart data={d} onPick={pick} />
      </section>
      <section className="block">
        <h2 className="w-title">The top six</h2>
        <RankList data={d} active={layer.month == null ? layer.year : null} onPick={pick} />
        <p className="w-foot rank-note">Up to 2011, MODIS converted to the VIIRS scale; from 2012 on, measured VIIRS.</p>
      </section>
    </>
  )
}
