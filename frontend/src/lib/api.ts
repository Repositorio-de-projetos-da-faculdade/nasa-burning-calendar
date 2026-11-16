export type AreaQuery =
  | { region: string }
  | { geometry: GeoJSON.Geometry }
  | { lat: number; lon: number; radius_km: number }

export interface Region {
  id: string
  name: string
  kind: 'biome' | 'state' | 'municipality'
  state: string | null
  bbox: [number, number, number, number]
}

export interface MonthCell {
  year: number
  month: number
  harmonized: number
  modis_raw: number
  viirs_raw: number
  source: 'VIIRS' | 'MODIS→VIIRS'
  partial: boolean
  anomaly_pct: number | null
  anomaly_iqr: number | null
}

export interface Climatology {
  month: number
  median: number
  p25: number
  p75: number
  max: number
  max_year: number | null
}

export interface AnnualTotal {
  year: number
  total: number
  months: number
  partial: boolean
  converted: boolean
}

export interface CalendarData {
  area: { name: string; kind: string; state?: string | null; area_km2: number; bbox: number[] }
  data_from: string
  data_until: string
  baseline: [number, number]
  years: number[]
  series: MonthCell[]
  climatology: Climatology[]
  annual: AnnualTotal[]
  current: { year: number; month: number; day: number; value: number; expected: number; anomaly_pct: number | null }
  ytd: { year: number; value: number; expected: number; anomaly_pct: number | null; rank: number; of: number }
  summary: {
    total: number
    peak_year: number | null
    peak_year_total: number | null
    record_month: { year: number; month: number; value: number }
    critical_months: number[]
    fire_season_months: number[]
    season_share: number
  }
  unit: string
}

export interface GridData {
  /** Cells in sequence: lon, lat, hotspots, lon, lat, hotspots… Compact because the whole history stays in memory. */
  cells: Float32Array
  p95: number
  max: number
  per_year_mean: boolean
}

export interface ValidationData {
  rows: { year: number; month: number; modis_raw: number; viirs_raw: number; modis_harmonized: number }[]
  calibration_years: [number, number]
  metrics: {
    corr_harmonized: number | null
    corr_out_of_sample: number | null
    bias_raw_pct: number | null
    bias_harmonized_pct: number | null
    bias_out_of_sample_pct: number | null
    ratio_viirs_modis: number | null
  }
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? r.statusText)
  return r.json()
}

const post = <T,>(path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
    (r) => json<T>(r),
  )
const get = <T,>(path: string) => fetch(path).then((r) => json<T>(r))

/** Version of the data on the server. It goes in the map URL: with the same version the browser uses its local copy, with another it downloads again. */
const version = get<{ version: string }>('/api/version').then((v) => v.version, () => '')

export const api = {
  regions: () => get<Region[]>('/api/regions'),
  outlines: () => get<GeoJSON.FeatureCollection>('/api/regions/outlines'),
  region: (id: string) => get<GeoJSON.Feature>(`/api/regions/${id}`),
  regionAt: (lon: number, lat: number) => get<Region>(`/api/regions/at?lon=${lon}&lat=${lat}`),
  calendar: (q: AreaQuery) => post<CalendarData>('/api/calendar', q),
  grid: async (year: number | null, month: number | null): Promise<GridData> => {
    const d = await get<Omit<GridData, 'cells'> & { cells: number[][] }>(`/api/grid?v=${await version}${year ? `&year=${year}` : ''}${month ? `&month=${month}` : ''}`)
    return { ...d, cells: Float32Array.from(d.cells.flat()) }
  },
  validation: () => get<ValidationData>('/api/validation'),
}

export async function download(path: string, body: unknown, filename: string) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(r.statusText)
  const url = URL.createObjectURL(await r.blob())
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Map layer query for a period (the same key in the map, the timeline and the preloads). */
export const gridQuery = (l: { year: number | null; month: number | null }) => ({
  queryKey: ['grid', l.year, l.month],
  queryFn: () => api.grid(l.year, l.month),
  // the history does not change during the session: once downloaded, it stays
  staleTime: Infinity,
  gcTime: Infinity,
})
