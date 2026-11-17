import { useRef, useState, type PointerEvent } from 'react'
import { along, inkOn, round, shapePoints, unitOf, type Dancer, type Position, type Stage as StageT } from './model'

const R = 0.34 // dancer mark radius, metres
const MARGIN = 1.5 // wing space drawn around the stage, metres

export function MarkShape({ d, r = R }: { d: Dancer; r?: number }) {
  // In a list icon (any radius but the stage's) a prop is a small slab; on the stage it is its real size.
  if (d.prop) {
    const [w, h] = r === R ? [d.prop.w, d.prop.h] : [r * 2, r * 1.2]
    return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.06} fill={d.color} />
  }
  if (d.shape === 'square') return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.22} fill={d.color} />
  const pts = shapePoints(d.shape, r)
  return pts ? <polygon points={pts.map(q => q.join(',')).join(' ')} fill={d.color} strokeLinejoin="round" /> : <circle r={r} fill={d.color} />
}

/** Small standalone mark for lists. */
export function MarkIcon({ d }: { d: Dancer }) {
  return (
    <svg className="mark-icon" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
      <MarkShape d={d} r={0.42} />
      {!d.prop && <text y="0.13" textAnchor="middle" fontSize={d.label.length > 2 ? 0.3 : 0.38} fontWeight="800" fill={inkOn(d.color)}>{d.label}</text>}
    </svg>
  )
}

export function describe(p: Position, stage: StageT): string {
  const u = unitOf(stage)
  const side = p.x === 0 ? 'on centre' : `${(Math.abs(p.x) / u).toFixed(1)} ${stage.unit} ${p.x < 0 ? 'left' : 'right'} of centre`
  return `${side}, ${(p.y / u).toFixed(1)} ${stage.unit} from front${p.offstage ? ', offstage' : ''}`
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
  /** Where everyone stood in the previous formation; drawn as ghosts with a path to where they are now. */
  ghosts?: Record<string, Position>
  /** Where everyone goes next; drawn as faint outlines when paths are always shown. */
  next?: Record<string, Position>
  paths?: PathMode
  /** Called once when a path is bent or straightened (`via` undefined). */
  onBend?: (id: string, via: Position['via']) => void
  /** Seen from the back of the stage, the way the dancers face, instead of from the audience. */
  flip?: boolean
  /** Dancers to ring as crossing someone's path. */
  clash?: string[]
  /** Right-click on a dancer or prop, with where it happened. */
  onMenu?: (id: string, x: number, y: number) => void
}

export type PathMode = 'always' | 'selected' | 'never'

type Drag = { mode: 'move' | 'marquee' | 'bend'; ids: string[]; from: Position; to: Position; moved: boolean; /** One of several selected dancers, pressed without Shift: a plain click leaves only this one selected. */ hit?: string }

/** The control point that makes the curve from `a` to `b` pass through `m` at its midpoint; none if `m` is nearly on the straight line. */
function viaThrough(a: Position, b: Position, m: Position): Position['via'] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if (Math.hypot(m.x - mid.x, m.y - mid.y) < 0.25) return undefined
  return { x: round(2 * m.x - mid.x), y: round(2 * m.y - mid.y) }
}

export function StageView({ stage, dancers, positions, selected = [], onSelect, onMove, label, ghosts, next, paths = 'never', onBend, flip = false, clash = [], onMenu }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  // The ref is read by handlers, so a fast down-move-up never sees a stale drag; the state copy drives rendering.
  const live = useRef<Drag | null>(null)
  const [drag, render] = useState<Drag | null>(null)
  const setDrag = (d: Drag | null) => { live.current = d; render(d) }
  const { width: w, depth: d, gridSize: g } = stage
  const step = stage.snap ?? 0.5
  const interactive = !!onMove
  // Stage metres to drawing coordinates. Seen from the audience the front edge is at the bottom; flipped, it is at the top and left and right swap.
  const X = (x: number) => (flip ? -x : x)
  const Y = (y: number) => (flip ? y : d - y)
  const front = flip ? -1 : 1 // which way "towards the audience" points in the drawing

  const at = (e: PointerEvent): Position => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: X(pt.x), y: flip ? pt.y : d - pt.y }
  }

  const down = (e: PointerEvent, id?: string) => {
    if (!interactive || e.button !== 0) return
    e.stopPropagation()
    svg.current!.setPointerCapture(e.pointerId)
    const p = at(e)
    if (!id) return setDrag({ mode: 'marquee', ids: e.shiftKey ? selected : [], from: p, to: p, moved: false })
    const ids = e.shiftKey ? (selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]) : selected.includes(id) ? selected : [id]
    onSelect?.(ids)
    setDrag({ mode: 'move', ids, from: p, to: p, moved: false, hit: !e.shiftKey && ids.length > 1 ? id : undefined })
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
    if (drag.mode === 'bend') {
      const [id] = drag.ids
      if (drag.moved && ghosts?.[id] && positions[id]) onBend?.(id, viaThrough(ghosts[id], positions[id], drag.to))
      return
    }
    if (drag.mode === 'marquee') {
      const [x0, x1] = [drag.from.x, drag.to.x].sort((a, b) => a - b)
      const [y0, y1] = [drag.from.y, drag.to.y].sort((a, b) => a - b)
      const hit = drag.moved ? dancers.filter(dn => { const p = positions[dn.id]; return p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 }).map(dn => dn.id) : []
      return onSelect?.([...new Set([...drag.ids, ...hit])])
    }
    if (!drag.moved) { if (drag.hit) onSelect?.([drag.hit]); return }
    const snap = (n: number) => (e.altKey || !step ? round(n) : Math.round(n / step) * step)
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
  // Numbers along the front count out from centre: every metre, or every two feet as on a marked studio floor.
  const u = unitOf(stage)
  const every = stage.unit === 'ft' ? 2 * u : u

  return (
    <svg
      ref={svg}
      className={`stage${interactive ? ' is-live' : ''}`}
      viewBox={`${-w / 2 - MARGIN} ${-MARGIN} ${w + MARGIN * 2} ${d + MARGIN * 2}`}
      role="group"
      aria-label={label ?? `Stage, seen from above with the audience at the ${flip ? 'top' : 'bottom'}`}
      onPointerDown={e => down(e)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      <rect className="stage-floor" x={-w / 2} y={0} width={w} height={d} rx={0.08} />
      <g className="stage-grid">
        {lines(w / 2, g).flatMap(x => (x ? [x, -x] : [0])).map(x => <line key={`x${x}`} x1={x} x2={x} y1={0} y2={d} />)}
        {lines(d, g).map(y => <line key={`y${y}`} x1={-w / 2} x2={w / 2} y1={Y(y)} y2={Y(y)} />)}
      </g>
      <line className="stage-centre" x1={0} x2={0} y1={0} y2={d} />
      {stage.marks === 'quarters' && [-w / 4, w / 4].map(x => <line key={x} className="stage-centre stage-quarter" x1={x} x2={x} y1={0} y2={d} />)}
      <rect className="stage-edge" x={-w / 2} y={0} width={w} height={d} rx={0.08} />
      {stage.marks === 'numbers' && lines(w / 2, every).flatMap(x => (x ? [x, -x] : [0])).map(x => (
        <text key={x} className="stage-number" x={x} y={Y(0) + front * 0.34 + 0.08} textAnchor="middle">{Math.round(Math.abs(x) / u)}</text>
      ))}
      <text className="stage-front" x={0} y={Y(0) + front * 0.85 + (flip ? 0.2 : 0)} textAnchor="middle">AUDIENCE</text>

      {next && paths === 'always' && dancers.map(dn => next[dn.id] && !dn.prop && <circle key={dn.id} className="ghost-next" cx={X(next[dn.id].x)} cy={Y(next[dn.id].y)} r={R * 0.8} />)}
      {ghosts && paths !== 'never' && dancers.map(dn => {
        const a = ghosts[dn.id]
        const b = positions[dn.id]
        if (!a || !b || (paths === 'selected' && !selected.includes(dn.id)) || (a.x === b.x && a.y === b.y)) return null
        const via = drag?.mode === 'bend' && drag.ids[0] === dn.id ? viaThrough(a, b, drag.to) : b.via
        const mid = along(a, b, via, 0.5)
        return (
          <g key={dn.id} className="trail" style={{ color: dn.color }}>
            <path d={`M${X(a.x)} ${Y(a.y)} ${via ? `Q${X(via.x)} ${Y(via.y)}` : 'L'} ${X(b.x)} ${Y(b.y)}`} />
            {!dn.prop && <circle className="ghost" cx={X(a.x)} cy={Y(a.y)} r={R} />}
            {onBend && selected.includes(dn.id) && (
              <circle className="bend" cx={X(mid.x)} cy={Y(mid.y)} r={0.17}
                onPointerDown={e => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  svg.current!.setPointerCapture(e.pointerId)
                  const p = at(e)
                  setDrag({ mode: 'bend', ids: [dn.id], from: p, to: p, moved: false })
                }}
                onDoubleClick={() => onBend(dn.id, undefined)}>
                <title>Drag to curve this path. Double-click to straighten it.</title>
              </circle>
            )}
          </g>
        )
      })}

      {/* Props are drawn first, so dancers stand on top of them. */}
      {[...dancers].sort((a, b) => +!!b.prop - +!!a.prop).map(dn => {
        const p = positions[dn.id]
        if (!p) return null
        const sel = selected.includes(dn.id)
        const moving = sel && drag?.mode === 'move'
        const x = p.x + (moving ? dx : 0)
        const y = p.y + (moving ? dy : 0)
        return (
          <g
            key={dn.id}
            className={`dancer${sel ? ' is-selected' : ''}${p.offstage ? ' is-off' : ''}${clash.includes(dn.id) ? ' is-clash' : ''}${dn.prop ? ' is-prop' : ''}`}
            transform={`translate(${X(x)} ${Y(y)})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? sel : undefined}
            aria-label={`${dn.name}, ${describe(p, stage)}`}
            onPointerDown={e => down(e, dn.id)}
            onContextMenu={onMenu ? e => { e.preventDefault(); onMenu(dn.id, e.clientX, e.clientY) } : undefined}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect?.(e.shiftKey ? [...new Set([...selected, dn.id])] : [dn.id]) }
            }}
          >
            {dn.prop
              ? <rect className="dancer-halo" x={-dn.prop.w / 2 - 0.15} y={-dn.prop.h / 2 - 0.15} width={dn.prop.w + 0.3} height={dn.prop.h + 0.3} rx={0.12} />
              : <circle className="dancer-halo" r={R + 0.2} />}
            <g className="dancer-body"><MarkShape d={dn} /></g>
            <text y={dn.prop ? 0.09 : 0.115} textAnchor="middle" fontSize={dn.prop ? 0.24 : dn.label.length > 2 ? 0.24 : 0.32} fill={inkOn(dn.color)}>{dn.prop ? dn.name : dn.label}</text>
          </g>
        )
      })}

      {drag?.mode === 'marquee' && drag.moved && (
        <rect className="stage-marquee" x={Math.min(X(drag.from.x), X(drag.to.x))} y={Math.min(Y(drag.from.y), Y(drag.to.y))} width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)} />
      )}
    </svg>
  )
}
