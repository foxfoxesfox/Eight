import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import './styles.css'
import { Editor } from './Editor'
import { Landing } from './Landing'
import { Projects } from './Projects'

// Hash routes, so the static host needs no rewrite rules.
const subscribe = (cb: () => void) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb) }

function App() {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const routine = hash.match(/^#\/r\/([\w-]+)$/)
  if (routine) return <Editor key={routine[1]} id={routine[1]} />
  if (hash.startsWith('#/routines')) return <Projects />
  return <Landing />
}

createRoot(document.getElementById('root')!).render(<App />)
