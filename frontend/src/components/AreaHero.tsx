import type { AreaQuery, CalendarData } from '../lib/api'
import { fmt } from '../lib/format'
import { Embers } from './Embers'
import { ExportMenu } from './ExportMenu'

const KIND_LABEL: Record<string, string> = {
  biome: 'Bioma', state: 'Estado', municipality: 'Município', drawn: 'Área desenhada', point: 'Raio', bbox: 'Retângulo',
}

export function AreaHero({ d, query }: { d: CalendarData; query: AreaQuery }) {
  const slug = ('region' in query ? query.region : 'area').replace(/[^a-z0-9-]/gi, '_')
  const kind = KIND_LABEL[d.area.kind] ?? d.area.kind
  return (
    <div className="hero">
      <Embers />
      <div>
        <div className="eyebrow">
          Calendário de queimadas · {kind}
          {d.area.uf && d.area.kind === 'municipality' ? ` · ${d.area.uf}` : ''}
        </div>
        <h1 className="hero-title">{d.area.name}</h1>
        <div className="hero-sub mono num">
          <span>{fmt(d.area.area_km2)} km²</span>
          <span>{d.years[0]}–{d.years[d.years.length - 1]}</span>
          <span>{fmt(d.summary.total)} focos harmonizados</span>
        </div>
      </div>
      <ExportMenu area={query} slug={slug} defaultRange={{ start: `${d.data_until.slice(0, 4)}-01-01`, end: d.data_until }} />
    </div>
  )
}
