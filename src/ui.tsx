import { useEffect, useState, type ReactNode } from 'react'

const paths: Record<string, ReactNode> = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
  undo: <path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -3)" />,
  redo: <path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -3)" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  sun: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  upload: <path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" />,
  music: <path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />,
  video: <path d="M3 6.5h12v11H3zM15 10.5l6-3.5v10l-6-3.5" />,
}

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/** Text or number input that commits on blur or Enter, so one edit is one undo step. */
export function Field({ label, value, onCommit, type = 'text', min, max, step, maxLength, suffix, placeholder, allowEmpty }: {
  placeholder?: string
  allowEmpty?: boolean
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
    if (!v && !allowEmpty) return setDraft(String(value))
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
          placeholder={placeholder}
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

/** Switches between the light and dark themes and remembers the choice on this device. */
export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark')
  const flip = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('eight.theme', next) } catch { /* private windows may refuse storage; the theme still applies for this visit */ }
    setDark(!dark)
  }
  return <button className="btn" onClick={flip} aria-pressed={dark} title="Switch between light and dark"><Icon name={dark ? 'sun' : 'moon'} />{dark ? 'Light' : 'Dark'}</button>
}

export const go =(hash: string) => { location.hash = hash }

/** Draws a stage onto a canvas. Styles live in the stylesheet, so they are copied onto the clone before it is drawn. */
export async function stageCanvas(svg: SVGSVGElement, w = 1800): Promise<HTMLCanvasElement> {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const to = copy.querySelectorAll<SVGElement>('*')
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'paint-order']
  svg.querySelectorAll('*').forEach((el, i) => {
    const cs = getComputedStyle(el)
    for (const p of props) to[i].style.setProperty(p, cs.getPropertyValue(p))
  })
  copy.querySelectorAll('.dancer-halo, .bend, .stage-marquee').forEach(el => el.remove())
  const vb = svg.viewBox.baseVal
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
  return canvas
}

export async function savePng(svg: SVGSVGElement, name: string) {
  const canvas = await stageCanvas(svg)
  const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'))
  if (!blob) throw new Error('no image')
  download(name, blob, 'image/png')
}

export function download(name: string, data: BlobPart, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  // In the page while it is clicked: a link that is not in the document is ignored by some browsers.
  document.body.append(a)
  a.click()
  a.remove()
  // Not at once: some browsers drop a download whose address is withdrawn before they have started reading it.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

/** A small menu at a point: it opens upwards in the lower half of the window and downwards in the upper half. Arrow keys move between its controls; Escape or a click outside closes it. */
export function Menu({ x, y, label, onClose, children }: { x: number; y: number; label: string; onClose: () => void; children: ReactNode }) {
  const controls = 'button:not(:disabled), input'
  return (
    <>
      <div className="ctx-shade" onPointerDown={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div className="menu-list ctx" role="menu" aria-label={label}
        style={{ left: Math.max(8, Math.min(x, innerWidth - 290)), ...(y > innerHeight / 2 ? { bottom: innerHeight - y } : { top: y }) }}
        ref={el => { if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(controls)?.focus() }}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Escape') return onClose()
          const dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
          if (!dir) return
          e.preventDefault()
          const all = [...e.currentTarget.querySelectorAll<HTMLElement>(controls)]
          all[(all.indexOf(document.activeElement as HTMLElement) + dir + all.length) % all.length]?.focus()
        }}>
        {children}
      </div>
    </>
  )
}
