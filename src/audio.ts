/** Waveform resolution: peaks per second of audio. */
export const PEAK_RATE = 100
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024
// shortcut: drawing a waveform means reading the whole file into memory, so files over 300 MB go without one; read the sound in pieces to lift that.
export const MAX_WAVEFORM_BYTES = 300 * 1024 * 1024

/** Length in seconds of a song or video as the browser's own player reports it: the length that actually plays. */
export function mediaLength(blob: Blob): Promise<number> {
  return new Promise((done, fail) => {
    const v = document.createElement('video')
    const end = (ok: boolean) => { URL.revokeObjectURL(v.src); ok && Number.isFinite(v.duration) ? done(v.duration) : fail(new Error('unreadable video')) }
    v.onloadedmetadata = () => end(true)
    v.onerror = () => end(false)
    v.preload = 'metadata'
    v.src = URL.createObjectURL(blob)
  })
}

/** Decodes a song and reduces it to one loudness peak per 10 ms for drawing. */
export async function readAudio(blob: Blob): Promise<{ duration: number; peaks: Float32Array }> {
  if (blob.size > MAX_WAVEFORM_BYTES) throw new Error('too large for a waveform')
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    const samples = buf.getChannelData(0)
    const per = Math.max(1, Math.floor(buf.sampleRate / PEAK_RATE))
    const peaks = new Float32Array(Math.ceil(samples.length / per))
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i])
      const k = (i / per) | 0
      if (v > peaks[k]) peaks[k] = v
    }
    return { duration: buf.duration, peaks }
  } finally {
    ctx.close()
  }
}

export function clock(t: number): string {
  const m = Math.floor(t / 60)
  return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`
}
