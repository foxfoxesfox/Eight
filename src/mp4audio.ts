// Reads the AAC sound track out of an MP4 or MOV and decodes it with WebCodecs, for browsers whose
// decodeAudioData stops part way through a video file's sound (Safari does, on long videos).
// shortcut: plain (unfragmented) files with AAC sound only, which covers phone and downloaded videos; use a full MP4 library if fragmented files or other codecs turn up.

export interface AacTrack {
  /** The AudioSpecificConfig the decoder needs. */
  config: Uint8Array
  codec: string
  sampleRate: number
  channels: number
  /** Where each encoded frame sits in the file. */
  samples: { offset: number; size: number }[]
}

const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

/** Finds the first AAC sound track in an MP4 or MOV, or null. */
export function aacTrack(buf: ArrayBuffer): AacTrack | null {
  const v = new DataView(buf)
  const fourcc = (p: number) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3))
  const kids = (start: number, end: number) => {
    const out: { type: string; body: number; end: number }[] = []
    for (let p = start; p + 8 <= end;) {
      let size = v.getUint32(p)
      let head = 8
      if (size === 1) { size = Number(v.getBigUint64(p + 8)); head = 16 } else if (size === 0) size = end - p
      if (size < head) break
      out.push({ type: fourcc(p + 4), body: p + head, end: Math.min(p + size, end) })
      p += size
    }
    return out
  }
  const one = (list: ReturnType<typeof kids>, type: string) => list.find(b => b.type === type)

  const moov = one(kids(0, buf.byteLength), 'moov')
  if (!moov) return null
  for (const trak of kids(moov.body, moov.end).filter(b => b.type === 'trak')) {
    const mdia = one(kids(trak.body, trak.end), 'mdia')
    const m = mdia ? kids(mdia.body, mdia.end) : []
    const hdlr = one(m, 'hdlr')
    if (!hdlr || fourcc(hdlr.body + 8) !== 'soun') continue
    const minf = one(m, 'minf')
    const stbl = minf && one(kids(minf.body, minf.end), 'stbl')
    if (!stbl) continue
    const s = kids(stbl.body, stbl.end)
    const stsd = one(s, 'stsd'), stsz = one(s, 'stsz'), stsc = one(s, 'stsc'), stco = one(s, 'stco') ?? one(s, 'co64')
    if (!stsd || !stsz || !stsc || !stco) continue

    // The esds box sits in the sample entry, directly (MP4) or inside a 'wave' box (MOV), so it is found by name.
    let p = -1
    for (let q = stsd.body; q + 4 <= stsd.end; q++) if (fourcc(q) === 'esds') { p = q + 8; break }
    if (p < 0) continue
    const desc = () => {
      const tag = v.getUint8(p++)
      let len = 0
      for (let k = 0; k < 4; k++) { const b = v.getUint8(p++); len = (len << 7) | (b & 0x7f); if (!(b & 0x80)) break }
      return { tag, len }
    }
    if (desc().tag !== 3) continue
    const flags = v.getUint8(p + 2)
    p += 3
    if (flags & 0x80) p += 2
    if (flags & 0x40) p += 1 + v.getUint8(p)
    if (flags & 0x20) p += 2
    if (desc().tag !== 4 || v.getUint8(p) !== 0x40) continue // 0x40: MPEG-4 audio
    p += 13
    const dsi = desc()
    if (dsi.tag !== 5 || dsi.len < 2) continue
    const config = new Uint8Array(buf.slice(p, p + dsi.len))
    const aot = config[0] >> 3
    const sampleRate = RATES[((config[0] & 7) << 1) | (config[1] >> 7)]
    if (!sampleRate || aot === 31) continue

    const fixed = v.getUint32(stsz.body + 4)
    const count = v.getUint32(stsz.body + 8)
    const wide = stco.type === 'co64'
    const chunks = v.getUint32(stco.body + 4)
    const chunkAt = (i: number) => (wide ? Number(v.getBigUint64(stco.body + 8 + i * 8)) : v.getUint32(stco.body + 8 + i * 4))
    const runs = v.getUint32(stsc.body + 4)
    const samples: AacTrack['samples'] = []
    for (let r = 0, si = 0; r < runs; r++) {
      const first = v.getUint32(stsc.body + 8 + r * 12) - 1
      const per = v.getUint32(stsc.body + 12 + r * 12)
      const last = r + 1 < runs ? v.getUint32(stsc.body + 8 + (r + 1) * 12) - 1 : chunks
      for (let c = first; c < last; c++) {
        let at = chunkAt(c)
        for (let k = 0; k < per && si < count; k++, si++) {
          const size = fixed || v.getUint32(stsz.body + 12 + si * 4)
          samples.push({ offset: at, size })
          at += size
        }
      }
    }
    return { config, codec: `mp4a.40.${aot}`, sampleRate, channels: (config[1] >> 3) & 15 || 2, samples }
  }
  return null
}

function need(buf: ArrayBuffer): AacTrack {
  const track = aacTrack(buf)
  if (!track || typeof AudioDecoder === 'undefined') throw new Error('no readable AAC track')
  return track
}

/** Decodes the track with WebCodecs, handing each decoded piece to `each`. */
async function decodeAac(buf: ArrayBuffer, track: AacTrack, each: (data: AudioData) => void) {
  let failed: unknown
  const dec = new AudioDecoder({
    output: data => { try { each(data) } catch (e) { failed = e } finally { data.close() } },
    error: e => { failed = e },
  })
  dec.configure({ codec: track.codec, sampleRate: track.sampleRate, numberOfChannels: track.channels, description: track.config })
  const bytes = new Uint8Array(buf)
  const frame = 1024 / track.sampleRate
  track.samples.forEach(({ offset, size }, i) => dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(i * frame * 1e6), data: bytes.subarray(offset, offset + size) })))
  await dec.flush()
  dec.close()
  if (failed) throw failed
}

/** Loudness peaks, `rate` per second, of a video's AAC sound decoded with WebCodecs. Throws where that is not possible. */
export async function aacPeaks(buf: ArrayBuffer, rate: number): Promise<{ duration: number; peaks: Float32Array }> {
  const track = need(buf)
  const duration = (track.samples.length * 1024) / track.sampleRate
  const peaks = new Float32Array(Math.ceil(duration * rate) + 1)
  await decodeAac(buf, track, data => {
    const n = data.numberOfFrames
    const pcm = new Float32Array(n)
    data.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' })
    const t0 = data.timestamp / 1e6
    for (let i = 0; i < n; i++) {
      const k = Math.floor((t0 + i / data.sampleRate) * rate)
      const a = Math.abs(pcm[i])
      if (k < peaks.length && a > peaks[k]) peaks[k] = a
    }
  })
  return { duration, peaks }
}

/** A video's whole AAC sound as an AudioBuffer, decoded with WebCodecs. Throws where that is not possible. */
export async function aacBuffer(buf: ArrayBuffer): Promise<AudioBuffer> {
  const track = need(buf)
  const duration = (track.samples.length * 1024) / track.sampleRate
  let rate = 0
  let channels: Float32Array<ArrayBuffer>[] = []
  await decodeAac(buf, track, data => {
    if (!rate) {
      rate = data.sampleRate
      channels = Array.from({ length: data.numberOfChannels }, () => new Float32Array(Math.ceil(duration * rate)))
    }
    const at = Math.round((data.timestamp / 1e6) * rate)
    const pcm = new Float32Array(data.numberOfFrames)
    channels.forEach((ch, c) => {
      if (at >= ch.length) return
      data.copyTo(pcm, { planeIndex: c, format: 'f32-planar' })
      ch.set(pcm.subarray(0, ch.length - at), at)
    })
  })
  if (!rate) throw new Error('no sound decoded')
  const out = new AudioBuffer({ length: channels[0].length, sampleRate: rate, numberOfChannels: channels.length })
  channels.forEach((ch, c) => out.copyToChannel(ch, c))
  return out
}
