import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { clock } from './audio'
import { formationLabel, startTimes, type Position, type Project } from './model'
import { StageView } from './Stage'
import { Icon } from './ui'

interface Props {
  project: Project
  time: number
  end: number
  playing: boolean
  /** The formation the playhead is in, and where everyone is at this moment. */
  index: number
  positions: Record<string, Position>
  gel: string
  wash: string
  flip: boolean
  /** The routine's video, borrowed from the editor while the preview is open; null when there is none or it is hidden. */
  video: HTMLVideoElement | null
  mirrored: boolean
  /** Share of the width the stage takes beside the video. */
  split: number
  onToggle: () => void
  onSeek: (t: number) => void
  onClose: () => void
}

/** A full-screen run-through of the routine, like a presenter view: the stage (and video) large, with the formation, count and notes, and what comes next. */
export function Preview({ project, time, end, playing, index, positions, gel, wash, flip, video, mirrored, split, onToggle, onSeek, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const { formations, dancers, stage } = project
  const starts = startTimes(formations)
  const label = formationLabel(formations[index], index)
  const beat = 60 / project.bpm
  const perBar = project.countsPerBar ?? 8
  const beatNow = Math.max(0, Math.floor((time - (project.beatOffset ?? 0)) / beat))
  const next = formations[index + 1]

  // Full screen as it opens, while the click that opened it still counts; the preview works in the window if the browser says no.
  useLayoutEffect(() => {
    const el = box.current!
    let full = false
    const changed = () => { if (document.fullscreenElement === el) full = true; else if (full) onClose() }
    document.addEventListener('fullscreenchange', changed)
    el.requestFullscreen?.().catch(() => {})
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The editor's video element moves in here and back, so it keeps playing in step without a second copy.
  useLayoutEffect(() => {
    if (!video || !screen.current) return
    const home = video.parentElement
    screen.current.append(video)
    return () => { home?.append(video) }
  }, [video])

  const jump = (dir: number) => {
    // Back goes to the start of this formation first, then to the one before, as a slideshow does.
    const to = dir > 0 ? Math.min(formations.length - 1, index + 1) : time - starts[index] > 0.5 ? index : Math.max(0, index - 1)
    onSeek(starts[to])
  }

  // Keys are caught before the editor sees them, so arrows change formation here instead of nudging dancers.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') jump(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') jump(-1)
      else if (e.key === ' ') onToggle()
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  })

  return (
    <div className="preview" ref={box} role="dialog" aria-modal="true" aria-label={`Preview of ${project.name}`} style={{ '--gel': gel, '--wash': wash } as CSSProperties}>
      <header className="preview-top">
        <div className="preview-title">
          <span className="chip">{String(index + 1).padStart(2, '0')}</span>
          <div><b>{label.title}</b>{label.sub && <i>{label.sub}</i>}</div>
        </div>
        <p className="preview-clock"><strong>{clock(time)}</strong><span>of {clock(end)} · bar {Math.floor(beatNow / perBar) + 1}, count {(beatNow % perBar) + 1}</span></p>
        <button className="btn" onClick={onClose}>Exit preview</button>
      </header>

      <main className={`preview-stage${video ? ' has-screen' : ''}`} style={video ? { gridTemplateColumns: `minmax(0, ${split}fr) minmax(0, ${1 - split}fr)` } : undefined}>
        <StageView stage={stage} dancers={dancers} positions={positions} flip={flip} label={`${label.title}, seen from above`} />
        {video && <div className={`screen${mirrored ? ' is-mirrored' : ''}`} ref={screen} aria-label="The routine's video" />}
      </main>

      <footer className="preview-bottom">
        <p className="preview-note">{formations[index].note ?? ''}</p>
        <div className="preview-controls">
          <button className="btn" onClick={() => jump(-1)} aria-label="Previous formation"><Icon name="left" /></button>
          <button className="btn btn-solid btn-play" onClick={onToggle}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play'}</button>
          <button className="btn" onClick={() => jump(1)} aria-label="Next formation"><Icon name="right" /></button>
          <input type="range" min={0} max={end} step={0.01} value={time} onChange={e => onSeek(Number(e.target.value))} aria-label="Position in the routine" aria-valuetext={clock(time)} />
        </div>
        <div className="preview-next">
          {next ? (
            <>
              <span>Up next</span>
              <b>{formationLabel(next, index + 1).title}</b>
              <StageView stage={stage} dancers={dancers} positions={next.positions} flip={flip} label={`Next: ${formationLabel(next, index + 1).title}`} />
            </>
          ) : <span>Last formation</span>}
        </div>
      </footer>
    </div>
  )
}
