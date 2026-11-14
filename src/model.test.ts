import { describe, expect, it, vi } from 'vitest'

vi.mock('./db', () => ({ saveProject: () => Promise.resolve() }))

import { labelFor, newProject, parseProject, positionsAt, startTimes, totalTime } from './model'
import { addDancer, addFormation, moveDancers, removeDancers, useEditor } from './store'

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
    // The first formation can have a moving-in part too; it pushes everything later.
    p.formations[0].transition = 2
    expect(startTimes(p.formations)).toEqual([2, 14])
    expect(positionsAt(p.formations, 1)).toMatchObject({ index: 0, moving: true, positions: { [id]: { x: 0, y: 0 } } })
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
    expect(useEditor.getState().project!.formations[1].positions[a]).toEqual({ x: 7, y: 3 }) // clamped to the wings
    expect(useEditor.getState().project!.formations[0].positions[a].x).not.toBe(7)

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
  })
})
