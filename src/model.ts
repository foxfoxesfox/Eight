// Positions are in metres: x from the centre line (left negative, audience view),
// y from the front edge of the stage (upstage positive).
export type Shape = 'circle' | 'square' | 'triangle'

export interface Dancer {
  id: string
  name: string
  label: string
  color: string
  shape: Shape
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
  unit: 'm' | 'ft'
  gridSize: number
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
  /** Seconds into the timeline where beat one of the grid falls. */
  beatOffset?: number
  /** The song itself is stored beside the project, never inside it. */
  audio?: { name: string; duration: number }
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export const DANCER_COLORS = ['#ffb000', '#ff7fb0', '#00c2c2', '#8fd14f', '#b79bff', '#ff8a4c', '#5aa9ff', '#17171a']
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

const SHAPES: Shape[] = ['circle', 'square', 'triangle']

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
        positions[id] = { ...along(a, b, b.via, t), offstage: t < 0.5 ? a.offstage : b.offstage }
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
  const now = Date.now()
  // A fresh id so an import never overwrites the project it was exported from.
  // The song does not travel inside the file, so an import starts without one.
  return migrate({ ...p, audio: undefined, beatOffset: num(p.beatOffset) && p.beatOffset >= 0 ? p.beatOffset : undefined, id: uid(), bpm: num(p.bpm) && p.bpm > 0 ? p.bpm : 120, stage: { unit: 'm', gridSize: 1, ...p.stage }, createdAt: now, updatedAt: now })
}
