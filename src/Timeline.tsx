import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { clock, PEAK_RATE } from './audio'
import { formationLabel, gelOf, inkOn, span, startTimes, tidy, totalTime, type Formation, type Project } from './model'
import { addFormation, deleteFormation, edit, matchPrevious, moveFormation, resetLine } from './store'
import { Icon, Menu } from './ui'

const MIN_HOLD = 0.1

type Edge = 'hold' | 'transition'
type Snap = 'off' | 'count' | 'half' | 'bar' | 'second' | 'edge'
type Trim = { i: number; edge: Edge; x0: number; from: number; value: number }

interface Props {
  project: Project
  time: number
  playing: boolean
  index: number
  peaks: Float32Array | null
  audioMissing: boolean
  /** Height of the timeline's track area, which the person can drag taller or shorter. */
  trackHeight: number
  /** The routine's music is a video, shown beside the stage. */
  hasVideo: boolean
  speed: number
  onSpeed: (s: number) => void
  /** Loudness of the song or video, 0 to 1. */
  volume: number
  onVolume: (v: number) => void
  loop: boolean
  onLoop: (on: boolean) => void
  onSeek: (t: number) => void
  onToggle: () => void
  /** Adds a formation at the end. */
  onAddFormation: () => void
  /** A song or video is being read in. */
  reading: boolean
  /** Puts the playhead on the current formation after the formations themselves changed. */
  onFollow: () => void
  onPickAudio: () => void
  onRemoveAudio: () => void
  /** Choose a song file to draw the waveform from, for a video that has none. */
  onPickWave: () => void
}

export function Timeline({ project, time, playing, index, peaks, audioMissing, trackHeight, hasVideo, speed, onSpeed, volume, onVolume, loop, onLoop, onSeek, onToggle, onAddFormation, reading, onFollow, onPickAudio, onRemoveAudio, onPickWave }: Props) {
  /** Seconds into the timeline where the drawn waveform starts. */
  const waveAt = project.audio?.wave?.offset ?? 0
  /** The right-click menu: which formation it is for and where it was opened. */
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null)
  /** The sound track's settings menu, and where it opens. */
  const [soundMenu, setSoundMenu] = useState<{ x: number; y: number } | null>(null)
  const [pps, setPps] = useState(48) // pixels per second
  const counts = project.timeUnit === 'counts'
  const secs = (n: number) => span(project, n)
  /** The longest of `options` that fits in `px` at about `charW` pixels a character; nothing if none does. The full text is always in the tooltip. */
  const fit = (px: number, charW: number, ...options: string[]) => options.find(t => t.length * charW + 30 <= px) ?? ''
  const [snap, setSnap] = useState<Snap>(counts ? 'count' : 'off')
  // Timing in counts means working on the beat grid, so snapping comes on with it.
  useEffect(() => setSnap(counts ? 'count' : 'off'), [counts])
  const perBar = project.countsPerBar ?? 8
  const [view, setView] = useState({ left: 0, width: 800 })
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The ref is what handlers read, so a fast drag never sees a stale value; the state copy drives rendering.
  const live = useRef<Trim | null>(null)
  const [trim, render] = useState<Trim | null>(null)
  const setTrim = (t: Trim | null) => { live.current = t; render(t) }

  // The divider inside a bar moves the split between moving in and holding, so the bar keeps its length.
  const resize = (f: Formation, edge: Edge, v: number) => (edge === 'hold' ? { hold: v } : { transition: v, hold: tidy(project, f.transition + f.hold - v) })
  const beat = 60 / project.bpm
  const beatAt = project.beatOffset ?? 0
  const formations = trim ? project.formations.map((f, i) => (i === trim.i ? { ...f, ...resize(f, trim.edge, trim.value) } : f)) : project.formations
  const starts = startTimes(formations)
  const end = Math.max(totalTime(formations), project.audio?.duration ?? 0)
  // Room after the end for the Add formation slot at any zoom.
  const width = Math.max(view.width, end * pps + Math.max(3 * pps, 170))

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
      const a = Math.floor(((view.left + x) / pps - waveAt) * PEAK_RATE)
      const b = Math.max(a + 1, Math.floor(((view.left + x + 1) / pps - waveAt) * PEAK_RATE))
      if (a < 0) continue
      if (a >= peaks.length) break
      let v = 0
      for (let k = a; k < b && k < peaks.length; k++) if (peaks[k] > v) v = peaks[k]
      const bar = Math.max(1, v * (h - 4))
      g.fillRect(x, (h - bar) / 2, 1, bar)
    }
  }, [peaks, pps, view, waveAt, trackHeight])

  // Seconds between snap lines, or 0 when snapping is off or goes to edges instead of a grid.
  const grid = { off: 0, edge: 0, count: beat, half: beat / 2, bar: beat * perBar, second: 1 }[snap]
  const gridAt = snap === 'second' ? 0 : beatAt
  /** Every place a formation starts moving, arrives or ends, and where the song ends. */
  const edges = [...starts.flatMap((s, i) => [s - formations[i].transition, s, s + formations[i].hold]), project.audio?.duration ?? 0]
  const snapped = (t: number, to = edges) => {
    if (grid) return gridAt + Math.round((t - gridAt) / grid) * grid
    if (snap !== 'edge') return t
    const near = to.reduce((best, m) => (Math.abs(m - t) < Math.abs(best - t) ? m : best), Infinity)
    return Math.abs(near - t) * pps <= 8 ? near : t
  }

  // ---- Trimming: the right edge sets how long a formation holds, the divider how much of the bar is spent moving in. ----
  const edgeTime = (i: number, edge: Edge) => (edge === 'hold' ? starts[i] + formations[i].hold : starts[i])
  const most = (i: number, edge: Edge) => (edge === 'hold' ? 600 : tidy(project, project.formations[i].transition + project.formations[i].hold - MIN_HOLD))
  const limit = (i: number, edge: Edge, v: number) => tidy(project, Math.max(edge === 'hold' ? MIN_HOLD : 0, Math.min(most(i, edge), v)))
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
    setTrim({ ...t, value: limit(t.i, t.edge, (e.altKey ? wanted : snapped(wanted, [time, project.audio?.duration ?? 0])) - base) })
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
    commit(i, edge, limit(i, edge, project.formations[i][edge] + dir * (counts ? (e.shiftKey ? perBar : 1) * beat : e.shiftKey ? 1 : 0.1)))
  }
  const handle = (i: number, edge: Edge) => (
    <span
      className={`trim trim-${edge}`}
      style={edge === 'transition' ? { left: Math.max(0, formations[i].transition * pps - 6) } : undefined}
      role="slider"
      tabIndex={0}
      aria-label={edge === 'hold' ? `How long ${formationLabel(formations[i], i).title} holds` : `How much of ${formationLabel(formations[i], i).title} is spent moving in`}
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
        <p className="deck-now" title={`${formationLabel(formations[index], index).title}, bar ${Math.floor(beatNow / perBar) + 1}, count ${(beatNow % perBar) + 1}`}><strong>{clock(time)}</strong><span><span>of {clock(end)}</span><span>{formationLabel(formations[index], index).title} · bar {Math.floor(beatNow / perBar) + 1}, count {(beatNow % perBar) + 1}</span></span></p>
        <div className="deck-tools">
          <label className="check slider">Speed
            <input type="range" min={0.25} max={1.5} step={0.05} value={speed} onChange={e => onSpeed(Number(e.target.value))} onDoubleClick={() => onSpeed(1)} aria-valuetext={`${speed} times normal speed`} title="Drag to slow down or speed up. Double-click for normal speed." />
            <output>{speed.toFixed(2)}×</output>
          </label>
          <label className="check" title="Repeats the formation the playhead is in when you press Play"><input type="checkbox" checked={loop} onChange={e => onLoop(e.target.checked)} />Loop formation</label>
          <label className="check" title="What the playhead and formation edges jump to as you drag. Hold Alt while trimming to ignore it.">Snap to
            <select value={snap} onChange={e => setSnap(e.target.value as Snap)}>
              <option value="off">Nothing</option><option value="count">Counts</option><option value="half">Half counts</option><option value="bar">Bars of {perBar}</option>
              <option value="second">Whole seconds</option><option value="edge">Formations and playhead</option>
            </select>
          </label>
          <span className="zoom" role="group" aria-label="Timeline zoom">
            <button className="btn btn-line" onClick={() => zoom(1 / 1.5)} aria-label="Zoom out"><Icon name="minus" /></button>
            <button className="btn btn-line" onClick={() => setPps(Math.max(4, Math.min(400, (view.width - 24) / (end + 1))))}>Fit</button>
            <button className="btn btn-line" onClick={() => zoom(1.5)} aria-label="Zoom in"><Icon name="plus" /></button>
          </span>
        </div>
      </div>

      <div className="reel" ref={scroller} onScroll={e => setView({ left: e.currentTarget.scrollLeft, width: e.currentTarget.clientWidth })}>
        <div className={`track${grid ? ' has-beats' : ''}`} ref={track} style={{ width, '--beat': `${grid * pps}px`, '--bar': `${(snap === 'second' ? 10 : beat * perBar) * pps}px`, '--beat-at': `${gridAt * pps}px` } as CSSProperties}>
          <div className="ruler" onPointerDown={scrub} onPointerMove={scrub} title="Click or drag to move the playhead">
            {ticks.map(t => <span key={t} style={{ left: t * pps }}>{step < 1 ? clock(t) : clock(t).slice(0, -3)}</span>)}
          </div>

          <ol className="clips">
            {formations.map((f, i) => {
              const hex = gelOf(f, i)
              const move = f.transition
              const label = formationLabel(f, i)
              const px = (move + f.hold) * pps
              const title = fit(px, 9.5, label.title, String(i + 1).padStart(2, '0'))
              return (
                <li key={f.id}>
                  <div className={`clip${i === index ? ' is-current' : ''}`} onContextMenu={e => { e.preventDefault(); if (!playing) { onSeek(starts[i]); setMenu({ i, x: e.clientX, y: e.clientY }) } }} style={{ left: (starts[i] - move) * pps, width: (move + f.hold) * pps, background: hex, color: inkOn(hex) }}>
                    <button className="clip-body" aria-current={i === index} onClick={() => onSeek(starts[i])} aria-label={label.title}
                      title={`${label.title}${label.sub ? ` (${label.sub})` : ''}: ${move > 0 ? `${secs(move)} moving in, ` : ''}${secs(f.hold)} in formation`}>
                      <b>{title}</b>
                      {label.sub && title === label.title && <i>{fit(px, 7.5, label.sub)}</i>}
                    </button>
                    {move > 0 && (
                      <button className="clip-move" style={{ width: move * pps }} onClick={() => onSeek(starts[i] - move)} aria-label={`Moving into ${label.title}, ${secs(move)}`}>
                        {fit(move * pps, 7, `${secs(move)} moving in`, secs(move))}
                      </button>
                    )}
                    <span className="clip-hold" style={{ left: move * pps }}>{fit(f.hold * pps - 4, 7, `${secs(f.hold)} in formation`, secs(f.hold))}</span>
                    {handle(i, 'transition')}
                    {handle(i, 'hold')}
                  </div>
                </li>
              )
            })}
            <li>
              <button className="clip-add" style={{ left: totalTime(formations) * pps + 8 }} onClick={onAddFormation} disabled={playing} title="Adds a formation at the end, starting as a copy of the last one">
                <Icon name="plus" />Add formation
              </button>
            </li>
          </ol>

          <div className="wave" onContextMenu={project.audio && !audioMissing ? e => { e.preventDefault(); setSoundMenu({ x: e.clientX, y: e.clientY }) } : undefined}>
            {project.audio && !audioMissing ? (
              <>
                <canvas ref={canvas} style={{ width: view.width, left: view.left }} aria-label={`Waveform of ${project.audio.wave?.name ?? project.audio.name}`} role="img" />
                {/* The track's own label stays in view as the timeline scrolls, and opens its settings. */}
                <div className="sound-bar" style={{ left: view.left, width: view.width }}>
                  <button className="sound-tag" aria-haspopup="menu" disabled={reading} title={`${project.audio.name}: volume, replace or remove. Right-clicking the waveform opens this too.`}
                    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setSoundMenu({ x: r.left, y: r.top - 6 }) }}>
                    <Icon name={hasVideo ? 'video' : 'music'} /><span>{project.audio.name}</span><em>{Math.round(volume * 100)}%</em>
                  </button>
                  {peaks && !peaks.length && <p>No waveform for this video. <button className="link" onClick={onPickWave}>Add its song</button> to see one.</p>}
                </div>
              </>
            ) : audioMissing ? (
              <p style={{ left: view.left, width: view.width }}>The music for this routine isn't on this device. <button className="link" onClick={onPickAudio}>Add the song or video again</button></p>
            ) : (
              <button className="sound-add" style={{ left: view.left + 4, width: view.width - 8 }} onClick={onPickAudio} disabled={reading}>
                <Icon name="plus" />Add music or video<span>or drop a file here · songs up to 60 MB, videos any size your device has room for</span>
              </button>
            )}
          </div>

          <span className="playhead" style={{ left: time * pps }} aria-hidden="true" />
        </div>
      </div>
      {menu && (() => {
        const { i } = menu
        const n = project.formations.length
        const item = (label: string, run: () => void, off = false, danger = false) => (
          <button role="menuitem" className={danger ? 'btn-danger' : ''} disabled={off} onClick={() => { setMenu(null); run(); onFollow() }}>{label}</button>
        )
        return (
          <Menu x={menu.x} y={menu.y} label={`Actions for ${formationLabel(project.formations[i], i).title}`} onClose={() => setMenu(null)}>
            {item('Duplicate', () => addFormation(i))}
            {item(i ? `Reset positions to ${formationLabel(project.formations[i - 1], i - 1).title}` : 'Reset positions to the previous formation', () => matchPrevious(i), i === 0)}
            {item('Line everyone up', () => resetLine(i))}
            {item('Move earlier', () => moveFormation(i, i - 1), i === 0)}
            {item('Move later', () => moveFormation(i, i + 1), i === n - 1)}
            {item('Delete', () => deleteFormation(i), n === 1, true)}
          </Menu>
        )
      })()}
      {soundMenu && project.audio && (() => {
        const item = (label: string, run: () => void, danger = false) => (
          <button role="menuitem" className={danger ? 'btn-danger' : ''} onClick={() => { setSoundMenu(null); run() }}>{label}</button>
        )
        return (
          <Menu x={soundMenu.x} y={soundMenu.y} label={`Settings for ${project.audio.name}`} onClose={() => setSoundMenu(null)}>
            <label className="menu-range">Volume
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => onVolume(Number(e.target.value))} aria-valuetext={`${Math.round(volume * 100)} percent`} />
              <output>{Math.round(volume * 100)}%</output>
            </label>
            {item('Replace with another song or video…', onPickAudio)}
            {hasVideo && (project.audio.wave
              ? item("Draw the waveform from the video's own sound", () => edit(p => { delete p.audio!.wave }))
              : item('Draw the waveform from a song file…', onPickWave))}
            {item(hasVideo ? 'Remove video' : 'Remove music', onRemoveAudio, true)}
          </Menu>
        )
      })()}
    </footer>
  )
}

