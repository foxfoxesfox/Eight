// Runs the end-to-end checks in e2e/tests.js against the built site (dist/).
//   npm run e2e               headless Chrome
//   npm run e2e -- --safari   headless Chrome, then Safari (macOS; opens a Safari tab you can close afterwards)
//   npm run e2e:open          keeps serving the test page, to run the checks from any browser yourself
// Set CHROME_PATH if Chrome is not in the usual place. Exits non-zero when any check fails.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const fixtures = join(here, '..', 'src', 'fixtures')
const PORT = 5191
const TIMEOUT = 300_000
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.json': 'application/json' }

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No built site in dist/. Run "npm run build" first (npm run e2e does it for you).')
  process.exit(1)
}

const results = {}
// Only files inside these folders are served, so a crafted path cannot reach the rest of the disk.
const inside = (base, rel) => { const f = normalize(join(base, rel)); return f.startsWith(base + sep) ? f : null }
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'POST' && url.pathname === '/__result') {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => { try { results[url.searchParams.get('b')] = JSON.parse(body) } catch {} res.end('ok') })
    return
  }
  const p = decodeURIComponent(url.pathname)
  const file = p.startsWith('/__t/') ? inside(here, p.slice(5)) : p.startsWith('/__fixtures/') ? inside(fixtures, p.slice(12)) : inside(dist, p === '/' ? 'index.html' : p.slice(1))
  if (file && existsSync(file) && statSync(file).isFile()) {
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    return res.end(readFileSync(file))
  }
  res.statusCode = 404
  res.end()
})
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok))

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(browser) {
  for (let t = 0; t < TIMEOUT; t += 500) { if (results[browser]) return results[browser]; await sleep(500) }
  return { harnessError: `no result from ${browser} within ${TIMEOUT / 1000} s` }
}
function report(browser, r) {
  console.log(`\n${browser}`)
  if (r.harnessError) { console.log(`  test page error: ${r.harnessError}`); return false }
  for (const t of r.results) console.log(`  ${t.ok ? 'pass' : 'FAIL'}  ${t.name}${t.ok ? '' : `\n        ${t.detail}`}`)
  console.log(`  ${r.passed} passed, ${r.failed} failed`)
  return r.failed === 0
}

if (process.argv.includes('--serve')) {
  console.log(`\nOpen http://localhost:${PORT}/__t/harness.html in any browser to run the checks there.`)
  console.log('Reload that page to run them again. Each finished run is also listed here. Press Ctrl+C to stop.')
  const shown = new Set()
  setInterval(() => { for (const [b, r] of Object.entries(results)) if (!b.endsWith('-progress') && !shown.has(r)) { shown.add(r); report(b, r) } }, 500)
  await new Promise(() => {}) // serve until stopped
}

let ok = true
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome')
const profile = mkdtempSync(join(tmpdir(), 'eight-e2e-'))
const chrome = spawn(chromePath, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1700,900', `http://127.0.0.1:${PORT}/__t/harness.html`], { stdio: 'ignore' })
chrome.on('error', e => { results.chrome = { harnessError: `could not start Chrome (${e.message}); set CHROME_PATH` } })
ok = report('chrome', await waitFor('chrome')) && ok
// Chrome keeps writing to its profile until it has quit, so wait for that before tidying up.
if (chrome.exitCode === null && !chrome.killed) await new Promise(r => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 5000) })
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }) } catch {}

if (process.argv.includes('--safari')) {
  if (process.platform !== 'darwin') console.log('\nsafari: skipped, it runs on macOS only')
  else {
    // localhost, not 127.0.0.1: a different address keeps Safari's test storage apart from any earlier run's tabs.
    spawn('open', ['-a', 'Safari', `http://localhost:${PORT}/__t/harness.html`])
    ok = report('safari', await waitFor('safari')) && ok
    console.log('  (the Safari tab can be closed now)')
  }
}

server.close()
process.exit(ok ? 0 : 1)
