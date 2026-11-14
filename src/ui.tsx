import { useEffect, useState, type ReactNode } from 'react'

const paths: Record<string, ReactNode> = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
  undo: <path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -3)" />,
  redo: <path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -3)" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  upload: <path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" />,
}

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/** Text or number input that commits on blur or Enter, so one edit is one undo step. */
export function Field({ label, value, onCommit, type = 'text', min, max, step, maxLength, suffix }: {
  label: string
  value: string | number
  onCommit: (v: string) => void
  type?: 'text' | 'number'
  min?: number
  max?: number
  step?: number
  maxLength?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    let v = draft.trim()
    if (type === 'number') {
      const n = Number(v)
      if (!Number.isFinite(n)) return setDraft(String(value))
      v = String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)))
    }
    if (!v) return setDraft(String(value))
    setDraft(v)
    if (v !== String(value)) onCommit(v)
  }
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-box">
        <input
          type={type}
          value={draft}
          min={min}
          max={max}
          step={step}
          maxLength={maxLength}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur() }
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  )
}

export const go = (hash: string) => { location.hash = hash }

/** Saves a stage drawing as a PNG. Styles live in the stylesheet, so they are copied onto the clone before it is drawn. */
export async function savePng(svg: SVGSVGElement, name: string) {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const to = copy.querySelectorAll<SVGElement>('*')
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'paint-order']
  svg.querySelectorAll('*').forEach((el, i) => {
    const cs = getComputedStyle(el)
    for (const p of props) to[i].style.setProperty(p, cs.getPropertyValue(p))
  })
  copy.querySelectorAll('.dancer-halo, .bend, .stage-marquee').forEach(el => el.remove())
  const vb = svg.viewBox.baseVal
  const w = 1800
  const h = Math.round((w * vb.height) / vb.width)
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(w))
  copy.setAttribute('height', String(h))
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy))
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'))
  if (!blob) throw new Error('no image')
  download(name, blob, 'image/png')
}

export function download(name: string, data: BlobPart, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
