import { useRef, useState, type PointerEvent } from 'react'
import { inkOn, round, type Dancer, type Position, type Stage as StageT } from './model'

const R = 0.34 // dancer mark radius, metres
const MARGIN = 1.5 // wing space drawn around the stage, metres
export const SNAP = 0.5

export function MarkShape({ d, r = R }: { d: Dancer; r?: number }) {
  if (d.shape === 'square') return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.22} fill={d.color} />
  if (d.shape === 'triangle') return <polygon points={`0,${-r * 1.15} ${r * 1.08},${r * 0.82} ${-r * 1.08},${r * 0.82}`} fill={d.color} strokeLinejoin="round" />
  return <circle r={r} fill={d.color} />
}

/** Small standalone mark for lists. */
export function MarkIcon({ d }: { d: Dancer }) {
  return (
    <svg className="mark-icon" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
      <MarkShape d={d} r={0.42} />
      <text y="0.13" textAnchor="middle" fontSize={d.label.length > 2 ? 0.3 : 0.38} fontWeight="800" fill={inkOn(d.color)}>{d.label}</text>
    </svg>
  )
}

export function describe(p: Position): string {
  const side = p.x === 0 ? 'on centre' : `${Math.abs(p.x).toFixed(1)} m ${p.x < 0 ? 'left' : 'right'} of centre`
  return `${side}, ${p.y.toFixed(1)} m from front`
}

interface Props {
  stage: StageT
  dancers: Dancer[]
  positions: Record<string, Position>
  selected?: string[]
  onSelect?: (ids: string[]) => void
  /** Called once when a drag ends, with final positions for every moved dancer. */
  onMove?: (moves: Record<string, Position>) => void
  label?: string
}

type Drag = { mode: 'move' | 'marquee'; ids: string[]; from: Position; to: Position; moved: boolean }

export function StageView({ stage, dancers, positions, selected = [], onSelect, onMove, label }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  // The ref is read by handlers, so a fast down-move-up never sees a stale drag; the state copy drives rendering.
  const live = useRef<Drag | null>(null)
  const [drag, render] = useState<Drag | null>(null)
  const setDrag = (d: Drag | null) => { live.current = d; render(d) }
  const { width: w, depth: d, gridSize: g } = stage
  const interactive = !!onMove

  const at = (e: PointerEvent): Position => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: pt.x, y: d - pt.y }
  }

  const down = (e: PointerEvent, id?: string) => {
    if (!interactive || e.button !== 0) return
    e.stopPropagation()
    svg.current!.setPointerCapture(e.pointerId)
    const p = at(e)
    if (!id) return setDrag({ mode: 'marquee', ids: e.shiftKey ? selected : [], from: p, to: p, moved: false })
    const ids = e.shiftKey ? (selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]) : selected.includes(id) ? selected : [id]
    onSelect?.(ids)
    setDrag({ mode: 'move', ids, from: p, to: p, moved: false })
  }

  const move = (e: PointerEvent) => {
    const drag = live.current
    if (!drag) return
    const to = at(e)
    setDrag({ ...drag, to, moved: drag.moved || Math.hypot(to.x - drag.from.x, to.y - drag.from.y) > 0.08 })
  }

  const up = (e: PointerEvent) => {
    const drag = live.current
    if (!drag) return
    setDrag(null)
    if (drag.mode === 'marquee') {
      const [x0, x1] = [drag.from.x, drag.to.x].sort((a, b) => a - b)
      const [y0, y1] = [drag.from.y, drag.to.y].sort((a, b) => a - b)
      const hit = drag.moved ? dancers.filter(dn => { const p = positions[dn.id]; return p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 }).map(dn => dn.id) : []
      return onSelect?.([...new Set([...drag.ids, ...hit])])
    }
    if (!drag.moved) return
    const snap = (n: number) => (e.altKey ? round(n) : Math.round(n / SNAP) * SNAP)
    const moves: Record<string, Position> = {}
    for (const id of drag.ids) {
      const p = positions[id]
      if (p) moves[id] = { x: snap(p.x + drag.to.x - drag.from.x), y: snap(p.y + drag.to.y - drag.from.y) }
    }
    onMove?.(moves)
  }

  const dx = drag?.mode === 'move' ? drag.to.x - drag.from.x : 0
  const dy = drag?.mode === 'move' ? drag.to.y - drag.from.y : 0
  const lines = (n: number, step: number) => Array.from({ length: Math.floor(n / step) + 1 }, (_, i) => i * step)

  return (
    <svg
      ref={svg}
      className={`stage${interactive ? ' is-live' : ''}`}
      viewBox={`${-w / 2 - MARGIN} ${-MARGIN} ${w + MARGIN * 2} ${d + MARGIN * 2}`}
      role="group"
      aria-label={label ?? 'Stage, seen from above with the audience at the bottom'}
      onPointerDown={e => down(e)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      <rect className="stage-floor" x={-w / 2} y={0} width={w} height={d} rx={0.08} />
      <g className="stage-grid">
        {lines(w / 2, g).flatMap(x => (x ? [x, -x] : [0])).map(x => <line key={`x${x}`} x1={x} x2={x} y1={0} y2={d} />)}
        {lines(d, g).map(y => <line key={`y${y}`} x1={-w / 2} x2={w / 2} y1={d - y} y2={d - y} />)}
      </g>
      <line className="stage-centre" x1={0} x2={0} y1={0} y2={d} />
      <rect className="stage-edge" x={-w / 2} y={0} width={w} height={d} rx={0.08} />
      <text className="stage-front" x={0} y={d + 0.85} textAnchor="middle">AUDIENCE</text>

      {dancers.map(dn => {
        const p = positions[dn.id]
        if (!p) return null
        const sel = selected.includes(dn.id)
        const moving = sel && drag?.mode === 'move'
        const x = p.x + (moving ? dx : 0)
        const y = p.y + (moving ? dy : 0)
        return (
          <g
            key={dn.id}
            className={`dancer${sel ? ' is-selected' : ''}`}
            transform={`translate(${x} ${d - y})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? sel : undefined}
            aria-label={`${dn.name}, ${describe(p)}`}
            onPointerDown={e => down(e, dn.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect?.(e.shiftKey ? [...new Set([...selected, dn.id])] : [dn.id]) }
            }}
          >
            <circle className="dancer-halo" r={R + 0.2} />
            <g className="dancer-body"><MarkShape d={dn} /></g>
            <text y={0.115} textAnchor="middle" fontSize={dn.label.length > 2 ? 0.24 : 0.32} fill={inkOn(dn.color)}>{dn.label}</text>
          </g>
        )
      })}

      {drag?.mode === 'marquee' && drag.moved && (
        <rect className="stage-marquee" x={Math.min(drag.from.x, drag.to.x)} y={d - Math.max(drag.from.y, drag.to.y)} width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)} />
      )}
    </svg>
  )
}
