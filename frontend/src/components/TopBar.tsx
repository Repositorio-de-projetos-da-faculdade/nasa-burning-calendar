import type { Region } from '../lib/api'
import { RegionPicker } from './RegionPicker'

export function TopBar({ regions, value, onRegion }: { regions: Region[]; value: string; onRegion: (id: string) => void }) {
  return (
    <header className="widget topbar">
      <div className="brand">
        <i className="brand-mark" aria-hidden="true" />
        <div className="brand-name">FireCal <span>Amazônia</span></div>
      </div>
      <RegionPicker regions={regions} value={value} onChange={onRegion} />
    </header>
  )
}
