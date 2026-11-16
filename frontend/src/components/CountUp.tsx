import { useEffect, useRef, useState } from 'react'
import { fmt } from '../lib/format'

/** A number that "counts up" to the value when it changes. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value)
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 250)
      setShown(a + (value - a) * (1 - (1 - t) ** 3))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    from.current = value
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{fmt(shown)}</>
}
