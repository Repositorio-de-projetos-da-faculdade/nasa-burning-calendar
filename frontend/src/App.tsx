import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { AreaHero } from './components/AreaHero'
import { AnnualChart, SeasonChart } from './components/Charts'
import { type CalMode, FireCalendar } from './components/FireCalendar'
import { Header } from './components/Header'
import { Kpis } from './components/Kpis'
import { type Layer, MapPanel } from './components/MapPanel'
import { MethodSection } from './components/MethodSection'
import { api, type AreaQuery, type CalendarData } from './lib/api'
import { fmtPct } from './lib/format'

type Area =
  | { kind: 'region'; id: string }
  | { kind: 'drawn'; geometry: GeoJSON.Geometry }
  | { kind: 'point'; lat: number; lon: number; r: number }

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
      <Header regions={regions.data ?? []} value={area.kind === 'region' ? area.id : ''} onRegion={onRegion} dataUntil={d?.data_until} />

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

        <main className="analytics">
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
  const span = `${d.years[0]}–${d.years[d.years.length - 1]}`
  return (
    <>
      <AreaHero d={d} query={query} />
      <Kpis data={d} />

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Calendário</div>
            <h2 className="section-title">Quando queima: focos por mês, {span}</h2>
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
              <div className="eyebrow">Ano corrente</div>
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
              <div className="eyebrow">Ranking</div>
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

function Skeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 150, marginTop: 44 }} />
      <div className="skeleton" style={{ height: 170 }} />
      <div className="skeleton" style={{ height: 620 }} />
    </>
  )
}
