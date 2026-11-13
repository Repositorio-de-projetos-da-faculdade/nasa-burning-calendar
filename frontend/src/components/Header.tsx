import { Flame } from 'lucide-react'
import type { Region } from '../lib/api'
import { fmtDate } from '../lib/format'
import { RegionPicker } from './RegionPicker'

export function Header({ regions, value, onRegion, dataUntil }: {
  regions: Region[]
  value: string
  onRegion: (id: string) => void
  dataUntil?: string
}) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark"><Flame size={17} color="#140802" strokeWidth={2.5} /></div>
        <div className="brand-name">FireCal <span>Amazônia</span></div>
      </div>
      <RegionPicker regions={regions} value={value} onChange={onRegion} />
      <div className="header-meta">
        {dataUntil && (
          <span className="pill">
            <span className="live-dot" />
            Dados até {fmtDate(dataUntil)}
          </span>
        )}
        <span className="mono">NASA FIRMS · MODIS Aqua + VIIRS S-NPP</span>
      </div>
    </header>
  )
}
