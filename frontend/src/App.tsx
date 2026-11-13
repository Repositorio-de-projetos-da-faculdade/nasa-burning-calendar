import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { AnnualChart, SeasonChart, ValidationChart } from './components/Charts'
import { ExportMenu } from './components/ExportMenu'
import { type CalMode, FireCalendar } from './components/FireCalendar'
import { Kpis } from './components/Kpis'
import { type Layer, MapPanel } from './components/MapPanel'
import { RegionPicker } from './components/RegionPicker'
import { api, type AreaQuery, type CalendarData } from './lib/api'
import { fmt, fmtDate, fmtPct } from './lib/format'

type Area =
  | { kind: 'region'; id: string }
  | { kind: 'drawn'; geometry: GeoJSON.Geometry }
  | { kind: 'point'; lat: number; lon: number; r: number }

const KIND_LABEL: Record<string, string> = {
  biome: 'Bioma', state: 'Estado', municipality: 'Município', drawn: 'Área desenhada', point: 'Raio', bbox: 'Retângulo',
}

function toQuery(a: Area): AreaQuery {
  if (a.kind === 'region') return { region: a.id }
  if (a.kind === 'drawn') return { geometry: a.geometry }
  return { lat: a.lat, lon: a.lon, radius_km: a.r }
}

function circle(lat: number, lon: number, rKm: number): GeoJSON.Geometry {
  const pts: number[][] = []
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI
    pts.push([lon + (rKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(t), lat + (rKm / 111.32) * Math.sin(t)])
  }
  return { type: 'Polygon', coordinates: [pts] }
}

export default function App() {
  const [area, setArea] = useState<Area>({ kind: 'region', id: 'amazonia' })
  const [mode, setMode] = useState<CalMode>('count')
  const [layer, setLayer] = useState<Layer>({ year: null, month: null })
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null)

  const query = useMemo(() => toQuery(area), [area])
  const regions = useQuery({ queryKey: ['regions'], queryFn: api.regions, staleTime: Infinity })
  const cal = useQuery({ queryKey: ['calendar', query], queryFn: () => api.calendar(query), placeholderData: keepPreviousData })
  const validation = useQuery({ queryKey: ['validation'], queryFn: api.validation, staleTime: Infinity })
  const regionFeature = useQuery({
    queryKey: ['region', area.kind === 'region' ? area.id : null],
    queryFn: () => api.region((area as { id: string }).id),
    enabled: area.kind === 'region',
    staleTime: Infinity,
  })

  const selection: GeoJSON.Feature | null = useMemo(() => {
    if (area.kind === 'region') return regionFeature.data ?? null
    const geometry = area.kind === 'drawn' ? area.geometry : circle(area.lat, area.lon, area.r)
    return { type: 'Feature', properties: {}, geometry }
  }, [area, regionFeature.data])

  const onRegion = useCallback((id: string) => setArea({ kind: 'region', id }), [])
  const onDraw = useCallback((geometry: GeoJSON.Geometry) => setArea({ kind: 'drawn', geometry }), [])
  const onPoint = useCallback((lat: number, lon: number, r: number) => setArea({ kind: 'point', lat, lon, r }), [])

  const d = cal.data
  const yearRange: [number, number] = d ? [d.years[0], d.years[d.years.length - 1]] : [2002, new Date().getFullYear()]

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark"><Flame size={18} color="#1a0d05" strokeWidth={2.5} /></div>
          <div className="brand-name">FireCal <span>Amazônia</span></div>
        </div>
        <RegionPicker regions={regions.data ?? []} value={area.kind === 'region' ? area.id : ''} onChange={onRegion} />
        <div className="header-meta">
          {d && (
            <span className="pill">
              <span className="live-dot" />
              Dados até {fmtDate(d.data_until)}
            </span>
          )}
          <span>NASA FIRMS · MODIS Aqua + VIIRS S-NPP</span>
        </div>
      </header>

      <div className="main">
        <MapPanel
          selection={selection}
          layer={layer}
          setLayer={setLayer}
          yearRange={yearRange}
          onRegion={onRegion}
          onDraw={onDraw}
          onPoint={onPoint}
        />

        <main className="analytics" style={{ position: 'relative' }}>
          {cal.isFetching && <div className="loading-bar" />}
          <div className="analytics-inner">
            {cal.isError && <div className="error-box">Não foi possível calcular esta área: {cal.error.message}</div>}
            {!d && !cal.isError && <Skeleton />}
            {d && (
              <Dashboard
                d={d}
                query={query}
                mode={mode}
                setMode={setMode}
                selected={selected}
                onCell={(year, month) => {
                  setSelected({ year, month })
                  setLayer({ year, month })
                }}
                onYear={(year) => setLayer({ year, month: null })}
              />
            )}
            {validation.data && <MethodSection v={validation.data} />}
            <p className="footnote">
              Fonte: NASA FIRMS (MODIS C6.1 e VIIRS 375 m, Standard Processing + NRT). Limites: INPE/TerraBrasilis
              (PRODES). Focos de calor indicam fogo ativo no momento da passagem do satélite; nuvens e fumaça densa podem
              ocultar detecções.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

function Dashboard({ d, query, mode, setMode, selected, onCell, onYear }: {
  d: CalendarData
  query: AreaQuery
  mode: CalMode
  setMode: (m: CalMode) => void
  selected: { year: number; month: number } | null
  onCell: (y: number, m: number) => void
  onYear: (y: number) => void
}) {
  const slug = ('region' in query ? query.region : 'area').replace(/[^a-z0-9-]/gi, '_')
  const until = d.data_until
  const start = `${until.slice(0, 4)}-01-01`
  return (
    <>
      <div className="area-head">
        <div>
          <div className="eyebrow">Calendário de queimadas</div>
          <h1 className="area-title">{d.area.name}</h1>
          <div className="area-sub num">
            {KIND_LABEL[d.area.kind] ?? d.area.kind}
            {d.area.uf && d.area.kind === 'municipality' ? ` · ${d.area.uf}` : ''} · {fmt(d.area.area_km2)} km² ·{' '}
            {d.years[0]}–{d.years[d.years.length - 1]} · {fmt(d.summary.total)} focos harmonizados
          </div>
        </div>
        <ExportMenu area={query} slug={slug} defaultRange={{ start, end: until }} />
      </div>

      <Kpis data={d} />

      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Quando queima: focos por mês, {d.years[0]}–{d.years[d.years.length - 1]}</h2>
            <p className="section-desc">
              Cada célula é um mês. Uma única série consistente: VIIRS medido desde 2012 e MODIS convertido para a mesma
              escala antes disso. Clique em um mês para vê-lo no mapa.
            </p>
          </div>
          <div className="seg">
            <button data-active={mode === 'count'} onClick={() => setMode('count')}>Nº de focos</button>
            <button data-active={mode === 'anomaly'} onClick={() => setMode('anomaly')}>Anomalia</button>
          </div>
        </div>
        <FireCalendar data={d} mode={mode} selected={selected} onSelect={onCell} />
      </section>

      <div className="two-col">
        <section className="section">
          <div className="section-head">
            <div>
              <h2 className="section-title">{d.current.year} contra o histórico</h2>
              <p className="section-desc">
                Mês a mês, comparado à mediana e à faixa típica de {d.baseline[0]}–{d.baseline[1]}.
                {d.ytd.anomaly_pct != null && <> Acumulado no ano: <b className="num">{fmtPct(d.ytd.anomaly_pct)}</b>.</>}
              </p>
            </div>
          </div>
          <SeasonChart data={d} />
        </section>
        <section className="section">
          <div className="section-head">
            <div>
              <h2 className="section-title">Quais anos queimaram mais</h2>
              <p className="section-desc">Total anual harmonizado. Hachurado: anos MODIS convertidos. Clique para ver o ano no mapa.</p>
            </div>
          </div>
          <AnnualChart data={d} onPick={onYear} />
        </section>
      </div>
    </>
  )
}

function MethodSection({ v }: { v: import('./lib/api').ValidationData }) {
  const m = v.metrics
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <div className="eyebrow">Metodologia</div>
          <h2 className="section-title">Como MODIS e VIIRS viram uma série só</h2>
          <p className="section-desc">
            O VIIRS enxerga pixels de 375 m e detecta cerca de {m.ratio_viirs_modis?.toLocaleString('pt-BR')}× mais focos que o
            MODIS (1 km) no mesmo fogo. Sem harmonização, a série teria um salto falso em 2012.
          </p>
        </div>
      </div>
      <div className="steps">
        {[
          ['Filtrar', 'Só focos de vegetação com confiança nominal ou alta; fontes industriais e vulcânicas fora.'],
          ['Alinhar', 'Um satélite por sensor com o mesmo horário de passagem (~13h30): Aqua e S-NPP.'],
          ['Calibrar', `Fator VIIRS/MODIS por bloco de 2° e mês do ano, ajustado em ${v.calibration_years[0]}–${v.calibration_years[1]}.`],
          ['Converter', 'MODIS 2002–2011 × fator = focos equivalentes VIIRS. Daí em diante, VIIRS medido.'],
        ].map(([t, p], i) => (
          <div className="step" key={t}>
            <span className="step-n">0{i + 1}</span>
            <b>{t}</b>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <ValidationChart data={v} />
      <div className="metrics">
        <div className="metric"><span>Correlação mensal</span><b className="num">{m.corr_harmonized?.toFixed(2) ?? '—'}</b></div>
        <div className="metric"><span>Correlação fora da amostra</span><b className="num">{m.corr_out_of_sample?.toFixed(2) ?? '—'}</b></div>
        <div className="metric"><span>Viés MODIS bruto</span><b className="num">{fmtPct(m.bias_raw_pct)}</b></div>
        <div className="metric"><span>Viés após harmonizar</span><b className="num" style={{ color: 'var(--accent)' }}>{fmtPct(m.bias_harmonized_pct)}</b></div>
      </div>
    </section>
  )
}

function Skeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 70 }} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>
      <div className="skeleton" style={{ height: 560 }} />
    </>
  )
}
