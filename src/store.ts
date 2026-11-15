import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { saveProject } from './db'
import { GELS, gelOf, isPerson, labelFor, lineUp, newDancer, newLengths, place, PROP_COLOR, round, uid, type Position, type Project, type Stage } from './model'

enablePatches()

interface Step {
  redo: Patch[]
  undo: Patch[]
}

interface EditorState {
  project: Project | null
  /** Index of the formation being edited. */
  current: number
  selected: string[]
  past: Step[]
  future: Step[]
  saveError: string | null
  open: (p: Project) => void
  close: () => void
  edit: (recipe: (p: Project) => void) => void
  undo: () => void
  redo: () => void
  setCurrent: (i: number) => void
  select: (ids: string[]) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let unsaved: Project | undefined

function persist(p: Project) {
  unsaved = p
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 300)
}

/** Saves now. Called when the editor closes, so the routine list never shows the routine as it was a moment ago. */
function flush() {
  clearTimeout(saveTimer)
  const p = unsaved
  unsaved = undefined
  if (!p) return
  saveProject(p).then(
    () => useEditor.setState({ saveError: null }),
    e => useEditor.setState({ saveError: String(e?.message ?? e) }),
  )
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  current: 0,
  selected: [],
  past: [],
  future: [],
  saveError: null,

  open: p => set({ project: p, current: 0, selected: [], past: [], future: [], saveError: null }),
  close: () => { flush(); set({ project: null, selected: [], past: [], future: [] }) },

  edit: recipe => {
    const { project, past } = get()
    if (!project) return
    const [next, redo, undo] = produceWithPatches(project, draft => {
      recipe(draft)
    })
    if (!redo.length) return
    const stamped = { ...next, updatedAt: Date.now() }
    set({ project: stamped, past: [...past, { redo, undo }], future: [], ...clamp(stamped, get()) })
    persist(stamped)
  },

  undo: () => step('past', 'future', 'undo'),
  redo: () => step('future', 'past', 'redo'),

  setCurrent: i => set({ current: i }),
  select: ids => set({ selected: ids }),
}))

function step(from: 'past' | 'future', to: 'past' | 'future', dir: 'undo' | 'redo') {
  const s = useEditor.getState()
  const last = s[from].at(-1)
  if (!s.project || !last) return
  const project = { ...applyPatches(s.project, last[dir]), updatedAt: Date.now() }
  useEditor.setState({ project, [from]: s[from].slice(0, -1), [to]: [...s[to], last], ...clamp(project, s) } as Partial<EditorState>)
  persist(project)
}

/** Keeps the current formation and selection valid after any change. */
function clamp(p: Project, s: Pick<EditorState, 'current' | 'selected'>) {
  const ids = new Set(p.dancers.map(d => d.id))
  return {
    current: Math.min(s.current, p.formations.length - 1),
    selected: s.selected.filter(id => ids.has(id)),
  }
}

// ---- Edits. Each is one undo step. ----

export const edit = (r: (p: Project) => void) => useEditor.getState().edit(r)

export function moveDancers(formation: number, moves: Record<string, Position>) {
  edit(p => {
    for (const id in moves) {
      const q = p.formations[formation].positions[id]
      if (q) place(p.stage, q, moves[id])
    }
  })
}

/** Changes the stage size and pulls in anyone the new stage would leave out of sight. */
export function resizeStage(size: Partial<Pick<Stage, 'width' | 'depth'>>) {
  edit(p => {
    Object.assign(p.stage, size)
    for (const f of p.formations) for (const id in f.positions) place(p.stage, f.positions[id], f.positions[id])
  })
}

export function addDancer() {
  edit(p => {
    // Skip past labels still in use, so removing a dancer and adding one never makes two with the same letter.
    const used = new Set(p.dancers.map(d => d.label))
    let i = p.dancers.filter(isPerson).length
    while (used.has(labelFor(i))) i++
    const d = newDancer(i)
    p.dancers.push(d)
    for (const f of p.formations) f.positions[d.id] = { x: 0, y: round(p.stage.depth / 2) }
  })
}

/** Adds a prop: a 2 m by 1 m slab in the middle of the stage, to be renamed, resized and moved like a dancer. */
export function addProp() {
  edit(p => {
    const id = uid()
    p.dancers.push({ id, name: `Prop ${p.dancers.filter(d => d.prop).length + 1}`, label: '', color: PROP_COLOR, shape: 'square', prop: { w: 2, h: 1 } })
    for (const f of p.formations) f.positions[id] = { x: 0, y: round(p.stage.depth / 2) }
  })
}

export function removeDancers(ids: string[]) {
  edit(p => {
    p.dancers = p.dancers.filter(d => !ids.includes(d.id))
    for (const f of p.formations) for (const id of ids) delete f.positions[id]
  })
}

/** Where everyone stands, without the bends of the paths that brought them there. */
const stand = (positions: Record<string, Position>): Record<string, Position> =>
  Object.fromEntries(Object.entries(positions).map(([id, { via, ...q }]) => [id, q]))

/** Adds a formation after formation `current`, with everyone standing where they are in it. */
export function addFormation(current = useEditor.getState().current) {
  edit(p => {
    const src = p.formations[current]
    // First colour, starting from the next in order, that neither neighbour already has.
    const taken = [gelOf(src, current), p.formations[current + 1] && gelOf(p.formations[current + 1], current + 1)]
    const color = GELS.map((_, k) => GELS[(p.formations.length + k) % GELS.length].hex).find(h => !taken.includes(h))
    p.formations.splice(current + 1, 0, {
      id: uid(),
      name: '',
      color,
      ...newLengths(p as Project),
      positions: stand(src.positions),
    })
  })
  useEditor.setState({ current: current + 1 })
}

export function deleteFormation(i: number) {
  edit(p => {
    if (p.formations.length > 1) p.formations.splice(i, 1)
  })
}

export function moveFormation(from: number, to: number) {
  edit(p => {
    if (to < 0 || to >= p.formations.length) return
    const [f] = p.formations.splice(from, 1)
    p.formations.splice(to, 0, f)
  })
  const n = useEditor.getState().project?.formations.length ?? 1
  if (to >= 0 && to < n) useEditor.setState({ current: to })
}

/** Puts everyone back where they stood in the formation before, undoing whatever was changed in this one. */
export function matchPrevious(formation: number) {
  edit(p => {
    if (formation > 0) p.formations[formation].positions = stand(p.formations[formation - 1].positions)
  })
}

export function resetLine(formation: number) {
  edit(p => {
    // Props stay where they are; only people line up.
    Object.assign(p.formations[formation].positions, lineUp(p.dancers.filter(isPerson).map(d => d.id), p.stage))
  })
}
