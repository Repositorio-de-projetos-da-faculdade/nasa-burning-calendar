import { Flame } from 'lucide-react'
import type { Region } from '../lib/api'
import { RegionPicker } from './RegionPicker'

export function TopBar({ regions, value, onRegion }: { regions: Region[]; value: string; onRegion: (id: string) => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><Flame size={16} color="#140802" strokeWidth={2.5} /></div>
        <div className="brand-name">FireCal <span>Amazônia</span></div>
      </div>
      <RegionPicker regions={regions} value={value} onChange={onRegion} />
    </header>
  )
}
