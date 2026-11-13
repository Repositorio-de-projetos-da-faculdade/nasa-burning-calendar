import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type CalendarData, gridQuery } from './api'

const PARALLEL = 6

/**
 * Baixa em segundo plano o mapa de todos os meses e anos, começando pelos mais próximos do período atual.
 * Com tudo em memória, arrastar a linha do tempo não espera a rede. Devolve o progresso (0..1).
 */
export function usePreloadGrids(d: CalendarData, year: number | null) {
  const qc = useQueryClient()
  const [done, setDone] = useState(0)
  // o ano do momento serve só para ordenar a fila; mudar de ano não a reinicia
  const near = useRef(year)
  useEffect(() => {
    near.current = year
  })

  const [y0, yN] = [d.years[0], d.years[d.years.length - 1]]
  const until = d.data_until
  // os períodos são os mesmos para qualquer área: a fila só é montada uma vez
  const all = useMemo(() => {
    const [yEnd, mEnd] = until.split('-').map(Number)
    const list: { year: number; month: number | null }[] = []
    for (let y = y0; y <= yN; y++) {
      list.push({ year: y, month: null })
      for (let m = 1; m <= 12; m++) if (y < yEnd || m <= mEnd) list.push({ year: y, month: m })
    }
    return list
  }, [y0, yN, until])

  useEffect(() => {
    const queue = [...all]
    let cancelled = false
    const worker = async () => {
      while (queue.length && !cancelled) {
        // o próximo é sempre o mais perto de onde a pessoa está agora
        const ref = near.current ?? yN
        let best = 0
        for (let i = 1; i < queue.length; i++) if (Math.abs(queue[i].year - ref) < Math.abs(queue[best].year - ref)) best = i
        await qc.prefetchQuery(gridQuery(queue.splice(best, 1)[0]))
        if (!cancelled) setDone((n) => n + 1)
      }
    }
    for (let i = 0; i < PARALLEL; i++) void worker()
    return () => {
      cancelled = true
    }
  }, [qc, all, yN])

  return Math.min(1, done / all.length)
}
