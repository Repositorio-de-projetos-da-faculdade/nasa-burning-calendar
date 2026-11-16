import type { Layer } from '../components/MapPanel'
import { MONTHS } from './format'

/** Nome curto do período mostrado no mapa: "Set 2007", "2007" ou "Média". */
export const periodLabel = (l: Layer) => (l.year == null ? 'Média' : l.month == null ? String(l.year) : `${MONTHS[l.month - 1]} ${l.year}`)
