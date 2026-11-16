import { describe, expect, it, vi } from 'vitest'

vi.mock('./db', () => ({ saveProject: () => Promise.resolve() }))

import { clashes, formationLabel, labelFor, presetShape, newProject, parseProject, parseProjects, positionsAt, span, startTimes, tidy, totalTime } from './model'
import { parseGuide } from './Help'
import guide from '../docs/GUIDE.md?raw'
import { addDancer, addFormation, matchPrevious, moveDancers, removeDancers, resizeStage, useEditor } from './store'

describe('model', () => {
  it('labels stay unique past 26 dancers', () => {
    expect([0, 25, 26, 27, 701, 702].map(labelFor)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
    expect(new Set(newProject('x', 100).dancers.map(d => d.label)).size).toBe(100)
  })

  it('times formations in seconds and interpolates between them', () => {
    const p = newProject('x', 1)
    p.formations[0].hold = 8
    const id = p.dancers[0].id
    p.formations[0].positions[id] = { x: 0, y: 0 }
    p.formations.push({ id: 'b', name: 'B', hold: 8, transition: 4, positions: { [id]: { x: 4, y: 2 } } })
    expect(startTimes(p.formations)).toEqual([0, 12])
    expect(totalTime(p.formations)).toBe(20)
    expect(positionsAt(p.formations, 3).positions[id]).toEqual({ x: 0, y: 0 })
    expect(positionsAt(p.formations, 10)).toMatchObject({ index: 1, moving: true, positions: { [id]: { x: 2, y: 1 } } })
    expect(positionsAt(p.formations, 99)).toMatchObject({ index: 1, moving: false })
    // A bent path passes through the curve's midpoint, not the straight one.
    p.formations[1].positions[id].via = { x: 0, y: 4 }
    expect(positionsAt(p.formations, 10).positions[id]).toMatchObject({ x: 1, y: 2.5 })
    expect(parseProject(JSON.stringify(p)).formations[1].positions[id].via).toEqual({ x: 0, y: 4 })
    delete p.formations[1].positions[id].via
    // The first formation can have a moving-in part too; it pushes everything later.
    p.formations[0].transition = 2
    expect(startTimes(p.formations)).toEqual([2, 14])
    expect(positionsAt(p.formations, 1)).toMatchObject({ index: 0, moving: true, positions: { [id]: { x: 0, y: 0 } } })
  })

  it('shows lengths in seconds or in counts at the tempo', () => {
    expect(span({ bpm: 120 }, 4)).toBe('4.00 s')
    expect(span({ bpm: 120, timeUnit: 'counts' }, 4)).toBe('8 counts')
    // 8 counts at 130 BPM is not a round number of seconds, and still reads back as 8.
    const odd = { bpm: 130, timeUnit: 'counts' } as const
    expect(span(odd, tidy(odd, (8 * 60) / 130))).toBe('8 counts')
    expect(parseProject(JSON.stringify({ ...newProject('x', 1), timeUnit: 'counts' })).timeUnit).toBe('counts')
  })

  it('builds preset shapes around their own centre and spots dancers who would collide', () => {
    for (const kind of ['line', 'rows', 'block', 'circle', 'v', 'pyramid'] as const) {
      const pts = presetShape(kind, 7)
      expect(pts).toHaveLength(7)
      expect(new Set(pts.map(q => `${q.x},${q.y}`)).size).toBe(7) // nobody shares a spot
      expect(Math.abs(pts.reduce((s, q) => s + q.x, 0))).toBeLessThan(0.05)
    }
    expect(presetShape('line', 3, 2).map(q => q.x)).toEqual([-2, 0, 2])
    // Two dancers swapping places walk through each other; bending one path clears it; standing close is not a clash.
    const prev = { a: { x: -2, y: 2 }, b: { x: 2, y: 2 }, c: { x: 0, y: 6 }, d: { x: 0.4, y: 6 } }
    const cur = { a: { x: 2, y: 2 }, b: { x: -2, y: 2 }, c: { x: 0, y: 6 }, d: { x: 0.4, y: 6 } }
    expect(clashes(prev, cur, ['a', 'b', 'c', 'd'])).toEqual([['a', 'b']])
    expect(clashes(prev, { ...cur, b: { x: -2, y: 2, via: { x: 0, y: 6 } } }, ['a', 'b'])).toEqual([])
  })

  it('names formations by their own name, numbering them by position', () => {
    const f = newProject('x', 1).formations[0]
    expect(formationLabel(f, 2)).toEqual({ title: 'Formation 3', sub: '' })
    expect(formationLabel({ ...f, name: 'Formation 1' }, 2)).toEqual({ title: 'Formation 3', sub: '' })
    expect(formationLabel({ ...f, name: 'Chorus' }, 2)).toEqual({ title: 'Chorus', sub: 'Formation 3' })
  })

  it('round-trips a project through JSON and rejects junk', () => {
    const p = newProject('Opener', 8)
    const back = parseProject(JSON.stringify(p))
    expect(back.id).not.toBe(p.id)
    expect(back.formations).toEqual(p.formations)
    // A version 1 file counted in beats: 8 counts at 120 BPM is 4 seconds.
    const old = parseProject(JSON.stringify({ ...p, version: 1, bpm: 120, formations: [{ ...p.formations[0], hold: 8, transition: 4 }] }))
    expect(old).toMatchObject({ version: 2, formations: [{ hold: 4, transition: 2 }] })
    expect(() => parseProject('nope')).toThrow(/not valid JSON/)
    expect(() => parseProject('{"version":1,"name":"x"}')).toThrow(/not an Eight project/)
    const bad = structuredClone(p)
    ;(bad.formations[0].positions[p.dancers[0].id] as any).x = 'left'
    expect(() => parseProject(JSON.stringify(bad))).toThrow()
    // A "Back up all" file is a list of routines and comes back as one.
    expect(parseProjects(JSON.stringify([p, p])).map(q => q.name)).toEqual(['Opener', 'Opener'])
    expect(parseProjects(JSON.stringify(p))).toHaveLength(1)
    expect(() => parseProjects('[]')).toThrow(/no routines/)
  })
})

describe('help page', () => {
  it('reads every part of the guide, so nothing in it shows as raw Markdown', () => {
    const blocks = parseGuide(guide)
    expect(blocks.filter(b => b.kind === 'h3').length).toBeGreaterThan(10)
    expect(blocks.some(b => b.kind === 'ol' && b.items.length === 8)).toBe(true)
    // No heading marks, list marks or links left inside any text.
    const text = blocks.flatMap(b => ('items' in b ? b.items : [b.text]))
    expect(text.filter(t => /^(#|- |\d+\. )|\]\(/.test(t))).toEqual([])
  })
})

describe('editor store', () => {
  it('undoes and redoes edits, and keeps dancers consistent across formations', () => {
    const p = newProject('x', 2)
    const [a, b] = p.dancers.map(d => d.id)
    useEditor.getState().open(p)

    addFormation()
    expect(useEditor.getState().current).toBe(1)
    moveDancers(1, { [a]: { x: 99, y: 3 } })
    expect(useEditor.getState().project!.formations[1].positions[a]).toEqual({ x: 6, y: 3 }) // clamped to the wings
    expect(useEditor.getState().project!.formations[0].positions[a].x).not.toBe(6)

    addDancer()
    const s = useEditor.getState().project!
    expect(s.formations.every(f => Object.keys(f.positions).length === 3)).toBe(true)

    useEditor.getState().select([b])
    removeDancers([b])
    expect(useEditor.getState().selected).toEqual([])
    expect(useEditor.getState().project!.formations.every(f => !(b in f.positions))).toBe(true)

    useEditor.getState().undo()
    expect(useEditor.getState().project!.dancers).toHaveLength(3)
    for (let i = 0; i < 3; i++) useEditor.getState().undo()
    expect(useEditor.getState().project!.formations).toHaveLength(1)
    expect(useEditor.getState().project!.dancers).toHaveLength(2)
    useEditor.getState().redo()
    expect(useEditor.getState().project!.formations).toHaveLength(2)

    // A new formation copies positions but not path bends, and a dancer standing still ignores a stray bend.
    useEditor.getState().edit(q => { q.formations[1].positions[a] = { x: 2, y: 2, via: { x: 9, y: 9 } } })
    useEditor.getState().setCurrent(1)
    addFormation()
    const fs = structuredClone(useEditor.getState().project!.formations)
    expect(fs[2].positions[a]).toEqual({ x: 2, y: 2 })
    fs[2].positions[a].via = { x: 9, y: 9 }
    expect(positionsAt(fs, startTimes(fs)[2] - 1).positions[a]).toMatchObject({ x: 2, y: 2 })

    // Resetting a formation puts everyone back where they stood in the one before, in one undo step.
    moveDancers(2, { [a]: { x: -3, y: 5 } })
    matchPrevious(2)
    expect(useEditor.getState().project!.formations[2].positions[a]).toEqual({ x: 2, y: 2 })
    useEditor.getState().undo()
    expect(useEditor.getState().project!.formations[2].positions[a]).toEqual({ x: -3, y: 5 })

    // A dancer added after one was removed gets a letter nobody else has.
    removeDancers([a])
    addDancer()
    const labels = useEditor.getState().project!.dancers.map(d => d.label)
    expect(new Set(labels).size).toBe(labels.length)

    // Shrinking the stage pulls in anyone it would leave out of sight.
    resizeStage({ width: 4 })
    expect(useEditor.getState().project!.formations.every(f => Object.values(f.positions).every(q => Math.abs(q.x) <= 3))).toBe(true)
  })
})
