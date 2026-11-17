// Positions are in metres: x from the centre line (left negative, audience view),
// y from the front edge of the stage (upstage positive).
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon'

export interface Dancer {
  id: string
  name: string
  label: string
  color: string
  shape: Shape
  /** Set on a prop (a box, a riser, a chair): its size in metres. Props sit in the dancer list so they move, animate and print like everyone else. */
  prop?: { w: number; h: number }
}

export interface Position {
  x: number
  y: number
  offstage?: boolean
  /** Bends the path into this position: the control point of a quadratic curve from the previous formation. */
  via?: { x: number; y: number }
}

export interface Formation {
  id: string
  name: string
  color?: string
  /** Seconds held in this formation. */
  hold: number
  /** Seconds taken to travel here from the previous formation (on the first, a lead-in where everyone waits in place). */
  transition: number
  note?: string
  positions: Record<string, Position>
}

export interface Stage {
  width: number
  depth: number
  /** What lengths are shown in. Positions are stored in metres either way. */
  unit: 'm' | 'ft'
  /** Metres between grid lines. */
  gridSize: number
  /** Metres dancers snap to when dragged; 0 turns snapping off. Half a metre when not set. */
  snap?: number
  /** Extra floor markings on top of the centre line. */
  marks?: 'quarters' | 'numbers'
}

export interface Project {
  /** File format version, bumped on breaking changes. */
  version: 2
  id: string
  name: string
  stage: Stage
  dancers: Dancer[]
  formations: Formation[]
  /** Tempo of the optional beat grid. */
  bpm: number
  /** How lengths are shown and typed: seconds (the default), or counts at `bpm`. They are stored in seconds either way. */
  timeUnit?: 'seconds' | 'counts'
  /** Counts in one bar: 8 unless set, 6 for a waltz counted in sixes, and so on. */
  countsPerBar?: number
  /** Lengths, in seconds, a new formation starts with. */
  defaults?: { hold: number; transition: number }
  /** Seconds into the timeline where beat one of the grid falls. */
  beatOffset?: number
  /** The song itself is stored beside the project, never inside it. */
  audio?: {
    name: string
    duration: number
    /** A song file whose waveform is drawn in place of the video's own sound, and how many seconds into the video that song starts. */
    wave?: { name: string; offset: number }
  }
  archived?: boolean
  createdAt: number
  updatedAt: number
}

/** Eight standard colours, for dancers and props alike; the colour picker offers any other. */
export const DANCER_COLORS = ['#ffb000', '#ff7fb0', '#00c2c2', '#8fd14f', '#b79bff', '#ff8a4c', '#5aa9ff', '#17171a']
export const PROP_COLOR = '#8a8f98'
export const FT = 0.3048
/** Metres in one of the stage's own units. */
export const unitOf = (stage: Stage) => (stage.unit === 'ft' ? FT : 1)
export const isPerson = (d: Dancer) => !d.prop
/** Lighting colours a formation can take; the stage is washed in the current one. */
export const GELS = [
  { name: 'Fire', hex: '#d63a1c' },
  { name: 'Indigo', hex: '#3a22b8' },
  { name: 'Peacock', hex: '#007f80' },
  { name: 'Rose', hex: '#cf2468' },
  { name: 'Amber', hex: '#ffb000' },
  { name: 'Moss', hex: '#3f7d24' },
  { name: 'Violet', hex: '#7d33c7' },
  { name: 'Steel', hex: '#2f64ad' },
]

export const gelOf = (f: Formation, i: number) => f.color ?? GELS[i % GELS.length].hex
export const gelName = (hex: string) => GELS.find(g => g.hex === hex)?.name ?? 'Custom'

/** Black or white, whichever reads better on `hex`. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#17171a' : '#ffffff'
}

export const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond', 'hexagon']

/** Corners of a mark of radius `r`, y pointing down; none for a circle. Shared by the stage drawing and the video. */
/** A prop's outline, stretched to fill its width and depth; null for an oval, which is drawn as an ellipse. */
export function propPoints(shape: Shape, w: number, h: number): [number, number][] | null {
  const pts = shapePoints(shape, 1)
  if (!pts) return null
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return pts.map(([x, y]) => [((x - x0) / (x1 - x0) - 0.5) * w, ((y - y0) / (y1 - y0) - 0.5) * h])
}

/** What each shape is called on a prop, where a square is any rectangle and a circle any oval. */
export const PROP_SHAPE_NAMES: Record<Shape, string> = { square: 'Rectangle', circle: 'Oval', triangle: 'Triangle', diamond: 'Diamond', hexagon: 'Hexagon' }

export function shapePoints(shape: Shape, r: number): [number, number][] | null {
  if (shape === 'square') return [[-r, -r], [r, -r], [r, r], [-r, r]]
  if (shape === 'triangle') return [[0, -r * 1.15], [r * 1.08, r * 0.82], [-r * 1.08, r * 0.82]]
  if (shape === 'diamond') return [[0, -r * 1.25], [r * 1.25, 0], [0, r * 1.25], [-r * 1.25, 0]]
  if (shape === 'hexagon') return Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3) * r * 1.1, Math.sin((k * Math.PI) / 3) * r * 1.1])
  return null
}

export const uid = () => crypto.randomUUID()

/** A, B … Z, AA, AB … so labels stay unique past 26 dancers. */
export function labelFor(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

export function newDancer(i: number): Dancer {
  return {
    id: uid(),
    name: `Dancer ${i + 1}`,
    label: labelFor(i),
    color: DANCER_COLORS[i % DANCER_COLORS.length],
    // Shape cycles with each pass through the palette, so colour is never the only cue.
    shape: SHAPES[Math.floor(i / DANCER_COLORS.length) % SHAPES.length],
  }
}

/** Evenly spaced rows across the stage, at most `perRow` per row, front row first. */
export function lineUp(ids: string[], stage: Stage, perRow = 10): Record<string, Position> {
  const rows = Math.ceil(ids.length / perRow) || 1
  const out: Record<string, Position> = {}
  ids.forEach((id, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, ids.length - row * perRow)
    const col = i % perRow
    out[id] = {
      x: round(((col + 0.5) / inRow - 0.5) * stage.width * 0.8),
      y: round((stage.depth * (row + 1)) / (rows + 1)),
    }
  })
  return out
}

export const round = (n: number) => Math.round(n * 100) / 100

type Timing = Pick<Project, 'bpm' | 'timeUnit'>

/** A length in the routine's own unit: "4.00 s" or "8 counts". */
export function span(p: Timing, secs: number): string {
  if (p.timeUnit !== 'counts') return `${secs.toFixed(secs < 10 ? 2 : 1)} s`
  const n = +((secs * p.bpm) / 60).toFixed(2)
  return `${n} ${n === 1 ? 'count' : 'counts'}`
}

/** Rounds a length for storing. Counts keep finer precision, so 8 counts at an awkward tempo still reads back as 8. */
export const tidy = (p: Timing, secs: number) => (p.timeUnit === 'counts' ? Math.round(secs * 1e4) / 1e4 : round(secs))

/** How far outside the stage a dancer may stand, in metres. Less than the margin drawn around the stage, so nobody is ever out of sight. */
export const WINGS = 1

/** Puts `q` at `to`, pulled back inside the stage and its wings. */
export function place(stage: Stage, q: Position, to: { x: number; y: number }) {
  q.x = round(Math.max(-stage.width / 2 - WINGS, Math.min(stage.width / 2 + WINGS, to.x)))
  q.y = round(Math.max(-WINGS, Math.min(stage.depth + WINGS, to.y)))
}

export function newProject(name: string, dancerCount: number, stage: Partial<Stage> = {}): Project {
  const s: Stage = { width: 10, depth: 8, unit: 'm', gridSize: 1, ...stage }
  const dancers = Array.from({ length: dancerCount }, (_, i) => newDancer(i))
  const now = Date.now()
  return {
    version: 2,
    id: uid(),
    name,
    stage: s,
    dancers,
    formations: [{ id: uid(), name: '', color: GELS[0].hex, hold: 4, transition: 0, positions: lineUp(dancers.map(d => d.id), s) }],
    bpm: 120,
    createdAt: now,
    updatedAt: now,
  }
}

/** Lengths a new formation starts with: the routine's own, or 4 s and 2 s (8 and 4 counts when timing in counts). */
export function newLengths(p: Project): { hold: number; transition: number } {
  if (p.defaults) return p.defaults
  const beat = p.timeUnit === 'counts' ? 60 / p.bpm : 0.5
  return { hold: tidy(p, 8 * beat), transition: tidy(p, 4 * beat) }
}

export type Preset = 'line' | 'rows' | 'circle' | 'v' | 'pyramid' | 'block'
type Point = { x: number; y: number }

export const centroid = (pts: Point[]): Point => ({
  x: pts.reduce((s, q) => s + q.x, 0) / (pts.length || 1),
  y: pts.reduce((s, q) => s + q.y, 0) / (pts.length || 1),
})

/** Spots for `n` dancers in a named shape, `gap` metres apart, centred on 0,0. The pyramid and the V point at the audience. */
export function presetShape(kind: Preset, n: number, gap = 1): Point[] {
  const cols = Math.ceil(Math.sqrt(n))
  const front = Math.ceil(n / 2)
  const pts = Array.from({ length: n }, (_, i): Point => {
    if (kind === 'line') return { x: i * gap, y: 0 }
    if (kind === 'rows') return i < front ? { x: i * gap, y: 0 } : { x: (i - front + 0.5) * gap, y: gap }
    if (kind === 'block') return { x: (i % cols) * gap, y: Math.floor(i / cols) * gap }
    if (kind === 'circle') {
      const r = Math.max(gap, (n * gap) / (2 * Math.PI))
      return { x: Math.sin((i / n) * 2 * Math.PI) * r, y: -Math.cos((i / n) * 2 * Math.PI) * r }
    }
    if (kind === 'v') {
      const k = Math.ceil(i / 2)
      return { x: (i % 2 ? -1 : 1) * k * gap * 0.75, y: k * gap * 0.75 }
    }
    // Pyramid: rows of 1, 2, 3 … going upstage.
    const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2)
    return { x: (i - (row * (row + 1)) / 2 - row / 2) * gap, y: row * gap * 0.85 }
  })
  const c = centroid(pts)
  return pts.map(q => ({ x: round(q.x - c.x), y: round(q.y - c.y) }))
}

/** Pairs who come within `near` metres of each other on the way from `prev` to `cur`, closer than they stand at either end. */
export function clashes(prev: Record<string, Position>, cur: Record<string, Position>, ids: string[], near = 0.5): [string, string][] {
  const moving = ids.filter(id => prev[id] && cur[id] && !prev[id].offstage && !cur[id].offstage)
  const at = (id: string, t: number) => along(prev[id], cur[id], prev[id].x === cur[id].x && prev[id].y === cur[id].y ? undefined : cur[id].via, t)
  const gap = (a: string, b: string, t: number) => { const p = at(a, t), q = at(b, t); return Math.hypot(p.x - q.x, p.y - q.y) }
  const out: [string, string][] = []
  for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) {
    const [a, b] = [moving[i], moving[j]]
    const ends = Math.min(gap(a, b, 0), gap(a, b, 1))
    for (let k = 1; k < 20; k++) if (gap(a, b, k / 20) < Math.min(near, ends - 0.05)) { out.push([a, b]); break }
  }
  return out
}

/** How a formation is shown: its own name with "Formation N" beneath, or just "Formation N" when it has none. */
export function formationLabel(f: Formation, i: number): { title: string; sub: string } {
  const auto = `Formation ${i + 1}`
  const own = (f.name ?? '').trim()
  // Names like "Formation 3" used to be filled in automatically; they count as unnamed so the number follows the order.
  return own && !/^Formation \d+$/.test(own) ? { title: own, sub: auto } : { title: auto, sub: '' }
}

/** Start time, in seconds, of each formation's hold. */
export function startTimes(formations: Formation[]): number[] {
  let t = 0
  return formations.map(f => {
    t += f.transition
    const start = t
    t += f.hold
    return start
  })
}

export function totalTime(formations: Formation[]): number {
  return formations.reduce((t, f) => t + f.hold + f.transition, 0)
}

/** The point a fraction `t` of the way from `a` to `b`, along a straight line or the curve bent through `via`. */
export function along(a: Position, b: Position, via: Position['via'], t: number): { x: number; y: number } {
  if (!via) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  const u = 1 - t
  return { x: u * u * a.x + 2 * u * t * via.x + t * t * b.x, y: u * u * a.y + 2 * u * t * via.y + t * t * b.y }
}

/** Where every dancer is at time `count` (seconds): held in a formation, or part-way along the path between two. */
export function positionsAt(formations: Formation[], count: number): { index: number; moving: boolean; positions: Record<string, Position> } {
  const starts = startTimes(formations)
  for (let i = formations.length - 1; i >= 0; i--) {
    const f = formations[i]
    if (count >= starts[i]) return { index: i, moving: false, positions: f.positions }
    const travelStart = starts[i] - f.transition
    if (count >= travelStart) {
      const t = f.transition ? (count - travelStart) / f.transition : 1
      // Nobody has anywhere to come from before the first formation, so they wait in place.
      const prev = formations[i - 1]?.positions ?? f.positions
      const positions: Record<string, Position> = {}
      for (const id in f.positions) {
        const a = prev[id] ?? f.positions[id]
        const b = f.positions[id]
        // A bend only means something on a path that goes somewhere; standing still stays still.
        const via = a.x === b.x && a.y === b.y ? undefined : b.via
        positions[id] = { ...along(a, b, via, t), offstage: t < 0.5 ? a.offstage : b.offstage }
      }
      return { index: i, moving: true, positions }
    }
  }
  return { index: 0, moving: false, positions: formations[0]?.positions ?? {} }
}

/** Version 1 stored durations in counts; version 2 stores seconds. */
export function migrate(p: any): Project {
  if (p.version !== 1) return p
  const k = 60 / (p.bpm > 0 ? p.bpm : 120)
  return { ...p, version: 2, formations: p.formations.map((f: any) => ({ ...f, hold: round(f.hold * k), transition: round(f.transition * k) })) }
}

/** Validates an imported file at the trust boundary; throws a readable message on anything unexpected. */
export function parseProject(text: string): Project {
  let p: any
  try {
    p = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  const ok =
    p && (p.version === 1 || p.version === 2) && typeof p.name === 'string' &&
    p.stage && num(p.stage.width) && num(p.stage.depth) && p.stage.width > 0 && p.stage.depth > 0 &&
    Array.isArray(p.dancers) && p.dancers.every((d: any) => d && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.label === 'string') &&
    Array.isArray(p.formations) && p.formations.length > 0 &&
    p.formations.every((f: any) => f && typeof f.id === 'string' && num(f.hold) && num(f.transition) && f.positions && typeof f.positions === 'object' &&
      Object.values(f.positions).every((q: any) => q && num(q.x) && num(q.y) && (q.via === undefined || (q.via && num(q.via.x) && num(q.via.y)))))
  if (!ok) throw new Error('This file is not an Eight project, or it was made by a newer version.')
  // Optional settings are kept only when they are sane; a zero grid would never finish drawing.
  const pos = (n: unknown) => (num(n) && (n as number) > 0 ? (n as number) : undefined)
  p.stage = { ...p.stage, gridSize: pos(p.stage.gridSize) ?? 1, snap: num(p.stage.snap) && p.stage.snap >= 0 ? p.stage.snap : undefined, unit: p.stage.unit === 'ft' ? 'ft' : 'm', marks: ['quarters', 'numbers'].includes(p.stage.marks) ? p.stage.marks : undefined }
  p.countsPerBar = pos(p.countsPerBar) && Math.round(p.countsPerBar)
  p.defaults = p.defaults && pos(p.defaults.hold) && num(p.defaults.transition) && p.defaults.transition >= 0 ? { hold: p.defaults.hold, transition: p.defaults.transition } : undefined
  p.dancers = p.dancers.map((d: any) => ({ ...d, prop: d.prop && pos(d.prop.w) && pos(d.prop.h) ? { w: d.prop.w, h: d.prop.h } : undefined }))
  const now = Date.now()
  // A fresh id so an import never overwrites the project it was exported from.
  // The song does not travel inside the file, so an import starts without one.
  return migrate({ ...p, audio: undefined, timeUnit: p.timeUnit === 'counts' ? 'counts' : undefined, beatOffset: num(p.beatOffset) && p.beatOffset >= 0 ? p.beatOffset : undefined, id: uid(), bpm: num(p.bpm) && p.bpm > 0 ? p.bpm : 120, createdAt: now, updatedAt: now })
}

/** Reads a routine file, or a "Back up all" file holding several routines. */
export function parseProjects(text: string): Project[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return [parseProject(text)] // throws the readable message
  }
  if (!Array.isArray(data)) return [parseProject(text)]
  if (!data.length) throw new Error('This backup file has no routines in it.')
  return data.map(p => parseProject(JSON.stringify(p)))
}
