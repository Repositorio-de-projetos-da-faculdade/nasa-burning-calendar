import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type CalendarData, gridQuery } from './api'

const PARALLEL = 6

/**
 * Downloads the map of every month and year in the background, starting with the ones closest to the current period.
 * With everything in memory, scrubbing the timeline never waits for the network. Returns the progress (0..1).
 */
export function usePreloadGrids(d: CalendarData, year: number | null) {
  const qc = useQueryClient()
  const [done, setDone] = useState(0)
  // the current year only orders the queue; changing years does not restart it
  const near = useRef(year)
  useEffect(() => {
    near.current = year
  })

  const [y0, yN] = [d.years[0], d.years[d.years.length - 1]]
  const until = d.data_until
  // the periods are the same for any area: the queue is built only once
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
        // the next one is always the closest to where the user is now
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
