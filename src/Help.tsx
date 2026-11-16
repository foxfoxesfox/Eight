import type { ReactNode } from 'react'
import guide from '../docs/GUIDE.md?raw'
import { ThemeToggle } from './ui'

type Block = { kind: 'h1' | 'h2' | 'h3' | 'p'; text: string } | { kind: 'ol' | 'ul'; items: string[] }

// shortcut: reads only the Markdown the guide uses (headings, paragraphs, two kinds of list, bold, code); use a Markdown library if the guide needs links, tables or images.
export function parseGuide(md: string): Block[] {
  const out: Block[] = []
  for (const chunk of md.split(/\n{2,}/)) {
    const lines = chunk.trim().split('\n')
    const head = lines[0].match(/^(#{1,3}) (.*)$/)
    if (head) out.push({ kind: `h${head[1].length}` as 'h1', text: head[2] })
    else if (lines.every(l => /^\d+\. /.test(l))) out.push({ kind: 'ol', items: lines.map(l => l.replace(/^\d+\. /, '')) })
    else if (lines.every(l => /^- /.test(l))) out.push({ kind: 'ul', items: lines.map(l => l.slice(2)) })
    else if (lines[0]) out.push({ kind: 'p', text: lines.join(' ') })
  }
  return out
}

/** Bold and code inside a line. */
const inline = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part)

const show = (b: Block, key: number) =>
  b.kind === 'ol' ? <ol key={key}>{b.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ol>
    : b.kind === 'ul' ? <ul key={key}>{b.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>
    : b.kind === 'h1' ? <h1 key={key}>{b.text}</h1>
    : b.kind === 'h2' ? <h2 key={key}>{b.text}</h2>
    : b.kind === 'h3' ? <h3 key={key}>{b.text}</h3>
    : b.kind === 'p' ? <p key={key}>{inline(b.text)}</p> : null

/** The user guide, shown inside the app so people who never visit GitHub can read it. Under "Questions", each question opens on its own. */
export function Help() {
  const blocks = parseGuide(guide)
  const at = blocks.findIndex(b => b.kind === 'h2' && b.text === 'Questions')
  const before = at < 0 ? blocks : blocks.slice(0, at + 1)
  const questions: { q: string; body: Block[] }[] = []
  for (const b of at < 0 ? [] : blocks.slice(at + 1)) {
    if (b.kind === 'h3') questions.push({ q: b.text, body: [] })
    else questions.at(-1)?.body.push(b)
  }
  return (
    <div className="page">
      <header className="bar">
        <a className="wordmark" href="#/">Eight</a>
        <nav className="bar-actions" aria-label="Help actions">
          <ThemeToggle />
          <a className="btn btn-solid" href="#/routines">Your routines</a>
        </nav>
      </header>
      <main className="help">
        {before.map(show)}
        {questions.map(({ q, body }) => (
          <details key={q}>
            <summary>{q}</summary>
            {body.map(show)}
          </details>
        ))}
      </main>
    </div>
  )
}
