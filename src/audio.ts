/** Waveform resolution: peaks per second of audio. */
export const PEAK_RATE = 100
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024

/** Decodes a song and reduces it to one loudness peak per 10 ms for drawing. */
export async function readAudio(blob: Blob): Promise<{ duration: number; peaks: Float32Array }> {
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
