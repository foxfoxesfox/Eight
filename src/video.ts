import { clock } from './audio'
import { formationLabel, gelOf, inkOn, positionsAt, shapePoints, totalTime, type Project } from './model'

const W = 1280
const H = 720
const FPS = 30
const R = 0.34 // dancer mark radius, metres: the same as on the stage

/** Plays the routine once onto a hidden canvas and records it, with the song if there is one. Resolves with the video file. */
// shortcut: records in real time, so a three-minute routine takes three minutes; switch to WebCodecs frame-by-frame encoding if that wait matters.
export async function recordVideo(project: Project, song: Blob | undefined, onProgress: (done: number) => void, signal: AbortSignal): Promise<Blob> {
  const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder?.isTypeSupported(t))
  if (!type) throw new Error('This browser cannot record video.')
  const { stage, formations, dancers } = project
  const end = totalTime(formations)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const top = 64
  const k = Math.min(W / (stage.width + 3), (H - top) / (stage.depth + 2.4)) // pixels per metre
  const X = (x: number) => W / 2 + x * k
  const Y = (y: number) => top + (H - top) / 2 + (stage.depth / 2 - y) * k - 0.3 * k

  const draw = (t: number) => {
    const view = positionsAt(formations, t)
    const gel = gelOf(formations[view.index], view.index)
    g.globalAlpha = 1
    g.fillStyle = '#17171a'
    g.fillRect(0, 0, W, H)
    const [x0, y0, w, h] = [X(-stage.width / 2), Y(stage.depth), stage.width * k, stage.depth * k]
    g.fillStyle = '#fdfcfa'
    g.fillRect(x0, y0, w, h)
    g.globalAlpha = 0.18
    g.fillStyle = gel
    g.fillRect(x0, y0, w, h)
    g.globalAlpha = 0.3
    g.strokeStyle = gel
    g.lineWidth = 1
    g.beginPath()
    for (let x = 0; x <= stage.width / 2; x += stage.gridSize) for (const s of x ? [x, -x] : [0]) { g.moveTo(X(s), y0); g.lineTo(X(s), y0 + h) }
    for (let y = 0; y <= stage.depth; y += stage.gridSize) { g.moveTo(x0, Y(y)); g.lineTo(x0 + w, Y(y)) }
    g.stroke()
    g.globalAlpha = 1
    g.lineWidth = 4
    g.strokeRect(x0, y0, w, h)

    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const d of [...dancers].sort((a, b) => +!!b.prop - +!!a.prop)) {
      const p = view.positions[d.id]
      if (!p) continue
      g.save()
      g.translate(X(p.x), Y(p.y))
      g.globalAlpha = p.offstage ? 0.35 : 1
      g.beginPath()
      const pts = d.prop ? [[-d.prop.w / 2, -d.prop.h / 2], [d.prop.w / 2, -d.prop.h / 2], [d.prop.w / 2, d.prop.h / 2], [-d.prop.w / 2, d.prop.h / 2]] : shapePoints(d.shape, R)
      if (pts) { pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k))); g.closePath() } else g.arc(0, 0, R * k, 0, Math.PI * 2)
      g.fillStyle = d.color
      g.fill()
      g.lineWidth = 3
      g.strokeStyle = '#fff'
      g.stroke()
      g.fillStyle = inkOn(d.color)
      g.font = `800 ${Math.round((d.prop ? 0.24 : 0.3) * k)}px Figtree Variable, system-ui, sans-serif`
      g.fillText(d.prop ? d.name : d.label, 0, 0.02 * k)
      g.restore()
    }

    g.fillStyle = '#f4f2ee'
    g.textBaseline = 'alphabetic'
    g.textAlign = 'left'
    g.font = '800 26px Figtree Variable, system-ui, sans-serif'
    g.fillText(`${project.name} · ${formationLabel(formations[view.index], view.index).title}`, 28, 42)
    g.textAlign = 'right'
    g.fillText(clock(t).slice(0, -3), W - 28, 42)
    g.textAlign = 'center'
    g.font = '800 15px Figtree Variable, system-ui, sans-serif'
    g.fillText('AUDIENCE', W / 2, Y(0) + 0.7 * k)
  }

  const audio = song ? new Audio(URL.createObjectURL(song)) : null
  const ctx = audio ? new AudioContext() : null
  const stream = canvas.captureStream(FPS)
  if (audio && ctx) {
    // The song goes into the recording only, not to the speakers.
    const out = ctx.createMediaStreamDestination()
    ctx.createMediaElementSource(audio).connect(out)
    out.stream.getAudioTracks().forEach(t => stream.addTrack(t))
  }
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }

  let timer = 0
  try {
    return await new Promise<Blob>((done, fail) => {
      recorder.onstop = () => (signal.aborted ? fail(new DOMException('Cancelled', 'AbortError')) : done(new Blob(chunks, { type: type.split(';')[0] })))
      recorder.onerror = () => fail(new Error('Recording failed.'))
      signal.addEventListener('abort', () => recorder.state !== 'inactive' && recorder.stop())
      draw(0)
      recorder.start(1000)
      audio?.play().catch(() => {})
      let t = 0
      let last = performance.now()
      // A timer, not animation frames: those stop when the tab is in the background.
      timer = window.setInterval(() => {
        const now = performance.now()
        // The song is the clock while it sounds, as in the editor, so picture and sound stay together.
        t = audio && !audio.paused && !audio.ended ? audio.currentTime : t + (now - last) / 1000
        last = now
        draw(Math.min(t, end))
        onProgress(Math.min(1, t / end))
        // Half a second on the last formation, so the video does not end on the very frame everyone arrives.
        if (t >= end + 0.5 && recorder.state !== 'inactive') recorder.stop()
      }, 1000 / FPS)
    })
  } finally {
    clearInterval(timer)
    stream.getTracks().forEach(t => t.stop())
    if (audio) { audio.pause(); URL.revokeObjectURL(audio.src) }
    ctx?.close()
  }
}
