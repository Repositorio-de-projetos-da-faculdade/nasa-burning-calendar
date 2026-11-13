import type { UseQueryResult } from '@tanstack/react-query'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useState } from 'react'
import type { AreaQuery, CalendarData, ValidationData } from '../lib/api'
import { fmt, fmtDate, fmtPct } from '../lib/format'
import { AnnualChart, SeasonChart } from './Charts'
import { ExportMenu } from './ExportMenu'
import { type CalMode, FireCalendar } from './FireCalendar'
import { Kpis } from './Kpis'
import type { Layer } from './MapPanel'
import { MethodSection } from './MethodSection'
import { RankList } from './RankList'

const KIND_LABEL: Record<string, string> = {
  biome: 'Bioma', state: 'Estado', municipality: 'Município', drawn: 'Área desenhada', point: 'Raio', bbox: 'Retângulo',
}

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'anos', label: 'Anos' },
  { id: 'metodo', label: 'Método' },
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

/** Coluna de widgets de análise, flutuando sobre o mapa: uma aba por pergunta. */
export function Dossier({ cal, validation, query, mode, setMode, layer, setLayer, open, setOpen }: Props) {
  // a aba inicial pode vir do link (#calendario, #anos, #metodo)
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'resumo')
  const d = cal.data
  const Icon = open ? PanelRightClose : PanelRightOpen
  const slug = ('region' in query ? query.region : 'area').replace(/[^a-z0-9-]/gi, '_')
  return (
    <>
      <button className="widget panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="dossier">
        <Icon size={15} /> {open ? 'Só o mapa' : 'Abrir análise'}
      </button>
      <main className="panel" id="dossier" inert={!open}>
        <div className="widget panel-top">
          {cal.isFetching && <div className="loading-bar" />}
          <div className="panel-head">
            <div className="panel-meta num">
              {d && (
                <>
                  <b>{KIND_LABEL[d.area.kind] ?? d.area.kind}{d.area.uf && d.area.kind === 'municipality' ? `, ${d.area.uf}` : ''} · {fmt(d.area.area_km2)} km²</b>
                  <span>Dados até {fmtDate(d.data_until)}</span>
                </>
              )}
            </div>
            {d && <ExportMenu area={query} slug={slug} defaultRange={{ start: `${d.data_until.slice(0, 4)}-01-01`, end: d.data_until }} />}
          </div>
          <div className="tabs" role="tablist" aria-label="Análise da área">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* key: troca de aba refaz a entrada em cascata dos widgets */}
        <div className="panel-stack" role="tabpanel" key={tab}>
          {cal.isError && <div className="widget error-box">Não foi possível calcular esta área: {cal.error.message}</div>}
          {!d && !cal.isError && <div className="widget skeleton" />}
          {d && tab === 'resumo' && <Resumo d={d} />}
          {d && tab === 'calendario' && <Calendario d={d} mode={mode} setMode={setMode} layer={layer} setLayer={setLayer} />}
          {d && tab === 'anos' && <Anos d={d} layer={layer} setLayer={setLayer} />}
          {tab === 'metodo' && validation && <MethodSection v={validation} />}
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

function Resumo({ d }: { d: CalendarData }) {
  return (
    <>
      <Kpis data={d} />
      <section className="widget">
        <h2 className="w-title">{d.current.year} contra o histórico</h2>
        <p className="w-desc">
          Comparado à mediana e à faixa típica de {d.baseline[0]} a {d.baseline[1]}.
          {d.ytd.anomaly_pct != null && <> Acumulado no ano: <b className="num">{fmtPct(d.ytd.anomaly_pct)}</b>.</>}
        </p>
        <SeasonChart data={d} />
      </section>
    </>
  )
}

type Period = Pick<Props, 'layer' | 'setLayer'> & { d: CalendarData }

function Calendario({ d, mode, setMode, layer, setLayer }: Period & Pick<Props, 'mode' | 'setMode'>) {
  const selected = layer.year != null && layer.month != null ? { year: layer.year, month: layer.month } : null
  return (
    <section className="widget">
      <div className="w-head">
        <h2 className="w-title">Quando queima, mês a mês</h2>
        <div className="seg">
          <button data-active={mode === 'count'} onClick={() => setMode('count')}>Focos</button>
          <button data-active={mode === 'anomaly'} onClick={() => setMode('anomaly')}>Anomalia</button>
        </div>
      </div>
      <p className="w-desc">
        Cada quadrado é um mês; quanto maior, mais focos. VIIRS medido desde 2012, MODIS convertido para a mesma escala
        antes disso. Um clique leva o mapa para aquele mês.
      </p>
      <FireCalendar data={d} mode={mode} selected={selected} onSelect={(year, month) => setLayer({ year, month })} />
    </section>
  )
}

function Anos({ d, layer, setLayer }: Period) {
  const pick = (year: number) => setLayer({ year, month: null })
  return (
    <>
      <section className="widget">
        <h2 className="w-title">Os anos que mais queimaram</h2>
        <p className="w-desc">Total anual harmonizado; hachurados são os anos MODIS convertidos. Um clique mostra o ano no mapa.</p>
        <AnnualChart data={d} onPick={pick} />
      </section>
      <section className="widget">
        <h2 className="w-title">Os seis maiores</h2>
        <RankList data={d} active={layer.month == null ? layer.year : null} onPick={pick} />
      </section>
    </>
  )
}
