import { clock, MAX_WAVEFORM_BYTES } from './audio'
import { aacBuffer } from './mp4audio'
import { formationLabel, gelOf, inkOn, positionsAt, propPoints, shapePoints, totalTime, type Project } from './model'

const FPS = 30
const R = 0.34 // dancer mark radius, metres: the same as on the stage

export interface ExportSound { ctx: AudioContext; src: string; video: boolean; /** The kept stretch of the file, in its own seconds. */ from: number; to: number }

/**
 * Sets up the sound for a recording. Call it inside the click that asks for the export: Safari lets the sound run
 * only when a click started it. `src` is the address of the song or video already loaded in the editor.
 */
export function soundForExport(src: string, video: boolean, kept = { from: 0, to: Infinity }): ExportSound {
  const ctx = new AudioContext()
  ctx.resume().catch(() => {})
  return { ctx, src, video, ...kept }
}

/** The whole sound as one buffer. A video's sound is read frame by frame first, because Safari decodes only part of it otherwise. */
async function decodeSound(sound: ExportSound, data: ArrayBuffer): Promise<AudioBuffer | null> {
  if (sound.video) { const whole = await aacBuffer(data).catch(() => null); if (whole) return whole }
  return sound.ctx.decodeAudioData(data).catch(() => null)
}

/** Plays the routine once onto a hidden canvas and records it, with the sound if there is any. With `picture`, the routine's own video plays beside the stage (flipped left to right with `mirror`). Resolves with the video file, and `silent` when the browser would not let the sound be recorded. */
// shortcut: records in real time, so a three-minute routine takes three minutes; switch to WebCodecs frame-by-frame encoding if that wait matters.
export async function recordVideo(project: Project, sound: ExportSound | undefined, onProgress: (done: number) => void, signal: AbortSignal, { picture = false, mirror = false, height = 1080 }: { picture?: boolean; mirror?: boolean; /** Lines in the picture: 720 or 1080. */ height?: number } = {}): Promise<{ blob: Blob; silent: boolean }> {
  const H = height
  const W = (H * 16) / 9
  /** Text, margins and line weights were laid out at 720 lines; this scales them to the real height. */
  const S = H / 720
  const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder?.isTypeSupported(t))
  if (!type) throw new Error('This browser cannot record video.')
  const { stage, formations, dancers } = project
  const end = totalTime(formations)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const top = 64 * S
  const split = picture && !!sound?.video
  const SW = split ? W / 2 : W // width the stage is drawn in; the video takes the other half
  const k = Math.min(SW / (stage.width + 3), (H - top) / (stage.depth + 2.4)) // pixels per metre
  const X = (x: number) => SW / 2 + x * k
  const Y = (y: number) => top + (H - top) / 2 + (stage.depth / 2 - y) * k - 0.3 * k

  // The routine's own video, drawn beside the stage. Muted: the sound reaches the recording on its own.
  const audio = split ? Object.assign(document.createElement('video'), { playsInline: true, muted: true, src: sound!.src }) : null

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
    g.lineWidth = S
    g.beginPath()
    for (let x = 0; x <= stage.width / 2; x += stage.gridSize) for (const s of x ? [x, -x] : [0]) { g.moveTo(X(s), y0); g.lineTo(X(s), y0 + h) }
    for (let y = 0; y <= stage.depth; y += stage.gridSize) { g.moveTo(x0, Y(y)); g.lineTo(x0 + w, Y(y)) }
    g.stroke()
    g.globalAlpha = 1
    g.lineWidth = 4 * S
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
      const pts = d.prop ? propPoints(d.shape, d.prop.w, d.prop.h) : shapePoints(d.shape, R)
      if (pts) { pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k))); g.closePath() }
      else if (d.prop) g.ellipse(0, 0, (d.prop.w / 2) * k, (d.prop.h / 2) * k, 0, 0, Math.PI * 2)
      else g.arc(0, 0, R * k, 0, Math.PI * 2)
      g.fillStyle = d.color
      g.fill()
      g.lineWidth = 3 * S
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
    g.font = `800 ${26 * S}px Figtree Variable, system-ui, sans-serif`
    g.fillText(`${project.name} · ${formationLabel(formations[view.index], view.index).title}`, 28 * S, 42 * S)
    g.textAlign = 'right'
    g.fillText(clock(t).slice(0, -3), W - 28 * S, 42 * S)
    g.textAlign = 'center'
    g.font = `800 ${15 * S}px Figtree Variable, system-ui, sans-serif`
    g.fillText('Audience', SW / 2, Y(0) + 0.7 * k)

    const v = audio as HTMLVideoElement | null
    if (split && v?.videoWidth) {
      // Fitted inside the right half, keeping its shape.
      const [bw, bh] = [W / 2 - 24 * S, H - top - 24 * S]
      const s = Math.min(bw / v.videoWidth, bh / v.videoHeight)
      const [vw, vh] = [v.videoWidth * s, v.videoHeight * s]
      g.save()
      g.translate(W / 2 + bw / 2, top + bh / 2)
      if (mirror) g.scale(-1, 1)
      g.drawImage(v, -vw / 2, -vh / 2, vw, vh)
      g.restore()
    }
  }

  const stream = canvas.captureStream(FPS)
  // The sound is played from memory into the recording: Safari plays a media player but records nothing from it.
  let playSound: (() => void) | null = null
  let soundTime: (() => number | undefined) | null = null
  const extra: HTMLMediaElement[] = []
  if (sound) {
    await Promise.race([sound.ctx.resume(), new Promise(r => setTimeout(r, 500))]).catch(() => {})
    const into = sound.ctx.createMediaStreamDestination()
    // Safari ends the file where sound stops arriving, so a silent signal keeps arriving for the whole recording.
    const hold = sound.ctx.createConstantSource()
    hold.offset.value = 0
    hold.connect(into)
    hold.start()
    const file = await (await fetch(sound.src)).blob()
    if (file.size <= MAX_WAVEFORM_BYTES) {
      const buffer = await decodeSound(sound, await file.arrayBuffer())
      let startedAt = 0
      if (buffer) {
        // Only the kept stretch plays.
        playSound = () => { const n = sound.ctx.createBufferSource(); n.buffer = buffer; n.connect(into); n.start(0, sound.from, Math.max(0, Math.min(sound.to, buffer.duration) - sound.from)); startedAt = sound.ctx.currentTime }
        soundTime = () => sound.ctx.currentTime - startedAt
      }
    } else {
      // shortcut: a file too big to hold in memory plays through a media player, which Chrome records and Safari does not; decode it in pieces if Safari needs it.
      const player = Object.assign(document.createElement(sound.video ? 'video' : 'audio'), { src: sound.src })
      sound.ctx.createMediaElementSource(player).connect(into)
      extra.push(player)
      playSound = () => { player.currentTime = sound.from; player.play().catch(() => {}) }
      soundTime = () => {
        if (player.currentTime >= sound.to) player.pause()
        return player.paused || player.ended ? undefined : player.currentTime - sound.from
      }
    }
    // A sound track that never delivers sound (its context not allowed to run) stops Safari from finishing the file, so it is left out.
    if (playSound && sound.ctx.state === 'running') stream.addTrack(into.stream.getAudioTracks()[0])
    else playSound = soundTime = null
  }
  const silent = !!sound && !playSound
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: H > 720 ? 12_000_000 : 6_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }

  let timer = 0
  try {
    const blob = await new Promise<Blob>((done, fail) => {
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        if (signal.aborted) fail(new DOMException('Cancelled', 'AbortError'))
        else if (chunks.length) done(new Blob(chunks, { type: type.split(';')[0] }))
        else fail(new Error('Recording failed.'))
      }
      // Some browsers never report that a recording stopped; after three seconds the file is finished with what has arrived.
      const finish = () => { if (recorder.state !== 'inactive') recorder.stop(); setTimeout(settle, 3000) }
      recorder.onstop = settle
      recorder.onerror = () => { settled = true; fail(new Error('Recording failed.')) }
      signal.addEventListener('abort', finish)
      draw(0)
      recorder.start(1000)
      playSound?.()
      audio?.play().catch(() => {})
      let t = 0
      let last = performance.now()
      // A timer, not animation frames: those stop when the tab is in the background.
      timer = window.setInterval(() => {
        const now = performance.now()
        // The sound is the clock while it plays, as in the editor, so picture and sound stay together.
        t = soundTime?.() ?? t + (now - last) / 1000
        last = now
        // The picture follows the kept stretch too, and stops where it ends.
        const m = t + (sound?.from ?? 0)
        if (audio && m >= Math.min(sound!.to, audio.duration || Infinity)) audio.pause()
        else if (audio && Math.abs(audio.currentTime - m) > 0.25) audio.currentTime = m
        draw(Math.min(t, end))
        onProgress(Math.min(1, t / end))
        // Half a second on the last formation, so the video does not end on the very frame everyone arrives.
        if (t >= end + 0.5 && recorder.state !== 'inactive') { clearInterval(timer); finish() }
      }, 1000 / FPS)
    })
    return { blob, silent }
  } finally {
    clearInterval(timer)
    stream.getTracks().forEach(t => t.stop())
    audio?.pause()
    extra.forEach(p => p.pause())
    sound?.ctx.close()
  }
}
