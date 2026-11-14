import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { saveProject } from './db'
import { GELS, gelOf, lineUp, newDancer, round, uid, type Position, type Project } from './model'

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

function persist(p: Project) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveProject(p).then(
      () => useEditor.setState({ saveError: null }),
      e => useEditor.setState({ saveError: String(e?.message ?? e) }),
    )
  }, 300)
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  current: 0,
  selected: [],
  past: [],
  future: [],
  saveError: null,

  open: p => set({ project: p, current: 0, selected: [], past: [], future: [], saveError: null }),
  close: () => set({ project: null, selected: [], past: [], future: [] }),

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
    const { width, depth } = p.stage
    for (const id in moves) {
      const q = p.formations[formation].positions[id]
      if (!q) continue
      // Dancers may sit up to 2 m outside the stage (wings), no further.
      q.x = round(Math.max(-width / 2 - 2, Math.min(width / 2 + 2, moves[id].x)))
      q.y = round(Math.max(-2, Math.min(depth + 2, moves[id].y)))
    }
  })
}

export function addDancer() {
  edit(p => {
    const d = newDancer(p.dancers.length)
    p.dancers.push(d)
    for (const f of p.formations) f.positions[d.id] = { x: 0, y: round(p.stage.depth / 2) }
  })
}

export function removeDancers(ids: string[]) {
  edit(p => {
    p.dancers = p.dancers.filter(d => !ids.includes(d.id))
    for (const f of p.formations) for (const id of ids) delete f.positions[id]
  })
}

export function addFormation() {
  const { current } = useEditor.getState()
  edit(p => {
    const src = p.formations[current]
    // First colour, starting from the next in order, that neither neighbour already has.
    const taken = [gelOf(src, current), p.formations[current + 1] && gelOf(p.formations[current + 1], current + 1)]
    const color = GELS.map((_, k) => GELS[(p.formations.length + k) % GELS.length].hex).find(h => !taken.includes(h))
    p.formations.splice(current + 1, 0, {
      id: uid(),
      name: `Formation ${p.formations.length + 1}`,
      color,
      hold: 4,
      transition: 2,
      positions: JSON.parse(JSON.stringify(src.positions)),
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

export function resetLine(formation: number) {
  edit(p => {
    p.formations[formation].positions = lineUp(p.dancers.map(d => d.id), p.stage)
  })
}
