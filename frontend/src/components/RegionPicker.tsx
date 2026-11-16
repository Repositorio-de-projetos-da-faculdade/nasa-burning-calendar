import { Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Region } from '../lib/api'

const KIND_LABEL = { biome: 'Biome', state: 'States', municipality: 'Municipalities' } as const
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function RegionPicker({ regions, value, onChange }: {
  regions: Region[]
  value: string
  onChange: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const nq = norm(q.trim())
    const match = regions.filter((r) => !nq || norm(r.name).includes(nq) || (r.state && norm(r.state) === nq))
    const order = { biome: 0, state: 1, municipality: 2 }
    return match
      .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'en'))
      .slice(0, nq ? 60 : 14)
  }, [q, regions])

  const choose = (r: Region) => {
    onChange(r.id)
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className="picker">
      <Search size={16} className="picker-icon" />
      <input
        ref={input}
        className="picker-input"
        placeholder={value ? 'Search an Amazon municipality or state…' : 'Search…'}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter' && results[active]) choose(results[active])
          else if (e.key === 'Escape') setOpen(false)
        }}
        role="combobox"
        aria-expanded={open}
        aria-label="Search region"
      />
      {open && results.length > 0 && (
        <div className="picker-list" role="listbox">
          {results.map((r, i) => (
            <div key={r.id}>
              {(i === 0 || results[i - 1].kind !== r.kind) && <div className="picker-group">{KIND_LABEL[r.kind]}</div>}
              <div
                className="picker-item"
                data-active={i === active}
                role="option"
                aria-selected={r.id === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(r)
                }}
              >
                <span>{r.name}</span>
                <small>{r.kind === 'municipality' ? r.state : r.kind === 'state' ? r.state : ''}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
