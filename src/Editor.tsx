import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clock, MAX_AUDIO_BYTES, MAX_WAVEFORM_BYTES, readAudio, videoLength } from './audio'
import { loadAudio, loadProject, loadWave, saveAudio, saveProject, saveWave } from './db'
import { centroid, clashes, DANCER_COLORS, formationLabel, FT, GELS, gelName, gelOf, inkOn, isPerson, newLengths, parseProjects, positionsAt, presetShape, round, SHAPES, startTimes, tidy, totalTime, unitOf, type Dancer, type Position, type Preset, type Project, type Shape, type Stage } from './model'
import { addDancer, addFormation, addProp, deleteFormation, edit, moveDancers, moveFormation, removeDancers, resizeStage, useEditor } from './store'
import { describe, MarkIcon, StageView, type PathMode } from './Stage'
import { recordVideo } from './video'
import { Timeline } from './Timeline'
import { download, Field, go, Icon, savePng, ThemeToggle } from './ui'

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
  // The routine's song, or its video: either way the element that makes the sound and keeps the time.
  const song = useRef<HTMLMediaElement | null>(null)
  /** Where a video is shown, beside the stage. */
  const screen = useRef<HTMLDivElement>(null)
  const [hasVideo, setHasVideo] = useState(false)
  const [showVideo, setShowVideo] = useState(true)
  const [mirrored, setMirrored] = useState(false)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [audioMissing, setAudioMissing] = useState(false)
  /** Peaks of a song added a moment ago, so it is not decoded a second time. */
  const decoded = useRef<Float32Array | null>(null)
  const [songRev, setSongRev] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const waveRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')
  /** Something worth knowing that is not an error, such as a video too big for a waveform. */
  const [notice, setNotice] = useState('')
  const exportBox = useRef<HTMLDialogElement>(null)
  const [paths, setPaths] = useState<PathMode>('selected')
  const [speed, setSpeed] = useState(1)
  // Read by the playback loop, so dragging the speed slider never restarts the song.
  const speedRef = useRef(speed)
  speedRef.current = speed
  const [volume, setVolume] = useState(() => { try { const v = Number(localStorage.getItem('eight.volume') ?? 1); return v >= 0 && v <= 1 ? v : 1 } catch { return 1 } })
  useEffect(() => {
    if (song.current) { song.current.playbackRate = speed; song.current.volume = volume }
    try { localStorage.setItem('eight.volume', String(volume)) } catch { /* storage refused: the volume still applies for this visit */ }
  }, [speed, volume])
  const [loop, setLoop] = useState(false)
  const [flipped, setFlipped] = useState(false)
  /** How far a video recording has got, 0 to 1; null when none is being made. */
  const [video, setVideo] = useState<number | null>(null)
  const stopVideo = useRef<AbortController | null>(null)
  /** A finished video waiting to be saved. Browsers often refuse a download that starts by itself minutes after the click, so the user saves it with a link. */
  const [videoFile, setVideoFile] = useState<{ url: string; name: string } | null>(null)
  const dropVideo = () => setVideoFile(v => { if (v) URL.revokeObjectURL(v.url); return null })
  useEffect(() => () => stopVideo.current?.abort(), [])
  /** The stretch being repeated while looping: the bar the playhead was in when play was pressed. */
  const loopRange = useRef<[number, number]>([0, 0])

  const seek =(t: number) => {
    // Read the length from the store: right after an edit, this render's `end` is still the old one.
    const p = useEditor.getState().project ?? project
    const c = Math.max(0, Math.min(Math.max(totalTime(p.formations), p.audio?.duration ?? 0), t))
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
    song.current.remove()
    song.current = null
    setHasVideo(false)
  }
  const attachSong = (blob: Blob) => {
    dropSong()
    const video = blob.type.startsWith('video/')
    const el = video ? Object.assign(document.createElement('video'), { playsInline: true, preload: 'auto' }) : new Audio()
    el.src = URL.createObjectURL(blob)
    if (video) screen.current?.append(el)
    song.current = el
    setHasVideo(video)
    setAudioMissing(false)
  }
  // Runs again whenever the routine gains or loses its song, including through undo and redo.
  useEffect(() => {
    let live = true
    setPeaks(null)
    setAudioMissing(false)
    if (project.audio) {
      loadAudio(project.id).then(async blob => {
        if (!live) return
        if (!blob) return setAudioMissing(true)
        attachSong(blob)
        // A video with no sound still plays; it just has no waveform.
        const peaks = decoded.current ?? (project.audio?.wave && (await loadWave(project.id))) ?? (await readAudio(blob).catch(() => ({ peaks: new Float32Array(0) }))).peaks
        decoded.current = null
        if (live) setPeaks(peaks)
      }).catch(() => live && setAudioMissing(true))
    }
    return () => { live = false; dropSong() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, !project.audio, !project.audio?.wave, songRev])

  const addAudio = async (file?: File) => {
    if (!file) return
    try {
      const video = file.type.startsWith('video/')
      if (!video && !file.type.startsWith('audio/')) throw new Error('That file is not music or video. Choose an MP3, WAV or M4A song, or an MP4, MOV or WebM video.')
      if (!video && file.size > MAX_AUDIO_BYTES) throw new Error('That song is larger than 60 MB. Try a shorter or more compressed file.')
      const { duration, peaks } = await readAudio(file).catch(async () => {
        if (!video) throw new Error('This browser could not read that audio file. Try an MP3 or WAV version.')
        // No sound it can read, or too big to draw: keep the picture, with an empty waveform.
        return { duration: await videoLength(file).catch(() => { throw new Error('This browser could not read that video. Try an MP4 version.') }), peaks: new Float32Array(0) }
      })
      // Ask the browser how much room is left before trying, so a file that cannot fit says so plainly.
      const room = await navigator.storage?.estimate?.().catch(() => undefined)
      const free = room?.quota ? room.quota - (room.usage ?? 0) : Infinity
      const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`
      if (file.size > free) throw new Error(`That file is ${mb(file.size)}, and this browser has ${mb(free)} of storage left for Eight. Free up disk space or use a smaller file.`)
      await saveAudio(project.id, file).catch(() => { throw new Error('This browser does not have enough storage space left for that file.') })
      decoded.current = peaks
      edit(p => { p.audio = { name: file.name, duration: round(duration) } })
      setSongRev(r => r + 1)
      setNotice(!peaks.length ? (file.size > MAX_WAVEFORM_BYTES ? `This video is ${mb(file.size)}. Over 300 MB there is no waveform from the video itself, but it plays, stays in step and exports as usual. Add its song under Routine to get a waveform.` : 'No sound could be read from this video, so it has no waveform. It still plays in step. Add its song under Routine to get one.') : '')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That song could not be added.')
    }
  }
  /** Uses a song file's waveform for the routine's video. Nothing new plays: the video stays the sound and the clock. */
  const addWave = async (file?: File) => {
    if (!file) return
    try {
      if (!file.type.startsWith('audio/')) throw new Error('Choose the song as an MP3, WAV or M4A file.')
      if (file.size > MAX_AUDIO_BYTES) throw new Error('That song is larger than 60 MB. Try a shorter or more compressed file.')
      const { peaks } = await readAudio(file).catch(() => { throw new Error('This browser could not read that audio file. Try an MP3 or WAV version.') })
      await saveWave(project.id, peaks)
      decoded.current = peaks
      edit(p => { if (p.audio) p.audio.wave = { name: file.name, offset: p.audio.wave?.offset ?? 0 } })
      setSongRev(r => r + 1)
      setNotice('')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That song could not be added.')
    }
  }
  const removeAudio = () => {
    setPlaying(false)
    // The stored song is kept so undo can bring it back; it goes when the routine is deleted or another song replaces it.
    edit(p => { delete p.audio })
  }

  useEffect(() => {
    if (!playing) return
    const a = song.current
    // Starts the song whenever the playhead is inside it and it is silent: on Play, and after a loop or a seek back from past its end.
    const sound = () => {
      if (!a || !a.paused || !(timeRef.current < a.duration - 0.05)) return
      a.currentTime = timeRef.current
      a.playbackRate = speedRef.current
      a.volume = volume
      a.play().catch(() => {})
    }
    sound()
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      sound()
      // The song is the clock while it is sounding, so picture and sound cannot drift apart.
      let t = a && !a.paused && !a.ended ? a.currentTime : timeRef.current + ((now - last) / 1000) * speedRef.current
      last = now
      if (loop && t >= loopRange.current[1]) {
        t = loopRange.current[0]
        if (a) a.currentTime = t
      }
      if (t >= end) { timeRef.current = end; setTime(end); setPlaying(false); return }
      timeRef.current = t
      setTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); a?.pause() }
  }, [playing, end, loop])

  const toggle = () => {
    if (!playing && timeRef.current >= end - 0.01) seek(0)
    if (!playing) {
      select([])
      const i = positionsAt(formations, timeRef.current).index
      loopRange.current = [starts[i] - formations[i].transition, starts[i] + formations[i].hold]
    }
    setPlaying(!playing)
  }

  const view = positionsAt(formations, time)
  const here = formations[view.index]
  const gel = gelOf(here, view.index)
  let wash = gel
  if (view.moving && view.index > 0) {
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
      // A window on top (the export options) owns the keyboard while it is open.
      if (t.closest('input, textarea, select') || document.querySelector('dialog[open]')) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && k === 'y') { e.preventDefault(); redo() }
      else if (mod && k === 'a') { e.preventDefault(); select(dancers.filter(isPerson).map(d => d.id)) }
      else if (e.key === ' ' && !t.closest('button, a, [role=button], [role=slider]')) { e.preventDefault(); toggle() }
      else if (e.key === 'Escape') select([])
      else if (e.key.startsWith('Arrow') && selected.length && editable) {
        e.preventDefault()
        // A nudge is one snap step (a tenth of a unit with Shift), in the direction the key points on screen.
        const step = (e.shiftKey ? 0.1 * unitOf(stage) : stage.snap || 0.5 * unitOf(stage)) * (flipped ? -1 : 1)
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
      const list = parseProjects(await file.text())
      await Promise.all(list.map(saveProject))
      go(list.length === 1 ? `#/r/${list[0].id}` : '#/routines')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That file could not be imported.')
    }
  }

  const fileName = project.name.replace(/[\\/:*?"<>|]/g, '-')
  const one = selected.length === 1 ? dancers.find(d => d.id === selected[0]) : undefined
  const setOne = (r: (d: Dancer) => void) => edit(p => r(p.dancers.find(d => d.id === one!.id)!))
  const people = dancers.filter(isPerson)
  const things = dancers.filter(d => d.prop)
  const nameOf = (id: string) => dancers.find(d => d.id === id)?.name ?? ''
  const u = unitOf(stage)
  /** Metres as a number in the stage's own unit. */
  const len = (m: number) => +(m / u).toFixed(2)
  const fresh = newLengths(project)
  // Pairs who would walk into each other on the way into the formation being edited.
  const hits = useMemo(
    () => (current > 0 && formations[current] ? clashes(formations[current - 1].positions, formations[current].positions, dancers.filter(isPerson).map(d => d.id)) : []),
    [formations, current, dancers],
  )
  const exportVideo = async (options: { picture: boolean; mirror: boolean; height: number }) => {
    setPlaying(false)
    const ctl = (stopVideo.current = new AbortController())
    dropVideo()
    setVideo(0)
    try {
      const blob = await recordVideo(project, project.audio ? await loadAudio(project.id) : undefined, setVideo, ctl.signal, options)
      setVideoFile({ url: URL.createObjectURL(blob), name: `${fileName}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}` })
    } catch {
      if (!ctl.signal.aborted) setImportError('The video could not be made in this browser.')
    }
    setVideo(null)
  }
  const f = formations[current] ?? here
  const offstage = (
    <label className="check">
      <input type="checkbox" checked={selected.length > 0 && selected.every(id => f.positions[id]?.offstage)} onChange={e => { const on = e.target.checked; edit(p => { for (const id of selected) { const q = p.formations[current].positions[id]; if (!q) continue; if (on) q.offstage = true; else delete q.offstage } }) }} />
      Offstage in this formation
    </label>
  )
  const counts = project.timeUnit === 'counts'
  /** Seconds in one of whatever the length fields show. */
  const unit = counts ? 60 / bpm : 1
  const shown = (secs: number) => (counts ? +(secs / unit).toFixed(2) : secs)
  const list = (ds: Dancer[]) => (
    <ul className="dancer-list">
      {ds.map(d => (
        <li key={d.id}>
          <button className={selected.includes(d.id) ? 'is-selected' : ''} aria-pressed={selected.includes(d.id)} disabled={!editable}
            onClick={e => select(e.shiftKey || e.ctrlKey || e.metaKey ? (selected.includes(d.id) ? selected.filter(s => s !== d.id) : [...selected, d.id]) : [d.id])}>
            <MarkIcon d={d} /><span>{d.name}</span>
          </button>
        </li>
      ))}
    </ul>
  )
  const lengthField = { type: 'number', max: 600, step: counts ? 0.25 : 0.1, suffix: counts ? 'counts' : 's' } as const

  return (
    <div className="editor" style={{ '--gel': gel, '--wash': wash, '--gel-ink': inkOn(gel) } as CSSProperties}>
      <header className="bar">
        <a className="wordmark" href="#/routines" aria-label="Eight, back to your routines">Eight</a>
        <div className="bar-title">
          <Field label="Routine name" value={project.name} maxLength={80} onCommit={v => edit(p => { p.name = v })} />
          <span className="bar-meta" role="status">
            {saveError ? <strong className="bad">Not saved: {saveError}</strong> : `${plural(dancers.filter(isPerson).length, 'dancer')} · ${plural(formations.length, 'formation')} · saved on this device`}
          </span>
        </div>
        <nav className="bar-actions" aria-label="Routine actions">
          <ThemeToggle />
          <button className="btn" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)"><Icon name="undo" />Undo</button>
          <button className="btn" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" />Redo</button>
          <button className="btn" onClick={() => importRef.current?.click()}><Icon name="upload" />Import</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { importFile(e.target.files?.[0]); e.target.value = '' }} />
          <button className="btn btn-solid" onClick={() => exportBox.current?.showModal()}><Icon name="download" />Export</button>
        </nav>
      </header>
      <ExportDialog box={exportBox} hasVideo={hasVideo} showVideo={showVideo} mirrored={mirrored} busy={video !== null} length={totalTime(formations)} formation={formationLabel(here, view.index).title}
        onExport={(kind, options) => {
          if (kind === 'file') download(`${fileName}.eight.json`, JSON.stringify(project, null, 2))
          else if (kind === 'picture') savePng(document.querySelector<SVGSVGElement>('.floor .stage')!, `${fileName} - ${formationLabel(here, view.index).title}.png`).catch(() => setImportError('The picture could not be made in this browser.'))
          else if (kind === 'pdf') go(`#/r/${project.id}/print`)
          else exportVideo(options)
        }} />
      {notice && <p className="toast is-info" role="status">{notice} <button className="link" onClick={() => setNotice('')}>Dismiss</button></p>}
      {importError && <p className="toast" role="alert">{importError} <button className="link" onClick={() => setImportError('')}>Dismiss</button></p>}

      {video !== null && <p className="toast is-info" role="status">Recording the video: {Math.round(video * 100)}%. It plays through once at normal speed, so keep this tab open. <button className="link" onClick={() => stopVideo.current?.abort()}>Cancel</button></p>}
      {videoFile && <p className="toast is-info" role="status">Your video is ready. <a className="link" href={videoFile.url} download={videoFile.name}>Save {videoFile.name}</a> <button className="link" onClick={dropVideo}>Dismiss</button></p>}

      <aside className="rail" aria-label="Dancers and props">
        <h2>Dancers <span>{people.length}</span></h2>
        {list(people)}
        <button className="btn btn-line" onClick={addDancer} disabled={!editable}><Icon name="plus" />Add dancer</button>
        <h2 className="spaced">Props <span>{things.length}</span></h2>
        {things.length > 0 && list(things)}
        <button className="btn btn-line" onClick={addProp} disabled={!editable}><Icon name="plus" />Add prop</button>
      </aside>

      <main className={`floor${hasVideo && showVideo ? ' has-screen' : ''}`}>
        <span className="chip">{pad(view.index + 1)} · {gelName(gel)}</span>
        <StageView stage={stage} dancers={dancers} positions={view.positions} selected={editable ? selected : []}
          onSelect={editable ? select : undefined} onMove={editable ? m => moveDancers(current, m) : undefined}
          ghosts={editable ? formations[current - 1]?.positions : undefined} next={editable ? formations[current + 1]?.positions : undefined} paths={paths} flip={flipped} clash={editable ? hits.flat() : []}
          onBend={editable ? (id, via) => edit(p => { const q = p.formations[current].positions[id]; if (via) q.via = via; else delete q.via }) : undefined} />
        {/* The video element itself is put in here when a video is attached, so it keeps playing across re-renders. */}
        <div className={`screen${mirrored ? ' is-mirrored' : ''}`} ref={screen} hidden={!hasVideo || !showVideo} aria-label="The routine's video" />
        <div className="floor-tool">
          <label>Paths
            <select value={paths} onChange={e => setPaths(e.target.value as PathMode)}>
              <option value="selected">For selected dancers</option><option value="always">For everyone</option><option value="never">Hidden</option>
            </select>
          </label>
          <button className="btn btn-line" aria-pressed={flipped} onClick={() => setFlipped(!flipped)} title="Shows the stage from the back, the way the dancers face, with the audience at the top">Dancers' view</button>
          {hasVideo && showVideo && <button className="btn btn-line" aria-pressed={mirrored} onClick={() => setMirrored(!mirrored)} title="Flips the video left to right, like a mirror, so you can follow it facing the same way">Mirror video</button>}
          {hasVideo && <button className="btn btn-line" onClick={() => setShowVideo(!showVideo)}>{showVideo ? 'Hide video' : 'Show video'}</button>}
        </div>
        {playing && here.note && <p className="caption">{here.note}</p>}
        <p className="hint">
          {playing ? 'Playing. Press Space to stop.'
            : view.moving ? `Between formations at ${clock(time)}. Click a formation below to edit it.`
            : 'Drag to move · Shift-click or drag a box to select several · arrow keys nudge · Alt turns snapping off'}
        </p>
      </main>

      <aside className="rail rail-right" aria-label="Details">
        {one && f.positions[one.id] ? (
          <>
            <h2>{one.prop ? 'Prop' : 'Dancer'}</h2>
            <Field label="Name" value={one.name} maxLength={40} onCommit={v => setOne(d => { d.name = v })} />
            {one.prop ? (
              <div className="pair">
                <Field label="Width" type="number" min={0.5} max={60} step={0.5} suffix={stage.unit} value={len(one.prop.w)} onCommit={v => setOne(d => { d.prop!.w = round(Number(v) * u) })} />
                <Field label="Depth" type="number" min={0.5} max={60} step={0.5} suffix={stage.unit} value={len(one.prop.h)} onCommit={v => setOne(d => { d.prop!.h = round(Number(v) * u) })} />
              </div>
            ) : (
              <>
                <Field label="Label (1 to 3 characters)" value={one.label} maxLength={3} onCommit={v => setOne(d => { d.label = v })} />
                <label className="field"><span>Shape</span>
                  <select value={one.shape} onChange={e => setOne(d => { d.shape = e.target.value as Shape })}>
                    {SHAPES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </label>
              </>
            )}
            <Swatches label="Colour" value={one.color} options={DANCER_COLORS} custom onPick={c => setOne(d => { d.color = c })} />
            {offstage}
            <p className="readout"><span>Position in this formation</span><strong>{describe(f.positions[one.id], stage)}</strong></p>
            <button className="btn btn-line btn-danger" onClick={() => removeDancers([one.id])}><Icon name="trash" />Remove from routine</button>
          </>
        ) : selected.length > 1 ? (
          <>
            <h2>{selected.length} selected</h2>
            <Swatches label="Colour for all" value="" options={DANCER_COLORS} custom onPick={c => edit(p => { for (const d of p.dancers) if (selected.includes(d.id)) d.color = c })} />
            {offstage}
            <Arrange label="Arrange the selection" ids={selected.filter(id => people.some(d => d.id === id))} positions={f.positions} formation={current} stage={stage} />
            <button className="btn btn-line btn-danger" onClick={() => removeDancers(selected)}><Icon name="trash" />Remove {selected.length} from routine</button>
          </>
        ) : (
          <>
            <h2>Formation {pad(current + 1)}</h2>
            {hits.length > 0 && (
              <p className="warn" role="status">
                {hits.slice(0, 3).map(([a, b]) => `${nameOf(a)} and ${nameOf(b)}`).join('; ')}{hits.length > 3 ? `, and ${hits.length - 3} more,` : ''} cross paths moving into this formation. Bend a path or move someone to clear it.
              </p>
            )}
            <Field label="Name (optional)" value={formationLabel(f, current).sub ? f.name : ''} placeholder="Chorus, bridge, final pose…" allowEmpty maxLength={60} onCommit={v => edit(p => { p.formations[current].name = v })} />
            <Swatches label="Lighting colour" value={gelOf(f, current)} options={GELS.map(g => g.hex)} names={GELS.map(g => g.name)} onPick={c => edit(p => { p.formations[current].color = c })} />
            <div className="pair">
              <Field label="In formation" {...lengthField} min={counts ? 0.25 : 0.1} value={shown(f.hold)} onCommit={v => edit(p => { p.formations[current].hold = Math.max(0.1, tidy(p, Number(v) * unit)) })} />
              <Field label="Moving in" {...lengthField} min={0} value={shown(f.transition)} onCommit={v => edit(p => { p.formations[current].transition = tidy(p, Number(v) * unit) })} />
            </div>
            <label className="field"><span>Note</span>
              <textarea key={f.id} rows={3} defaultValue={f.note ?? ''} placeholder="What happens here?" onBlur={e => { const v = e.target.value.trim(); if (v !== (f.note ?? '')) edit(p => { p.formations[current].note = v || undefined }) }} />
            </label>
            <Arrange label="Arrange everyone" all ids={people.map(d => d.id)} positions={f.positions} formation={current} stage={stage} />
            <div className="row">
              <button className="btn btn-line" onClick={() => { moveFormation(current, current - 1); follow() }} disabled={current === 0} aria-label="Move formation earlier"><Icon name="left" />Earlier</button>
              <button className="btn btn-line" onClick={() => { moveFormation(current, current + 1); follow() }} disabled={current === formations.length - 1} aria-label="Move formation later">Later<Icon name="right" /></button>
            </div>
            <button className="btn btn-line btn-danger" onClick={() => { deleteFormation(current); follow() }} disabled={formations.length === 1}><Icon name="trash" />Delete formation</button>
            <h2 className="spaced">Routine</h2>
            <label className="field"><span>Time formations in</span>
              <select value={counts ? 'counts' : 'seconds'} onChange={e => edit(p => { p.timeUnit = e.target.value as 'seconds' | 'counts' })}>
                <option value="seconds">Seconds, free against the song</option><option value="counts">Counts, on the beat</option>
              </select>
            </label>
            <Field label="Tempo of the beat grid" type="number" min={30} max={240} step={1} suffix="BPM" value={bpm} onCommit={v => edit(p => {
              const to = Number(v)
              // In counts, a formation keeps its number of counts when the tempo changes, so its seconds stretch.
              if (p.timeUnit === 'counts') for (const g of [...p.formations, ...(p.defaults ? [p.defaults] : [])]) { g.hold = tidy(p, (g.hold * p.bpm) / to); g.transition = tidy(p, (g.transition * p.bpm) / to) }
              p.bpm = to
            })} />
            <Field label="First beat at" type="number" min={0} max={600} step={0.01} suffix="s" value={project.beatOffset ?? 0} onCommit={v => edit(p => { p.beatOffset = round(Number(v)) })} />
            <button className="btn btn-line" onClick={() => edit(p => { p.beatOffset = round(time) })}>Set first beat to playhead</button>
            {hasVideo && (project.audio?.wave ? (
              <>
                <p className="readout"><span>Waveform from</span><strong>{project.audio.wave.name}</strong></p>
                <Field label="That song starts this far into the video" type="number" min={-600} max={600} step={0.01} suffix="s" value={project.audio.wave.offset} onCommit={v => edit(p => { p.audio!.wave!.offset = round(Number(v)) })} />
                <div className="row">
                  <button className="btn btn-line" onClick={() => edit(p => { p.audio!.wave!.offset = round(time) })} title="Put the playhead where the song starts in the video, then press this">Starts at playhead</button>
                  <button className="btn btn-line" onClick={() => edit(p => { delete p.audio!.wave })}>Use the video's sound</button>
                </div>
              </>
            ) : <button className="btn btn-line" onClick={() => waveRef.current?.click()} title="Draws the waveform from the song itself, which is cleaner than a video's sound and works for videos too big to read">Use a song file for the waveform</button>)}
            <Field label="Counts in a bar" type="number" min={2} max={16} step={1} value={project.countsPerBar ?? 8} onCommit={v => edit(p => { p.countsPerBar = Math.round(Number(v)) })} />
            <div className="pair">
              <Field label="New formations hold" {...lengthField} min={counts ? 0.25 : 0.1} value={shown(fresh.hold)} onCommit={v => edit(p => { p.defaults = { ...newLengths(p), hold: Math.max(0.1, tidy(p, Number(v) * unit)) } })} />
              <Field label="and move in" {...lengthField} min={0} value={shown(fresh.transition)} onCommit={v => edit(p => { p.defaults = { ...newLengths(p), transition: tidy(p, Number(v) * unit) } })} />
            </div>
            <h2 className="spaced">Stage</h2>
            <label className="field"><span>Measure in</span>
              <select value={stage.unit} onChange={e => edit(p => { const ft = e.target.value === 'ft'; p.stage.unit = ft ? 'ft' : 'm'; p.stage.gridSize = ft ? 2 * FT : 1; p.stage.snap = ft ? FT : 0.5 })}>
                <option value="m">Metres</option><option value="ft">Feet</option>
              </select>
            </label>
            <div className="pair">
              <Field label="Stage width" type="number" min={Math.ceil(2 / u)} max={Math.floor(60 / u)} step={u === 1 ? 0.5 : 1} suffix={stage.unit} value={len(stage.width)} onCommit={v => resizeStage({ width: round(Number(v) * u) })} />
              <Field label="Stage depth" type="number" min={Math.ceil(2 / u)} max={Math.floor(60 / u)} step={u === 1 ? 0.5 : 1} suffix={stage.unit} value={len(stage.depth)} onCommit={v => resizeStage({ depth: round(Number(v) * u) })} />
            </div>
            <div className="pair">
              <label className="field"><span>Grid lines every</span>
                <select value={stage.gridSize} onChange={e => edit(p => { p.stage.gridSize = Number(e.target.value) })}>
                  {(u === 1 ? [0.5, 1, 2] : [1, 2, 5]).map(n => <option key={n} value={n * u}>{n} {stage.unit}</option>)}
                </select>
              </label>
              <label className="field"><span>Dancers snap to</span>
                <select value={stage.snap ?? 0.5} onChange={e => edit(p => { p.stage.snap = Number(e.target.value) })}>
                  <option value={0}>Nothing</option>
                  {(u === 1 ? [0.25, 0.5, 1] : [0.5, 1, 2]).map(n => <option key={n} value={n * u}>{n} {stage.unit}</option>)}
                </select>
              </label>
            </div>
            <label className="field"><span>Floor markings</span>
              <select value={stage.marks ?? 'centre'} onChange={e => edit(p => { const v = e.target.value; if (v === 'centre') delete p.stage.marks; else p.stage.marks = v as 'quarters' | 'numbers' })}>
                <option value="centre">Centre line</option><option value="quarters">Centre and quarter lines</option><option value="numbers">Centre line and numbers along the front</option>
              </select>
            </label>
          </>
        )}
      </aside>

      <Timeline project={project} time={time} playing={playing} index={view.index} peaks={peaks} audioMissing={audioMissing} hasVideo={hasVideo}
        speed={speed} onSpeed={setSpeed} volume={volume} onVolume={setVolume} loop={loop} onLoop={setLoop}
        onSeek={seek} onToggle={toggle} onAddFormation={() => { addFormation(); follow() }} onFollow={follow}
        onPickAudio={() => audioRef.current?.click()} onPickWave={() => waveRef.current?.click()} onRemoveAudio={removeAudio} />
      <input ref={waveRef} type="file" accept="audio/*,.mp3,.wav,.m4a" hidden onChange={e => { addWave(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={audioRef} type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.mov,.webm" hidden onChange={e => { addAudio(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

function Swatches({ label, value, options, names, custom, onPick }: { label: string; value: string; options: string[]; names?: string[]; /** Also offer the browser's colour picker, for any colour at all. */ custom?: boolean; onPick: (c: string) => void }) {
  return (
    <fieldset className="chips">
      <legend>{label}</legend>
      {options.map((c, i) => (
        <button key={c} type="button" style={{ background: c }} className={c === value ? 'is-on' : ''} aria-pressed={c === value} aria-label={names?.[i] ?? `Colour ${i + 1}`} title={names?.[i]} onClick={() => onPick(c)} />
      ))}
      {custom && <input type="color" aria-label="Any other colour" title="Any other colour" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'} onChange={e => onPick(e.target.value)} />}
    </fieldset>
  )
}

const PRESETS: [Preset, string][] = [['line', 'Line'], ['rows', 'Two rows'], ['block', 'Block'], ['circle', 'Circle'], ['v', 'V'], ['pyramid', 'Pyramid']]

/** Puts a group into a ready-made shape, or turns, mirrors and resizes the shape it is in. Each press is one undo step. */
function Arrange({ label, ids, positions, formation, stage, all }: { label: string; ids: string[]; positions: Record<string, Position>; formation: number; stage: Stage; /** Work around the middle of the stage instead of the middle of the group. */ all?: boolean }) {
  const live = ids.filter(id => positions[id])
  if (live.length < 2) return null
  const c = all ? { x: 0, y: stage.depth / 2 } : centroid(live.map(id => positions[id]))
  // Left to right, then front to back, so a shape keeps people roughly on the side they were on.
  const order = [...live].sort((a, b) => positions[a].x - positions[b].x || positions[a].y - positions[b].y)
  const apply = (to: (q: Position, i: number) => { x: number; y: number }) => moveDancers(formation, Object.fromEntries(order.map((id, i) => [id, to(positions[id], i)])))
  const shape = (kind: Preset) => {
    const pts = presetShape(kind, order.length, stage.unit === 'ft' ? 3 * FT : 1)
    apply((_, i) => ({ x: c.x + pts[i].x, y: c.y + pts[i].y }))
  }
  const turn = (deg: number) => {
    const [cos, sin] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
    apply(q => ({ x: c.x + (q.x - c.x) * cos - (q.y - c.y) * sin, y: c.y + (q.x - c.x) * sin + (q.y - c.y) * cos }))
  }
  const scale = (k: number) => apply(q => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k }))
  const btn = (text: string, run: () => void, title?: string) => <button key={text} type="button" className="btn btn-line" title={title} onClick={run}>{text}</button>
  return (
    <fieldset className="arrange">
      <legend>{label}</legend>
      {PRESETS.map(([kind, text]) => btn(text, () => shape(kind)))}
      {btn('Turn left', () => turn(15), 'Turns the group 15 degrees anticlockwise')}
      {btn('Turn right', () => turn(-15), 'Turns the group 15 degrees clockwise')}
      {btn('Mirror', () => apply(q => ({ x: 2 * c.x - q.x, y: q.y })), 'Swaps left and right')}
      {btn('Spread', () => scale(1.2))}
      {btn('Tighten', () => scale(1 / 1.2))}
    </fieldset>
  )
}

type ExportKind = 'file' | 'picture' | 'pdf' | 'video'

/** The export options window: what to save, and for a video, how. */
function ExportDialog({ box, hasVideo, showVideo, mirrored, busy, length, formation, onExport }: {
  box: React.RefObject<HTMLDialogElement | null>
  hasVideo: boolean
  /** How the editor shows the routine's video right now; the video options start from these. */
  showVideo: boolean
  mirrored: boolean
  /** A video is already being recorded. */
  busy: boolean
  /** Seconds the routine runs, which is how long a video takes to record. */
  length: number
  formation: string
  onExport: (kind: ExportKind, options: { picture: boolean; mirror: boolean; height: number }) => void
}) {
  const [kind, setKind] = useState<ExportKind>('file')
  const [height, setHeight] = useState(1080)
  const [picture, setPicture] = useState(showVideo)
  const [mirror, setMirror] = useState(mirrored)
  // Each time the editor's own video settings change, the window starts from them again.
  useEffect(() => { setPicture(showVideo); setMirror(mirrored) }, [showVideo, mirrored])
  const choice = (value: ExportKind, title: string, about: string) => (
    <label className="choice">
      <input type="radio" name="kind" checked={kind === value} onChange={() => setKind(value)} />
      <b>{title}</b>
      <span>{about}</span>
    </label>
  )
  return (
    <dialog className="dialog" ref={box} aria-labelledby="export-title" onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
      <form method="dialog" onSubmit={() => { const options = { picture: hasVideo && picture, mirror, height }; setTimeout(() => onExport(kind, options)) }}>
        <h2 id="export-title">Export</h2>
        {choice('file', 'Routine file', 'Everything except the music or video, to back up or send to someone who uses Eight.')}
        {choice('picture', 'Picture', `${formation} as it is on the stage now, as a PNG image.`)}
        {choice('pdf', 'PDF sheets', 'Every formation on paper. Opens the print page, where you choose the layout.')}
        {choice('video', 'Video', 'The whole routine playing through, with its sound, as a video file.')}
        {kind === 'video' && (
          <fieldset className="dialog-more">
            <legend>Video options</legend>
            <label className="field"><span>Size</span>
              <select value={height} onChange={e => setHeight(Number(e.target.value))}>
                <option value={1080}>1080p (1920 × 1080), sharper</option><option value={720}>720p (1280 × 720), smaller file, easier on a slow computer</option>
              </select>
            </label>
            {hasVideo && <label className="check"><input type="checkbox" checked={picture} onChange={e => setPicture(e.target.checked)} />Show the routine's video beside the formations</label>}
            {hasVideo && picture && <label className="check"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} />Mirror that video left to right</label>}
            <p className="dialog-note">It records while the routine plays through once, so this takes about {clock(length + 1).slice(0, -3)}. Keep this tab open until the Save link appears.</p>
          </fieldset>
        )}
        <div className="row">
          <button type="button" className="btn btn-line" onClick={() => box.current?.close()}>Cancel</button>
          <button className="btn btn-solid" disabled={kind === 'video' && busy}>{kind === 'pdf' ? 'Open the print page' : kind === 'video' && busy ? 'Already recording…' : 'Export'}</button>
        </div>
      </form>
    </dialog>
  )
}
