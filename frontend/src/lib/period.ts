import type { Layer } from '../components/MapPanel'
import { MONTHS } from './format'

/** Short name of the period shown on the map: "Sep 2007", "2007" or "Mean". */
export const periodLabel = (l: Layer) => (l.year == null ? 'Mean' : l.month == null ? String(l.year) : `${MONTHS[l.month - 1]} ${l.year}`)
