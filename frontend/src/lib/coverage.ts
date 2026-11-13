import type { CalendarData } from './api'

/**
 * Meses do ano corrente, anteriores ao mês atual, que vieram zerados onde a mediana histórica não é zero:
 * é lacuna de ingestão, não ausência de fogo. Com lacuna, o acumulado do ano não é comparável.
 */
export function missingMonths(d: CalendarData): number[] {
  const { year, month } = d.current
  const got = new Map(d.series.filter((c) => c.year === year).map((c) => [c.month, c.harmonized]))
  return d.climatology.filter((c) => c.month < month && c.median > 0 && !got.get(c.month)).map((c) => c.month)
}
