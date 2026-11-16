import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import './styles.css'
import { Editor } from './Editor'
import { Help } from './Help'
import { Landing } from './Landing'
import { PrintView } from './Print'
import { Projects } from './Projects'

// Offline use: only in the built site, so the dev server's live reload is never served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})

// The saved theme, or the system's on a first visit, is set before anything is drawn.
let theme: string | null = null
try { theme = localStorage.getItem('eight.theme') } catch { /* storage refused: fall back to the system setting */ }
document.documentElement.dataset.theme = theme === 'dark' || theme === 'light' ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

// Hash routes, so the static host needs no rewrite rules.
const subscribe = (cb: () => void) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb) }

function App() {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const sheets = hash.match(/^#\/r\/([\w-]+)\/print$/)
  if (sheets) return <PrintView key={sheets[1]} id={sheets[1]} />
  const routine = hash.match(/^#\/r\/([\w-]+)$/)
  if (routine) return <Editor key={routine[1]} id={routine[1]} />
  if (hash.startsWith('#/routines')) return <Projects />
  if (hash.startsWith('#/help')) return <Help />
  return <Landing />
}

createRoot(document.getElementById('root')!).render(<App />)
