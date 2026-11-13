import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadProject, saveProject } from './db'
import { DANCER_COLORS, GELS, gelName, gelOf, inkOn, parseProject, positionsAt, startCounts, totalCounts, type Project, type Shape } from './model'
import { addDancer, addFormation, deleteFormation, edit, moveDancers, moveFormation, removeDancers, useEditor } from './store'
import { describe, MarkIcon, SNAP, StageView } from './Stage'
import { download, Field, go, Icon } from './ui'

const pad = (n: number) => String(n).padStart(2, '0')
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function Editor({ id }: { id: string }) {
  const project = useEditor(s => s.project)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let live = true
    loadProject(id).then(p => {
      if (!live) return
      if (p) useEditor.getState().open(p)
      else setMissing(true)
    }, () => live && setMissing(true))
    return () => { live = false; useEditor.getState().close() }
  }, [id])

  if (missing) {
    return (
      <main className="empty">
        <h1>This routine isn't on this device</h1>
        <p>Routines are stored in the browser they were made in. If you have its file, import it from your routines.</p>
        <a className="btn btn-solid" href="#/routines">Go to your routines</a>
      </main>
    )
  }
  if (!project || project.id !== id) return <main className="empty" aria-busy="true"><p>Opening…</p></main>
  return <Workspace project={project} />
}

function Workspace({ project }: { project: Project }) {
  const { current, selected, past, future, saveError, select, setCurrent, undo, redo } = useEditor()
  const { formations, dancers, stage, bpm } = project
  const starts = startCounts(formations)
  const total = totalCounts(formations)

  // Playback position in counts; null means we are editing the current formation.
  const [count, setCount] = useState<number | null>(null)
  const playing = count !== null
  const countRef = useRef(0)
  const importRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      countRef.current += ((now - last) / 1000) * (bpm / 60)
      last = now
      if (countRef.current >= total) return stop(formations.length - 1)
      setCount(countRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, bpm, total])

  const stop = (at?: number) => {
    setCurrent(at ?? positionsAt(formations, countRef.current).index)
    setCount(null)
  }
  const toggle = () => {
    if (playing) return stop()
    // From the last formation there is nothing left to play, so start over.
    countRef.current = current >= formations.length - 1 ? 0 : starts[current]
    select([])
    setCount(countRef.current)
  }

  const view = playing ? positionsAt(formations, count) : { index: current, moving: false, positions: formations[current].positions }
  const here = formations[view.index]
  const gel = gelOf(here, view.index)
  let wash = gel
  if (playing && view.moving) {
    const t = (count - (starts[view.index] - here.transition)) / here.transition
    wash = `color-mix(in srgb, ${gel} ${Math.round(t * 100)}%, ${gelOf(formations[view.index - 1], view.index - 1)})`
  }
  const now = playing ? count : starts[current]

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && k === 'y') { e.preventDefault(); redo() }
      else if (mod && k === 'a') { e.preventDefault(); select(dancers.map(d => d.id)) }
      else if (e.key === ' ' && !t.closest('button, a, [role=button]')) { e.preventDefault(); toggle() }
      else if (e.key === 'Escape') select([])
      else if (e.key.startsWith('Arrow') && selected.length && !playing) {
        e.preventDefault()
        const step = e.shiftKey ? 0.1 : SNAP
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
        const pos = formations[current].positions
        moveDancers(current, Object.fromEntries(selected.filter(id => pos[id]).map(id => [id, { x: pos[id].x + dx, y: pos[id].y + dy }])))
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const p = parseProject(await file.text())
      await saveProject(p)
      go(`#/r/${p.id}`)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That file could not be imported.')
    }
  }

  const one = selected.length === 1 ? dancers.find(d => d.id === selected[0]) : undefined
  const f = formations[current]

  return (
    <div className="editor" style={{ '--gel': gel, '--wash': wash, '--gel-ink': inkOn(gel) } as CSSProperties}>
      <header className="bar">
        <a className="wordmark" href="#/routines" aria-label="Eight, back to your routines">Eight</a>
        <div className="bar-title">
          <Field label="Routine name" value={project.name} maxLength={80} onCommit={v => edit(p => { p.name = v })} />
          <span className="bar-meta" role="status">
            {saveError ? <strong className="bad">Not saved: {saveError}</strong> : `${plural(dancers.length, 'dancer')} · ${plural(formations.length, 'formation')} · saved on this device`}
          </span>
        </div>
        <nav className="bar-actions" aria-label="Routine actions">
          <button className="btn" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)"><Icon name="undo" />Undo</button>
          <button className="btn" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" />Redo</button>
          <button className="btn" onClick={() => importRef.current?.click()}><Icon name="upload" />Import</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { importFile(e.target.files?.[0]); e.target.value = '' }} />
          <button className="btn btn-solid" onClick={() => download(`${project.name.replace(/[\\/:*?"<>|]/g, '-')}.eight.json`, JSON.stringify(project, null, 2))}><Icon name="download" />Export</button>
        </nav>
      </header>
      {importError && <p className="toast" role="alert">{importError} <button className="link" onClick={() => setImportError('')}>Dismiss</button></p>}

      <aside className="rail" aria-label="Dancers">
        <h2>Dancers <span>{dancers.length}</span></h2>
        <ul className="dancer-list">
          {dancers.map(d => (
            <li key={d.id}>
              <button className={selected.includes(d.id) ? 'is-selected' : ''} aria-pressed={selected.includes(d.id)} disabled={playing}
                onClick={e => select(e.shiftKey || e.ctrlKey || e.metaKey ? (selected.includes(d.id) ? selected.filter(s => s !== d.id) : [...selected, d.id]) : [d.id])}>
                <MarkIcon d={d} /><span>{d.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-line" onClick={addDancer} disabled={playing}><Icon name="plus" />Add dancer</button>
      </aside>

      <main className="floor">
        <span className="chip">{pad(view.index + 1)} · {gelName(gel)}</span>
        <StageView stage={stage} dancers={dancers} positions={view.positions} selected={playing ? [] : selected}
          onSelect={playing ? undefined : select} onMove={playing ? undefined : m => moveDancers(current, m)} />
        <p className="hint">{playing ? 'Playing. Press Space to stop.' : 'Drag to move · Shift-click or drag a box to select several · arrow keys nudge · Alt turns snapping off'}</p>
      </main>

      <aside className="rail rail-right" aria-label="Details">
        {one ? (
          <>
            <h2>Dancer</h2>
            <Field label="Name" value={one.name} maxLength={40} onCommit={v => edit(p => { p.dancers.find(d => d.id === one.id)!.name = v })} />
            <Field label="Label (1 to 3 characters)" value={one.label} maxLength={3} onCommit={v => edit(p => { p.dancers.find(d => d.id === one.id)!.label = v })} />
            <Swatches label="Colour" value={one.color} options={DANCER_COLORS} onPick={c => edit(p => { p.dancers.find(d => d.id === one.id)!.color = c })} />
            <label className="field"><span>Shape</span>
              <select value={one.shape} onChange={e => edit(p => { p.dancers.find(d => d.id === one.id)!.shape = e.target.value as Shape })}>
                <option value="circle">Circle</option><option value="square">Square</option><option value="triangle">Triangle</option>
              </select>
            </label>
            <p className="readout"><span>Position in this formation</span><strong>{describe(f.positions[one.id])}</strong></p>
            <button className="btn btn-line btn-danger" onClick={() => removeDancers([one.id])}><Icon name="trash" />Remove from routine</button>
          </>
        ) : selected.length > 1 ? (
          <>
            <h2>{selected.length} dancers</h2>
            <Swatches label="Colour for all" value="" options={DANCER_COLORS} onPick={c => edit(p => { for (const d of p.dancers) if (selected.includes(d.id)) d.color = c })} />
            <button className="btn btn-line btn-danger" onClick={() => removeDancers(selected)}><Icon name="trash" />Remove {selected.length} from routine</button>
          </>
        ) : (
          <>
            <h2>Formation {pad(current + 1)}</h2>
            <Field label="Name" value={f.name} maxLength={60} onCommit={v => edit(p => { p.formations[current].name = v })} />
            <Swatches label="Lighting colour" value={gelOf(f, current)} options={GELS.map(g => g.hex)} names={GELS.map(g => g.name)} onPick={c => edit(p => { p.formations[current].color = c })} />
            <div className="pair">
              <Field label="Hold" type="number" min={1} max={256} step={1} suffix="counts" value={f.hold} onCommit={v => edit(p => { p.formations[current].hold = Number(v) })} />
              {current > 0 && <Field label="Travel in" type="number" min={0} max={64} step={1} suffix="counts" value={f.transition} onCommit={v => edit(p => { p.formations[current].transition = Number(v) })} />}
            </div>
            <label className="field"><span>Note</span>
              <textarea key={f.id} rows={3} defaultValue={f.note ?? ''} placeholder="What happens here?" onBlur={e => { const v = e.target.value.trim(); if (v !== (f.note ?? '')) edit(p => { p.formations[current].note = v || undefined }) }} />
            </label>
            <div className="row">
              <button className="btn btn-line" onClick={() => moveFormation(current, current - 1)} disabled={current === 0} aria-label="Move formation earlier"><Icon name="left" />Earlier</button>
              <button className="btn btn-line" onClick={() => moveFormation(current, current + 1)} disabled={current === formations.length - 1} aria-label="Move formation later">Later<Icon name="right" /></button>
            </div>
            <button className="btn btn-line btn-danger" onClick={() => deleteFormation(current)} disabled={formations.length === 1}><Icon name="trash" />Delete formation</button>
            <h2 className="spaced">Routine</h2>
            <Field label="Tempo" type="number" min={30} max={240} step={1} suffix="BPM" value={bpm} onCommit={v => edit(p => { p.bpm = Number(v) })} />
            <div className="pair">
              <Field label="Stage width" type="number" min={2} max={60} step={0.5} suffix="m" value={stage.width} onCommit={v => edit(p => { p.stage.width = Number(v) })} />
              <Field label="Stage depth" type="number" min={2} max={60} step={0.5} suffix="m" value={stage.depth} onCommit={v => edit(p => { p.stage.depth = Number(v) })} />
            </div>
          </>
        )}
      </aside>

      <footer className="deck">
        <div className="deck-bar">
          <button className="btn btn-play" onClick={toggle} aria-label={playing ? 'Stop' : 'Play from this formation'}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Stop' : 'Play'}</button>
          <p className="deck-now"><strong>{here.name}</strong><span>count {Math.floor(now) + 1} of {total} · bar {Math.floor(now / 8) + 1} · {((now * 60) / bpm).toFixed(1)} s</span></p>
        </div>
        <div className="reel">
          <ol className="swatches" style={{ '--eight': `${(8 / total) * 100}%` } as CSSProperties}>
            {formations.map((fm, i) => {
              const hex = gelOf(fm, i)
              return (
                <li key={fm.id} style={{ flexGrow: fm.hold + (i ? fm.transition : 0) }}>
                  {i > 0 && fm.transition > 0 && <span className="travel" style={{ flexGrow: fm.transition, '--a': gelOf(formations[i - 1], i - 1), '--b': hex } as CSSProperties} title={`${plural(fm.transition, 'count')} to travel`} />}
                  <button className={`swatch${i === view.index ? ' is-current' : ''}`} style={{ flexGrow: fm.hold, background: hex, color: inkOn(hex) }} aria-current={i === view.index}
                    onClick={() => { setCount(null); setCurrent(i); select([]) }}>
                    <small>{pad(i + 1)} · {gelName(hex)}</small>
                    <span><b>{fm.name}</b><i>{plural(fm.hold, 'count')}</i></span>
                  </button>
                </li>
              )
            })}
            <span className="playhead" style={{ left: `${(now / total) * 100}%` }} aria-hidden="true" />
          </ol>
          <button className="btn btn-add" onClick={addFormation} disabled={playing} aria-label="Add a formation after this one"><Icon name="plus" />Add formation</button>
        </div>
      </footer>
    </div>
  )
}

function Swatches({ label, value, options, names, onPick }: { label: string; value: string; options: string[]; names?: string[]; onPick: (c: string) => void }) {
  return (
    <fieldset className="chips">
      <legend>{label}</legend>
      {options.map((c, i) => (
        <button key={c} type="button" style={{ background: c }} className={c === value ? 'is-on' : ''} aria-pressed={c === value} aria-label={names?.[i] ?? `Colour ${i + 1}`} title={names?.[i]} onClick={() => onPick(c)} />
      ))}
    </fieldset>
  )
}
