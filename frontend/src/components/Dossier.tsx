import type { UseQueryResult } from '@tanstack/react-query'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { AreaQuery, CalendarData, ValidationData } from '../lib/api'
import { fmt, fmtDate, fmtPct } from '../lib/format'
import { AnnualChart, SeasonChart } from './Charts'
import { ExportMenu } from './ExportMenu'
import { type CalMode, FireCalendar } from './FireCalendar'
import { Kpis } from './Kpis'
import type { Layer } from './MapPanel'
import { MethodSection } from './MethodSection'

const KIND_LABEL: Record<string, string> = {
  biome: 'Bioma', state: 'Estado', municipality: 'Município', drawn: 'Área desenhada', point: 'Raio', bbox: 'Retângulo',
}

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

/** Painel de análise da área, sobre o mapa. */
export function Dossier({ cal, validation, query, mode, setMode, layer, setLayer, open, setOpen }: Props) {
  const d = cal.data
  const Icon = open ? PanelRightClose : PanelRightOpen
  return (
    <>
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="dossier">
        <Icon size={15} /> {open ? 'Só o mapa' : 'Abrir análise'}
      </button>
      <main className="panel" id="dossier" inert={!open}>
        {cal.isFetching && <div className="loading-bar" />}
        <div className="panel-inner">
          {cal.isError && <div className="error-box">Não foi possível calcular esta área: {cal.error.message}</div>}
          {!d && !cal.isError && <Skeleton />}
          {d && <Analysis d={d} query={query} mode={mode} setMode={setMode} layer={layer} setLayer={setLayer} />}
          {validation && <MethodSection v={validation} />}
          <p className="footnote">
            Fonte: NASA FIRMS (MODIS C6.1 e VIIRS 375 m, Standard Processing + NRT). Limites: INPE/TerraBrasilis
            (PRODES). Focos de calor indicam fogo ativo no momento da passagem do satélite; nuvens e fumaça densa podem
            ocultar detecções.
          </p>
        </div>
      </main>
    </>
  )
}

function Analysis({ d, query, mode, setMode, layer, setLayer }: Pick<Props, 'query' | 'mode' | 'setMode' | 'layer' | 'setLayer'> & { d: CalendarData }) {
  const slug = ('region' in query ? query.region : 'area').replace(/[^a-z0-9-]/gi, '_')
  const span = `${d.years[0]} a ${d.years[d.years.length - 1]}`
  const selected = layer.year != null && layer.month != null ? { year: layer.year, month: layer.month } : null
  return (
    <>
      <div className="panel-head">
        <div className="panel-meta mono num">
          <span>{KIND_LABEL[d.area.kind] ?? d.area.kind}{d.area.uf && d.area.kind === 'municipality' ? `, ${d.area.uf}` : ''}</span>
          <span>{fmt(d.area.area_km2)} km²</span>
          <span><i className="live-dot" /> dados até {fmtDate(d.data_until)}</span>
        </div>
        <ExportMenu area={query} slug={slug} defaultRange={{ start: `${d.data_until.slice(0, 4)}-01-01`, end: d.data_until }} />
      </div>

      <Kpis data={d} />

      <section className="sec">
        <div className="sec-head">
          <h2>Quando queima, mês a mês</h2>
          <div className="seg">
            <button data-active={mode === 'count'} onClick={() => setMode('count')}>Focos</button>
            <button data-active={mode === 'anomaly'} onClick={() => setMode('anomaly')}>Anomalia</button>
          </div>
        </div>
        <p className="sec-desc">
          Cada célula é um mês de {span}. Uma série só: VIIRS medido desde 2012, MODIS convertido para a mesma escala
          antes disso. Um clique leva o mapa para aquele mês.
        </p>
        <FireCalendar data={d} mode={mode} selected={selected} onSelect={(year, month) => setLayer({ year, month })} />
      </section>

      <section className="sec">
        <h2>{d.current.year} contra o histórico</h2>
        <p className="sec-desc">
          Comparado à mediana e à faixa típica de {d.baseline[0]} a {d.baseline[1]}.
          {d.ytd.anomaly_pct != null && <> Acumulado no ano: <b className="num">{fmtPct(d.ytd.anomaly_pct)}</b>.</>}
        </p>
        <SeasonChart data={d} />
      </section>

      <section className="sec">
        <h2>Os anos que mais queimaram</h2>
        <p className="sec-desc">Total anual harmonizado; hachurados são os anos MODIS convertidos. Um clique mostra o ano no mapa.</p>
        <AnnualChart data={d} onPick={(year) => setLayer({ year, month: null })} />
      </section>
    </>
  )
}

function Skeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 40 }} />
      <div className="skeleton" style={{ height: 260 }} />
      <div className="skeleton" style={{ height: 520 }} />
    </>
  )
}
