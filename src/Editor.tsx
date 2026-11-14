import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { clock, MAX_AUDIO_BYTES, readAudio } from './audio'
import { deleteAudio, loadAudio, loadProject, saveAudio, saveProject } from './db'
import { DANCER_COLORS, GELS, gelName, gelOf, inkOn, parseProject, positionsAt, round, startTimes, totalTime, type Project, type Shape } from './model'
import { addDancer, addFormation, deleteFormation, edit, moveDancers, moveFormation, removeDancers, useEditor } from './store'
import { describe, MarkIcon, SNAP, StageView } from './Stage'
import { Timeline } from './Timeline'
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
  const starts = startTimes(formations)
  const end = Math.max(totalTime(formations), project.audio?.duration ?? 0)

  // The playhead, in seconds. The formation being edited is whichever one it sits on.
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timeRef = useRef(0)
  const song = useRef<HTMLAudioElement | null>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [audioMissing, setAudioMissing] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  const seek = (t: number) => {
    const c = Math.max(0, Math.min(end, t))
    timeRef.current = c
    setTime(c)
    if (song.current) song.current.currentTime = Math.min(c, song.current.duration || 0)
  }
  /** Puts the playhead on the store's current formation; reads the store so it works right after an edit. */
  const follow = () => {
    const s = useEditor.getState()
    seek(startTimes(s.project!.formations)[s.current] ?? 0)
  }

  const dropSong = () => {
    if (!song.current) return
    song.current.pause()
    URL.revokeObjectURL(song.current.src)
    song.current = null
  }
  const attachSong = (blob: Blob) => {
    dropSong()
    song.current = new Audio(URL.createObjectURL(blob))
    setAudioMissing(false)
  }
  useEffect(() => {
    let live = true
    if (project.audio) {
      loadAudio(project.id).then(async blob => {
        if (!live) return
        if (!blob) return setAudioMissing(true)
        attachSong(blob)
        const { peaks } = await readAudio(blob)
        if (live) setPeaks(peaks)
      }).catch(() => live && setAudioMissing(true))
    }
    return () => { live = false; dropSong() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const addAudio = async (file?: File) => {
    if (!file) return
    try {
      if (!file.type.startsWith('audio/')) throw new Error('That file is not audio. Choose an MP3, WAV or M4A file.')
      if (file.size > MAX_AUDIO_BYTES) throw new Error('That song is larger than 60 MB. Try a shorter or more compressed file.')
      const { duration, peaks } = await readAudio(file).catch(() => { throw new Error('This browser could not read that audio file. Try an MP3 or WAV version.') })
      await saveAudio(project.id, file)
      attachSong(file)
      setPeaks(peaks)
      edit(p => { p.audio = { name: file.name, duration: round(duration) } })
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That song could not be added.')
    }
  }
  const removeAudio = () => {
    setPlaying(false)
    deleteAudio(project.id).catch(() => {})
    dropSong()
    setPeaks(null)
    setAudioMissing(false)
    edit(p => { delete p.audio })
  }

  useEffect(() => {
    if (!playing) return
    const a = song.current
    if (a && timeRef.current < a.duration) {
      a.currentTime = timeRef.current
      a.play().catch(() => {})
    }
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // The song is the clock while it is sounding, so picture and sound cannot drift apart.
      const t = a && !a.paused && !a.ended ? a.currentTime : timeRef.current + (now - last) / 1000
      last = now
      if (t >= end) { timeRef.current = end; setTime(end); setPlaying(false); return }
      timeRef.current = t
      setTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); a?.pause() }
  }, [playing, end])

  const toggle = () => {
    if (!playing && timeRef.current >= end - 0.01) seek(0)
    if (!playing) select([])
    setPlaying(!playing)
  }

  const view = positionsAt(formations, time)
  const here = formations[view.index]
  const gel = gelOf(here, view.index)
  let wash = gel
  if (view.moving) {
    const t = (time - (starts[view.index] - here.transition)) / here.transition
    wash = `color-mix(in srgb, ${gel} ${Math.round(t * 100)}%, ${gelOf(formations[view.index - 1], view.index - 1)})`
  }
  // Dancers can be moved only while the playhead rests on a formation.
  const editable = !playing && !view.moving

  useEffect(() => { if (view.index !== current) setCurrent(view.index) }, [view.index, current, setCurrent])
  useEffect(() => { if (timeRef.current > end) seek(end) })

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && k === 'y') { e.preventDefault(); redo() }
      else if (mod && k === 'a') { e.preventDefault(); select(dancers.map(d => d.id)) }
      else if (e.key === ' ' && !t.closest('button, a, [role=button], [role=slider]')) { e.preventDefault(); toggle() }
      else if (e.key === 'Escape') select([])
      else if (e.key.startsWith('Arrow') && selected.length && editable) {
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
  const f = formations[current] ?? here

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
              <button className={selected.includes(d.id) ? 'is-selected' : ''} aria-pressed={selected.includes(d.id)} disabled={!editable}
                onClick={e => select(e.shiftKey || e.ctrlKey || e.metaKey ? (selected.includes(d.id) ? selected.filter(s => s !== d.id) : [...selected, d.id]) : [d.id])}>
                <MarkIcon d={d} /><span>{d.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-line" onClick={addDancer} disabled={!editable}><Icon name="plus" />Add dancer</button>
      </aside>

      <main className="floor">
        <span className="chip">{pad(view.index + 1)} · {gelName(gel)}</span>
        <StageView stage={stage} dancers={dancers} positions={view.positions} selected={editable ? selected : []}
          onSelect={editable ? select : undefined} onMove={editable ? m => moveDancers(current, m) : undefined} />
        <p className="hint">
          {playing ? 'Playing. Press Space to stop.'
            : view.moving ? `Between formations at ${clock(time)}. Click a formation below to edit it.`
            : 'Drag to move · Shift-click or drag a box to select several · arrow keys nudge · Alt turns snapping off'}
        </p>
      </main>

      <aside className="rail rail-right" aria-label="Details">
        {one && f.positions[one.id] ? (
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
              <Field label="Hold" type="number" min={0.1} max={600} step={0.1} suffix="s" value={f.hold} onCommit={v => edit(p => { p.formations[current].hold = round(Number(v)) })} />
              {current > 0 && <Field label="Travel in" type="number" min={0} max={600} step={0.1} suffix="s" value={f.transition} onCommit={v => edit(p => { p.formations[current].transition = round(Number(v)) })} />}
            </div>
            <label className="field"><span>Note</span>
              <textarea key={f.id} rows={3} defaultValue={f.note ?? ''} placeholder="What happens here?" onBlur={e => { const v = e.target.value.trim(); if (v !== (f.note ?? '')) edit(p => { p.formations[current].note = v || undefined }) }} />
            </label>
            <div className="row">
              <button className="btn btn-line" onClick={() => { moveFormation(current, current - 1); follow() }} disabled={current === 0} aria-label="Move formation earlier"><Icon name="left" />Earlier</button>
              <button className="btn btn-line" onClick={() => { moveFormation(current, current + 1); follow() }} disabled={current === formations.length - 1} aria-label="Move formation later">Later<Icon name="right" /></button>
            </div>
            <button className="btn btn-line btn-danger" onClick={() => { deleteFormation(current); follow() }} disabled={formations.length === 1}><Icon name="trash" />Delete formation</button>
            <h2 className="spaced">Routine</h2>
            <Field label="Tempo of the beat grid" type="number" min={30} max={240} step={1} suffix="BPM" value={bpm} onCommit={v => edit(p => { p.bpm = Number(v) })} />
            <Field label="First beat at" type="number" min={0} max={600} step={0.01} suffix="s" value={project.beatOffset ?? 0} onCommit={v => edit(p => { p.beatOffset = round(Number(v)) })} />
            <button className="btn btn-line" onClick={() => edit(p => { p.beatOffset = round(time) })}>Set first beat to playhead</button>
            <div className="pair">
              <Field label="Stage width" type="number" min={2} max={60} step={0.5} suffix="m" value={stage.width} onCommit={v => edit(p => { p.stage.width = Number(v) })} />
              <Field label="Stage depth" type="number" min={2} max={60} step={0.5} suffix="m" value={stage.depth} onCommit={v => edit(p => { p.stage.depth = Number(v) })} />
            </div>
          </>
        )}
      </aside>

      <Timeline project={project} time={time} playing={playing} index={view.index} peaks={peaks} audioMissing={audioMissing}
        onSeek={seek} onToggle={toggle} onAddFormation={() => { addFormation(); follow() }}
        onPickAudio={() => audioRef.current?.click()} onRemoveAudio={removeAudio} />
      <input ref={audioRef} type="file" accept="audio/*,.mp3,.wav,.m4a" hidden onChange={e => { addAudio(e.target.files?.[0]); e.target.value = '' }} />
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
