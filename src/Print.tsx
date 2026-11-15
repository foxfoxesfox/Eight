import { useEffect, useState, type CSSProperties } from 'react'
import { clock } from './audio'
import { loadProject } from './db'
import { formationLabel, gelName, gelOf, startTimes, type Project } from './model'
import { savePdf } from './pdf'
import { MarkIcon, StageView } from './Stage'
import { Icon, ThemeToggle } from './ui'

/** One sheet per formation: the preview for the PDF download, also laid out for the browser's own print dialog. */
export function PrintView({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [perPage, setPerPage] = useState<1 | 4>(1)
  const [paths, setPaths] = useState(true)
  const [names, setNames] = useState(true)
  const [notes, setNotes] = useState(true)
  const [saveInk, setSaveInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadProject(id).then(p => setProject(p ?? null), () => setProject(null)) }, [id])

  if (project === undefined) return <main className="empty" aria-busy="true"><p>Opening…</p></main>
  if (project === null) {
    return (
      <main className="empty">
        <h1>This routine isn't on this device</h1>
        <a className="btn btn-solid" href="#/routines">Go to your routines</a>
      </main>
    )
  }

  const { formations, dancers, stage } = project
  const starts = startTimes(formations)
  const sheets = formations.map((f, i) => {
    const label = formationLabel(f, i)
    const gel = gelOf(f, i)
    const timing = `in formation at ${clock(starts[i])} for ${f.hold.toFixed(2)} s${f.transition > 0 ? `, after ${f.transition.toFixed(2)} s moving in` : ''}`
    return { f, i, gel, label, meta: [label.sub, project.name, gelName(gel), timing].filter(Boolean).join(' · ') }
  })

  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const drawings = document.querySelectorAll<SVGSVGElement>('.sheet .stage')
      await savePdf(project.name.replace(/[\\/:*?"<>|]/g, '-'), sheets.map((s, k) => ({
        title: s.label.title,
        meta: s.meta,
        note: notes ? s.f.note : undefined,
        // The 4-up layout has no room for a name list under every drawing.
        names: names && perPage === 1 ? dancers.map(d => `${d.label} ${d.name}`).join('    ') : undefined,
        svg: drawings[k],
      })), perPage)
    } catch {
      setError('The PDF could not be made in this browser. Try "Print" and choose "Save as PDF" there.')
    }
    setBusy(false)
  }

  const check = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={on} onChange={e => set(e.target.checked)} />{label}</label>
  )

  return (
    <div className={`print per-${perPage}${saveInk ? ' save-ink' : ''}`}>
      <header className="bar no-print">
        <a className="wordmark" href={`#/r/${id}`} aria-label="Eight, back to the editor">Eight</a>
        <div className="print-options">
          <label className="check">Per page
            <select value={perPage} onChange={e => setPerPage(Number(e.target.value) as 1 | 4)}><option value={1}>1 formation</option><option value={4}>4 formations</option></select>
          </label>
          {check('Paths from the previous formation', paths, setPaths)}
          {check('Dancer names', names, setNames)}
          {check('Notes', notes, setNotes)}
          {check('Save ink', saveInk, setSaveInk)}
        </div>
        <nav className="bar-actions">
          <ThemeToggle />
          <a className="btn" href={`#/r/${id}`}>Back to the editor</a>
          <button className="btn" onClick={() => print()}>Print</button>
          <button className="btn btn-solid" onClick={download} disabled={busy} aria-busy={busy}><Icon name="download" />{busy ? 'Making the PDF…' : 'Download PDF'}</button>
        </nav>
      </header>
      {error && <p className="toast no-print" role="alert">{error} <button className="link" onClick={() => setError('')}>Dismiss</button></p>}
      <main className="sheets">
        {sheets.map(({ f, i, gel, label, meta }) => (
          <section className="sheet" key={f.id} style={{ '--gel': gel, '--wash': gel } as CSSProperties}>
            <header>
              <h2>{label.title}</h2>
              <p>{meta}</p>
            </header>
            <StageView stage={stage} dancers={dancers} positions={f.positions} ghosts={paths ? formations[i - 1]?.positions : undefined} paths="always" label={`${label.title}, seen from above with the audience at the bottom`} />
            {notes && f.note && <p className="sheet-note">{f.note}</p>}
            {names && <ul className="legend">{dancers.map(d => <li key={d.id}><MarkIcon d={d} />{d.name}</li>)}</ul>}
          </section>
        ))}
      </main>
    </div>
  )
}
