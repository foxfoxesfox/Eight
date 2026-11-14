import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { clock, PEAK_RATE } from './audio'
import { gelName, gelOf, inkOn, round, startTimes, totalTime, type Formation, type Project } from './model'
import { edit } from './store'
import { Icon } from './ui'

const MIN_HOLD = 0.1
const pad = (n: number) => String(n).padStart(2, '0')
const secs = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)} s`

type Edge = 'hold' | 'transition'
type Trim = { i: number; edge: Edge; x0: number; from: number; value: number }

interface Props {
  project: Project
  time: number
  playing: boolean
  index: number
  peaks: Float32Array | null
  audioMissing: boolean
  onSeek: (t: number) => void
  onToggle: () => void
  onAddFormation: () => void
  onPickAudio: () => void
  onRemoveAudio: () => void
}

export function Timeline({ project, time, playing, index, peaks, audioMissing, onSeek, onToggle, onAddFormation, onPickAudio, onRemoveAudio }: Props) {
  const [pps, setPps] = useState(48) // pixels per second
  const [snap, setSnap] = useState(false)
  const [view, setView] = useState({ left: 0, width: 800 })
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The ref is what handlers read, so a fast drag never sees a stale value; the state copy drives rendering.
  const live = useRef<Trim | null>(null)
  const [trim, render] = useState<Trim | null>(null)
  const setTrim = (t: Trim | null) => { live.current = t; render(t) }

  // The divider inside a bar moves the split between moving in and holding, so the bar keeps its length.
  const resize = (f: Formation, edge: Edge, v: number) => (edge === 'hold' ? { hold: v } : { transition: v, hold: round(f.transition + f.hold - v) })
  const beat = 60 / project.bpm
  const beatAt = project.beatOffset ?? 0
  const formations = trim ? project.formations.map((f, i) => (i === trim.i ? { ...f, ...resize(f, trim.edge, trim.value) } : f)) : project.formations
  const starts = startTimes(formations)
  const end = Math.max(totalTime(formations), project.audio?.duration ?? 0)
  const width = Math.max(view.width, (end + 3) * pps)

  useLayoutEffect(() => {
    const el = scroller.current!
    const measure = () => setView({ left: el.scrollLeft, width: el.clientWidth })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current!
    const x = time * pps
    if (playing && (x > el.scrollLeft + el.clientWidth - 48 || x < el.scrollLeft)) el.scrollLeft = Math.max(0, x - 96)
  }, [time, playing, pps])

  // The waveform is drawn only for the visible stretch, so any zoom level stays within canvas size limits.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = devicePixelRatio || 1
    const w = view.width
    const h = c.clientHeight
    c.width = w * dpr
    c.height = h * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, w, h)
    if (!peaks) return
    g.fillStyle = getComputedStyle(c).color
    for (let x = 0; x < w; x++) {
      const a = Math.floor(((view.left + x) / pps) * PEAK_RATE)
      const b = Math.max(a + 1, Math.floor(((view.left + x + 1) / pps) * PEAK_RATE))
      if (a >= peaks.length) break
      let v = 0
      for (let k = a; k < b && k < peaks.length; k++) if (peaks[k] > v) v = peaks[k]
      const bar = Math.max(1, v * (h - 4))
      g.fillRect(x, (h - bar) / 2, 1, bar)
    }
  }, [peaks, pps, view])

  const snapped = (t: number) => (snap ? beatAt + Math.round((t - beatAt) / beat) * beat : t)

  // ---- Trimming: the right edge sets how long a formation holds, the divider how much of the bar is spent moving in. ----
  const edgeTime = (i: number, edge: Edge) => (edge === 'hold' ? starts[i] + formations[i].hold : starts[i])
  const most = (i: number, edge: Edge) => (edge === 'hold' ? 600 : round(project.formations[i].transition + project.formations[i].hold - MIN_HOLD))
  const limit = (i: number, edge: Edge, v: number) => round(Math.max(edge === 'hold' ? MIN_HOLD : 0, Math.min(most(i, edge), v)))
  const commit = (i: number, edge: Edge, value: number) => {
    if (value !== project.formations[i][edge]) edit(p => { Object.assign(p.formations[i], resize(p.formations[i], edge, value)) })
  }
  const trimDown = (e: PointerEvent, i: number, edge: Edge) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const from = project.formations[i][edge]
    setTrim({ i, edge, x0: e.clientX, from, value: from })
  }
  const trimMove = (e: PointerEvent) => {
    const t = live.current
    if (!t) return
    const base = edgeTime(t.i, t.edge) - t.value // where this edge would sit at zero length
    const wanted = base + t.from + (e.clientX - t.x0) / pps
    setTrim({ ...t, value: limit(t.i, t.edge, (e.altKey ? wanted : snapped(wanted)) - base) })
  }
  const trimUp = () => {
    const t = live.current
    if (!t) return
    setTrim(null)
    commit(t.i, t.edge, t.value)
  }
  const trimKey = (e: KeyboardEvent, i: number, edge: Edge) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    e.stopPropagation()
    commit(i, edge, limit(i, edge, project.formations[i][edge] + dir * (e.shiftKey ? 1 : 0.1)))
  }
  const handle = (i: number, edge: Edge) => (
    <span
      className={`trim trim-${edge}`}
      style={edge === 'transition' ? { left: Math.max(0, formations[i].transition * pps - 6) } : undefined}
      role="slider"
      tabIndex={0}
      aria-label={edge === 'hold' ? `How long ${formations[i].name} holds` : `How much of ${formations[i].name} is spent moving in`}
      aria-valuemin={edge === 'hold' ? MIN_HOLD : 0}
      aria-valuemax={most(i, edge)}
      aria-valuenow={formations[i][edge]}
      aria-valuetext={secs(formations[i][edge])}
      title="Drag to change the length. Arrow keys work too."
      onPointerDown={e => trimDown(e, i, edge)}
      onPointerMove={trimMove}
      onPointerUp={trimUp}
      onPointerCancel={() => setTrim(null)}
      onKeyDown={e => trimKey(e, i, edge)}
    />
  )

  // ---- Scrubbing ----
  const scrub = (e: PointerEvent) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onSeek(snapped((e.clientX - track.current!.getBoundingClientRect().left) / pps))
  }

  const zoom = (k: number) => setPps(v => Math.max(4, Math.min(400, v * k)))
  const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120].find(s => s * pps >= 64) ?? 300
  const ticks = Array.from({ length: Math.floor(width / pps / step) + 1 }, (_, k) => k * step)
  const beatNow = Math.max(0, Math.floor((time - beatAt) / beat))

  return (
    <footer className="deck">
      <div className="deck-bar">
        <button className="btn btn-play" onClick={onToggle} aria-label={playing ? 'Stop' : 'Play from the playhead'}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Stop' : 'Play'}</button>
        <p className="deck-now"><strong>{clock(time)}</strong><span>of {clock(end)} · {formations[index].name} · bar {Math.floor(beatNow / 8) + 1}, count {(beatNow % 8) + 1}</span></p>
        <div className="deck-tools">
          <label className="check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap to beats</label>
          <span className="zoom" role="group" aria-label="Timeline zoom">
            <button className="btn btn-line" onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">−</button>
            <button className="btn btn-line" onClick={() => setPps(Math.max(4, Math.min(400, (view.width - 24) / (end + 1))))}>Fit</button>
            <button className="btn btn-line" onClick={() => zoom(1.5)} aria-label="Zoom in">+</button>
          </span>
          {project.audio
            ? <button className="btn btn-line" onClick={onRemoveAudio} title={project.audio.name}>Remove music</button>
            : <button className="btn btn-line" onClick={onPickAudio}><Icon name="upload" />Add music</button>}
          <button className="btn btn-line" onClick={onAddFormation} disabled={playing}><Icon name="plus" />Add formation</button>
        </div>
      </div>

      <div className="reel" ref={scroller} onScroll={e => setView({ left: e.currentTarget.scrollLeft, width: e.currentTarget.clientWidth })}>
        <div className={`track${snap ? ' has-beats' : ''}`} ref={track} style={{ width, '--beat': `${beat * pps}px`, '--beat-at': `${beatAt * pps}px` } as CSSProperties}>
          <div className="ruler" onPointerDown={scrub} onPointerMove={scrub} title="Click or drag to move the playhead">
            {ticks.map(t => <span key={t} style={{ left: t * pps }}>{step < 1 ? clock(t) : clock(t).slice(0, -3)}</span>)}
          </div>

          <ol className="clips">
            {formations.map((f, i) => {
              const hex = gelOf(f, i)
              const move = f.transition
              return (
                <li key={f.id}>
                  <div className={`clip${i === index ? ' is-current' : ''}`} style={{ left: (starts[i] - move) * pps, width: (move + f.hold) * pps, background: hex, color: inkOn(hex) }}>
                    <button className="clip-body" aria-current={i === index} onClick={() => onSeek(starts[i])}>
                      <small>{pad(i + 1)} · {gelName(hex)}</small>
                      <b>{f.name}</b>
                    </button>
                    {move > 0 && (
                      <button className="clip-move" style={{ width: move * pps }} onClick={() => onSeek(starts[i] - move)} aria-label={`Moving into ${f.name}, ${secs(move)}`}>
                        {secs(move)} moving in
                      </button>
                    )}
                    <span className="clip-hold" style={{ left: move * pps }}>{secs(f.hold)} in formation</span>
                    {handle(i, 'transition')}
                    {handle(i, 'hold')}
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="wave">
            {project.audio && !audioMissing
              ? <canvas ref={canvas} style={{ width: view.width, left: view.left }} aria-label={`Waveform of ${project.audio.name}`} role="img" />
              : <p style={{ left: view.left, width: view.width }}>
                  {audioMissing ? <>The music for this routine isn't on this device. <button className="link" onClick={onPickAudio}>Add the song again</button></>
                    : <>No music yet. <button className="link" onClick={onPickAudio}>Add a song</button> to line formations up with what you hear.</>}
                </p>}
          </div>

          <span className="playhead" style={{ left: time * pps }} aria-hidden="true" />
        </div>
      </div>
    </footer>
  )
}
