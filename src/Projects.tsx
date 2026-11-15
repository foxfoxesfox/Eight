import { useEffect, useRef, useState, type FormEvent } from 'react'
import { deleteProject, listProjects, saveProject } from './db'
import { gelOf, newProject, parseProjects, uid, type Project } from './model'
import { StageView } from './Stage'
import { download, go, Icon, ThemeToggle } from './ui'

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function Projects() {
  const [all, setAll] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [archived, setArchived] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => listProjects().then(setAll, () => setError('Your browser is blocking storage, so routines cannot be saved here. Check that you are not in a private window.'))
  useEffect(() => { refresh() }, [])

  const run = (work: Promise<unknown>) => work.then(refresh, e => setError(e instanceof Error ? e.message : 'Something went wrong. Nothing was changed.'))

  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const clamp = (key: string, lo: number, hi: number, fallback: number) => Math.min(hi, Math.max(lo, Number(data.get(key)) || fallback))
    const p = newProject(String(data.get('name') || '').trim() || 'Untitled routine', Math.round(clamp('dancers', 1, 200, 8)), { width: clamp('width', 2, 60, 10), depth: clamp('depth', 2, 60, 8) })
    saveProject(p).then(() => go(`#/r/${p.id}`), () => setError('This routine could not be saved. Your browser may be out of storage space.'))
  }

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const list = parseProjects(await file.text())
      await Promise.all(list.map(saveProject))
      if (list.length === 1) go(`#/r/${list[0].id}`)
      else refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be imported.')
    }
  }

  const shown = (all ?? [])
    .filter(p => !!p.archived === archived && p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt))
  const archivedCount = (all ?? []).filter(p => p.archived).length

  return (
    <div className="page">
      <header className="bar">
        <a className="wordmark" href="#/">Eight</a>
        <nav className="bar-actions" aria-label="Library actions">
          <ThemeToggle />
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" />Import a file</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { importFile(e.target.files?.[0]); e.target.value = '' }} />
          {!!all?.length && <button className="btn" onClick={() => download('eight-backup.json', JSON.stringify(all, null, 2))}><Icon name="download" />Back up all</button>}
        </nav>
      </header>

      <main className="library">
        <h1>Your routines</h1>
        {error && <p className="toast" role="alert">{error} <button className="link" onClick={() => setError('')}>Dismiss</button></p>}

        <form className="new" onSubmit={create}>
          <h2>Start a routine</h2>
          <label className="field grow"><span>Name</span><input name="name" placeholder="Spring showcase opener" maxLength={80} autoComplete="off" /></label>
          <label className="field"><span>Dancers</span><input name="dancers" type="number" min={1} max={200} defaultValue={8} /></label>
          <label className="field"><span>Stage width (m)</span><input name="width" type="number" min={2} max={60} step={0.5} defaultValue={10} /></label>
          <label className="field"><span>Stage depth (m)</span><input name="depth" type="number" min={2} max={60} step={0.5} defaultValue={8} /></label>
          <button className="btn btn-solid"><Icon name="plus" />Create</button>
        </form>

        {all === null ? !error && <p className="quiet" aria-busy="true">Loading your routines…</p> : all.length === 0 ? (
          <p className="quiet">No routines yet. Name one above and you'll be placing dancers in a few seconds. Everything is stored in this browser on this device.</p>
        ) : (
          <>
            <div className="filters">
              <label className="field grow"><span>Search</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a routine by name" /></label>
              <label className="field"><span>Sort by</span>
                <select value={sort} onChange={e => setSort(e.target.value as 'recent' | 'name')}><option value="recent">Last edited</option><option value="name">Name</option></select>
              </label>
              {(archivedCount > 0 || archived) && <button className="btn btn-line" aria-pressed={archived} onClick={() => setArchived(!archived)}>{archived ? 'Show active' : `Show archived (${archivedCount})`}</button>}
            </div>
            {shown.length === 0 ? <p className="quiet">{query ? `Nothing matches "${query}".` : archived ? 'Nothing is archived.' : 'Every routine is archived.'}</p> : (
              <ul className="routines">
                {shown.map(p => (
                  <li key={p.id} style={{ '--gel': gelOf(p.formations[0], 0), '--wash': gelOf(p.formations[0], 0) } as React.CSSProperties}>
                    <a href={`#/r/${p.id}`} className="routine-open">
                      <span className="thumb"><StageView stage={p.stage} dancers={p.dancers} positions={p.formations[0].positions} label={`First formation of ${p.name}`} /></span>
                      <span className="routine-text"><b>{p.name}</b><i>{p.dancers.length} dancers · {p.formations.length} formations · edited {when.format(p.updatedAt)}</i></span>
                    </a>
                    <span className="routine-actions">
                      <button className="btn btn-line" onClick={() => run(saveProject({ ...p, id: uid(), name: `${p.name} copy`, audio: undefined, archived: false, createdAt: Date.now(), updatedAt: Date.now() }))}>Duplicate</button>
                      <button className="btn btn-line" onClick={() => run(saveProject({ ...p, archived: !p.archived }))}>{p.archived ? 'Restore' : 'Archive'}</button>
                      <button className="btn btn-line btn-danger" onClick={() => { if (confirm(`Delete "${p.name}" for good? This cannot be undone. Export it first if you might want it back.`)) run(deleteProject(p.id)) }}>Delete</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  )
}
