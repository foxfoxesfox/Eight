import { useEffect, useState, type CSSProperties } from 'react'
import { clock } from './audio'
import { loadProject } from './db'
import { gelName, gelOf, startTimes, type Project } from './model'
import { MarkIcon, StageView } from './Stage'

const pad = (n: number) => String(n).padStart(2, '0')

/** One sheet per formation, laid out for the browser's own print dialog, which can also save a PDF. */
export function PrintView({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [perPage, setPerPage] = useState(1)
  const [paths, setPaths] = useState(true)
  const [names, setNames] = useState(true)
  const [notes, setNotes] = useState(true)
  const [saveInk, setSaveInk] = useState(false)

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
  const check = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={on} onChange={e => set(e.target.checked)} />{label}</label>
  )

  return (
    <div className={`print per-${perPage}${saveInk ? ' save-ink' : ''}`}>
      <header className="bar no-print">
        <a className="wordmark" href={`#/r/${id}`} aria-label="Eight, back to the editor">Eight</a>
        <div className="print-options">
          <label className="check">Per page
            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}><option value={1}>1 formation</option><option value={4}>4 formations</option></select>
          </label>
          {check('Paths from the previous formation', paths, setPaths)}
          {check('Dancer names', names, setNames)}
          {check('Notes', notes, setNotes)}
          {check('Save ink', saveInk, setSaveInk)}
        </div>
        <nav className="bar-actions">
          <a className="btn" href={`#/r/${id}`}>Back to the editor</a>
          <button className="btn btn-solid" onClick={() => print()}>Print or save as PDF</button>
        </nav>
      </header>
      <main className="sheets">
        {formations.map((f, i) => {
          const gel = gelOf(f, i)
          return (
            <section className="sheet" key={f.id} style={{ '--gel': gel, '--wash': gel } as CSSProperties}>
              <header>
                <h2>{pad(i + 1)} · {f.name}</h2>
                <p>{project.name} · {gelName(gel)} · in formation at {clock(starts[i])} for {f.hold.toFixed(2)} s{f.transition > 0 && `, after ${f.transition.toFixed(2)} s moving in`}</p>
              </header>
              <StageView stage={stage} dancers={dancers} positions={f.positions} ghosts={paths ? formations[i - 1]?.positions : undefined} paths="always" label={`${f.name}, seen from above with the audience at the bottom`} />
              {notes && f.note && <p className="sheet-note">{f.note}</p>}
              {names && <ul className="legend">{dancers.map(d => <li key={d.id}><MarkIcon d={d} />{d.name}</li>)}</ul>}
            </section>
          )
        })}
      </main>
    </div>
  )
}
