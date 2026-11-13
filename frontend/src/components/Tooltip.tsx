import { type ReactNode, useCallback, useState } from 'react'

export interface TipState {
  x: number
  y: number
  content: ReactNode
}

export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: e.clientX, y: e.clientY, content })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  return { tip, show, hide }
}

export function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  const flipX = tip.x > window.innerWidth - 260
  const flipY = tip.y > window.innerHeight - 200
  return (
    <div
      className="tip"
      role="tooltip"
      style={{
        left: flipX ? undefined : tip.x + 14,
        right: flipX ? window.innerWidth - tip.x + 14 : undefined,
        top: flipY ? undefined : tip.y + 14,
        bottom: flipY ? window.innerHeight - tip.y + 14 : undefined,
      }}
    >
      {tip.content}
    </div>
  )
}
