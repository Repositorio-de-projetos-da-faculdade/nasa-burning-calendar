import type { CalendarData } from './api'

/**
 * Months of the current year, before the current month, that came back as zero where the historical median is not zero:
 * that is an ingestion gap, not an absence of fire. With a gap, the year-to-date total is not comparable.
 */
export function missingMonths(d: CalendarData): number[] {
  const { year, month } = d.current
  const got = new Map(d.series.filter((c) => c.year === year).map((c) => [c.month, c.harmonized]))
  return d.climatology.filter((c) => c.month < month && c.median > 0 && !got.get(c.month)).map((c) => c.month)
}
