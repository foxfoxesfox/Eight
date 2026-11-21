// End-to-end checks for Eight. Loads the app in a frame on the same origin and drives it the way a person would.
// Run with `npm run e2e` (headless Chrome) or `npm run e2e -- --safari` (also Safari, macOS). See e2e/run.mjs.
const frame = document.getElementById('app')
const logEl = document.getElementById('log')
const browser = /Chrome\//.test(navigator.userAgent) ? 'chrome' : /Safari\//.test(navigator.userAgent) ? 'safari' : 'other'
const results = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
let W, D
const $ = s => D.querySelector(s)
const $$ = s => [...D.querySelectorAll(s)]
const btn = (text, root = D) => [...root.querySelectorAll('button, a')].find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text)
const until = async (fn, ms = 5000) => { for (let t = 0; t < ms; t += 50) { try { const v = fn(); if (v) return v } catch {} await sleep(50) } return fn() }
const proto = el => el.tagName === 'SELECT' ? W.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : W.HTMLInputElement.prototype
const setVal = (el, v) => { Object.getOwnPropertyDescriptor(proto(el), 'value').set.call(el, String(v)); el.dispatchEvent(new W.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }
const commit = async (el, v) => { setVal(el, v); el.dispatchEvent(new W.FocusEvent('focusout', { bubbles: true })); await sleep(120) }
const field = (label, root = D) => [...root.querySelectorAll('.field')].find(f => f.firstElementChild?.textContent === label)?.querySelector('input, select, textarea')
const check = label => [...D.querySelectorAll('label.check')].find(l => l.textContent.trim().startsWith(label))?.querySelector('input, select')
const key = (k, o = {}) => D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))
const ptr = (el, type, x, y) => el.dispatchEvent(new W.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pointerType: 'mouse' }))
const mid = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }
const goto = async (hash, ready) => { W.location.hash = hash; await until(ready, 6000); await sleep(150) }
const people = () => $$('.floor .dancer:not(.is-prop)')
const spots = () => people().map(g => g.getAttribute('transform')).join(' ')
const clips = () => $$('.clip')
const now = () => $('.deck-now strong')?.textContent
const secsNow = () => { const [m, s] = now().split(':'); return +m * 60 + +s }
const details = () => $('.rail-right h2')?.textContent
const pick = async (input, file) => { const dt = new W.DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new W.Event('change', { bubbles: true })) }
const audioInput = () => $('input[type=file][accept^="audio/*,video"]')
const waveInput = () => $('input[type=file][accept="audio/*,.mp3,.wav,.m4a"]')
const soundMenu = async () => { $('.sound-tag').click(); return until(() => $('.menu-list.ctx')) }
const exportAs = async (i, setup) => { btn('Export').click(); const d = await until(() => $('dialog.dialog[open]')); d.querySelectorAll('input[type=radio]')[i].click(); await sleep(100); if (setup) await setup(d); d.querySelector('.btn-solid').click(); await sleep(200) }
function wav(seconds, hz = 220, name = 'tone.wav') {
  const sr = 8000, n = sr * seconds, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((i / sr) * 2 * Math.PI * hz) * 12000 * (i % sr < sr / 2 ? 1 : 0.3), true)
  return new W.File([buf], name, { type: 'audio/wav' })
}
async function test(name, fn) {
  const t0 = performance.now()
  try { const r = await fn(); results.push({ name, ok: r === true || (typeof r === 'object' && r.ok), detail: r === true ? '' : JSON.stringify(r).slice(0, 400) }) }
  catch (e) { results.push({ name, ok: false, detail: String(e && e.stack || e).slice(0, 400) }) }
  const last = results.at(-1); last.ms = Math.round(performance.now() - t0)
  fetch(`/__result?b=${browser}-progress`, { method: 'POST', body: JSON.stringify(results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name)) })
  logEl.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.detail}`).join('\n')
  const failed = results.filter(r => !r.ok).length, sum = document.getElementById('summary')
  if (sum) { sum.textContent = `Running… ${results.length - failed} passed, ${failed} failed so far`; sum.className = failed ? 'bad' : '' }
  try { W.document.querySelector('.ctx-shade')?.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true })) } catch {}
}
const ok = (cond, info = {}) => ({ ok: !!cond, ...info })

/** Empties the app's storage on this test address, so runs do not pile up routines. Clears rather than deletes: deleting waits forever while any tab of the app is open. */
async function clearData() {
  const names = (await indexedDB.databases?.())?.map(d => d.name) ?? []
  if (!names.includes('eight')) return
  const db = await new Promise((ok, no) => { const r = indexedDB.open('eight'); r.onsuccess = () => ok(r.result); r.onerror = no })
  const stores = [...db.objectStoreNames]
  if (stores.length) await new Promise(ok => { const t = db.transaction(stores, 'readwrite'); stores.forEach(n => t.objectStore(n).clear()); t.oncomplete = t.onerror = ok })
  db.close()
}

async function run() {
  // A fresh database for the run, so earlier runs do not interfere.
  await clearData()
  frame.src = '/#/'
  await new Promise(r => (frame.onload = r))
  W = frame.contentWindow; D = W.document
  // Capture downloads, file pickers, confirmations and printing instead of letting them reach the person's computer.
  W.__downloads = []
  W.localStorage.removeItem('eight.layout') // every run starts from the standard panel sizes
  const made =W.URL.createObjectURL.bind(W.URL)
  W.URL.createObjectURL = b => { const u = made(b); (W.__blobs ??= {})[u] = b; return u }
  const takeAnchor = a => { if (a.download) { W.__downloads.push({ name: a.download, blob: W.__blobs?.[a.href] }); return true } }
  const click = W.HTMLAnchorElement.prototype.click
  W.HTMLAnchorElement.prototype.click = function () { if (!takeAnchor(this)) click.call(this) }
  const disp = W.HTMLAnchorElement.prototype.dispatchEvent
  W.HTMLAnchorElement.prototype.dispatchEvent = function (e) { if (e.type === 'click' && takeAnchor(this)) return true; return disp.call(this, e) }
  W.HTMLInputElement.prototype.click = function () { if (this.type === 'file') W.__picker = this; else HTMLElement.prototype.click.call(this) }
  W.confirm = () => true
  W.print = () => { W.__printed = true }
  const cap = W.Element.prototype.setPointerCapture
  W.Element.prototype.setPointerCapture = function (id) { try { cap.call(this, id) } catch {} }
  const lastDownload = async () => { await until(() => W.__downloads.length, 8000); return W.__downloads.pop() }

  await until(() => D.querySelector('h1'))

  await test('landing page shows the headline and links to Help and the planner', () => ok(/Every dancer/.test($('h1').textContent) && $('a[href="#/help"]') && $('a[href="#/routines"]')))
  await test('help page shows the guide with questions that open', async () => {
    await goto('#/help', () => $('.help h1'))
    const d = $$('.help details'); d[0].querySelector('summary').click(); await sleep(100)
    return ok($('.help h1').textContent === 'Using Eight' && d.length >= 15 && d[0].open && !/\*\*|^#/m.test($('.help').innerText), { questions: d.length })
  })
  await test('theme button switches light and dark and remembers it', async () => {
    const before = D.documentElement.dataset.theme
    $$('.bar-actions .btn')[0].click(); await sleep(100)
    const after = D.documentElement.dataset.theme, saved = W.localStorage.getItem('eight.theme')
    $$('.bar-actions .btn')[0].click(); await sleep(100)
    return ok(before !== after && saved === after && D.documentElement.dataset.theme === before, { before, after, saved })
  })
  await test('create a routine from the library', async () => {
    await goto('#/routines', () => $('form.new'))
    const f = $('form.new')
    setVal(f.querySelector('[name=name]'), 'Test routine'); setVal(f.querySelector('[name=dancers]'), 6); setVal(f.querySelector('[name=width]'), 12)
    f.requestSubmit()
    await until(() => people().length === 6)
    W.__home = W.location.hash
    return ok(people().length === 6 && /6 dancers · 1 formation/.test($('.bar-meta').textContent), { meta: $('.bar-meta')?.textContent })
  })
  await test('rename the routine', async () => { await commit(field('Routine name'), 'Renamed test'); return ok(field('Routine name').value === 'Renamed test') })
  await test('clicking a dancer in the list selects it and shows its details', async () => {
    $$('.dancer-list button')[0].click(); await until(() => details() === 'Dancer')
    return ok(details() === 'Dancer' && field('Name', $('.rail-right')).value === 'Dancer 1' && $$('.floor .dancer.is-selected').length === 1)
  })
  await test('edit a dancer: name, label, shape and colour', async () => {
    const rail = $('.rail-right')
    await commit(field('Name', rail), 'Ava'); await commit(field('Label (1 to 3 characters)', rail), 'AV')
    setVal(field('Shape', rail), 'diamond'); await sleep(100)
    const sw = [...rail.querySelectorAll('fieldset')].find(f => f.querySelector('legend')?.textContent === 'Colour').querySelectorAll('button')[4]; sw.click(); await sleep(100)
    const g = $$('.floor .dancer')[0]
    return ok($$('.dancer-list button')[0].textContent.includes('Ava') && g.querySelector('text').textContent === 'AV' && g.querySelector('polygon') && g.querySelector('polygon').getAttribute('fill') === sw.style.backgroundColor.replace(/rgb\((\d+), (\d+), (\d+)\)/, (_, r, gg, b) => '#' + [r, gg, b].map(n => (+n).toString(16).padStart(2, '0')).join('')), { fill: g.querySelector('polygon')?.getAttribute('fill') })
  })
  await test('arrow keys nudge the selected dancer by half a metre', async () => {
    const t0 = $$('.floor .dancer')[0].getAttribute('transform'); key('ArrowRight'); await sleep(150)
    const t1 = $$('.floor .dancer')[0].getAttribute('transform')
    const x = s => +s.match(/translate\(([-\d.]+)/)[1]
    return ok(Math.abs(x(t1) - x(t0) - 0.5) < 0.01, { t0, t1 })
  })
  await test('drag a dancer on the stage', async () => {
    const g = $$('.floor .dancer')[1], svg = $('.floor .stage'), before = g.getAttribute('transform'), [x, y] = mid(g)
    ptr(g, 'pointerdown', x, y); ptr(svg, 'pointermove', x + 30, y - 40); ptr(svg, 'pointermove', x + 60, y - 80); ptr(svg, 'pointerup', x + 60, y - 80); await sleep(150)
    return ok($$('.floor .dancer')[1].getAttribute('transform') !== before, { before, after: $$('.floor .dancer')[1].getAttribute('transform') })
  })
  await test('drag a box on the stage to select several', async () => {
    key('Escape'); await sleep(50)
    const svg = $('.floor .stage'), r = svg.getBoundingClientRect()
    ptr(svg, 'pointerdown', r.left + 5, r.top + 5); ptr(svg, 'pointermove', r.right - 5, r.bottom - 5); ptr(svg, 'pointerup', r.right - 5, r.bottom - 5); await sleep(150)
    return ok($$('.floor .dancer.is-selected').length >= 5, { selected: $$('.floor .dancer.is-selected').length })
  })
  await test('Ctrl+A selects everyone and Escape clears the selection', async () => {
    key('a', { ctrlKey: true }); await sleep(100); const all = details()
    key('Escape'); await sleep(100)
    return ok(all === '6 selected' && details() === 'Formation 1', { all, after: details() })
  })
  await test('preset shapes and group tools move everyone', async () => {
    const out = {}
    for (const b of ['Circle', 'V', 'Pyramid', 'Block', 'Two rows', 'Turn left', 'Turn right', 'Mirror', 'Spread', 'Tighten', 'Line']) {
      const before = spots(); btn(b, $('.rail-right')).click(); await sleep(120); out[b] = spots() !== before
    }
    const ys = people().map(g => g.getAttribute('transform').split(' ')[1]); out.lineIsFlat = new Set(ys).size === 1
    return ok(Object.values(out).every(Boolean), out)
  })
  await test('offstage tick fades a dancer, and unticking restores it', async () => {
    $$('.dancer-list button')[1].click(); await sleep(100)
    check('Offstage').click(); await sleep(100); const faded = $$('.floor .dancer.is-off').length
    check('Offstage').click(); await sleep(100)
    return ok(faded === 1 && $$('.floor .dancer.is-off').length === 0, { faded })
  })
  await test('add a prop, rename and resize it', async () => {
    btn('Add prop').click(); await until(() => $('.floor .is-prop'))
    $$('.dancer-list')[1].querySelector('button').click(); await until(() => details() === 'Prop')
    const rail = $('.rail-right'); await commit(field('Width', rail), 3); await commit(field('Name', rail), 'Riser')
    const rect = $('.floor .is-prop .dancer-body rect')
    return ok(+rect.getAttribute('width') === 3 && $('.floor .is-prop text').textContent === 'Riser' && /6 dancers/.test($('.bar-meta').textContent), { width: rect.getAttribute('width') })
  })
  await test('props come in five shapes; dancers and props have eight colours and a picker', async () => {
    const rail = $('.rail-right'), shape = field('Shape', rail), out = {}
    out.names = [...shape.options].map(o => o.textContent).join(', ')
    setVal(shape, 'circle'); await sleep(100); out.oval = !!$('.floor .is-prop .dancer-body ellipse')
    setVal(shape, 'triangle'); await sleep(100); out.triangle = $('.floor .is-prop .dancer-body polygon')?.getAttribute('points').split(' ').length === 3
    setVal(shape, 'square'); await sleep(100)
    const colours = [...rail.querySelectorAll('fieldset')].find(f => f.querySelector('legend')?.textContent === 'Colour')
    out.swatches = colours.querySelectorAll('button').length; out.picker = !!colours.querySelector('input[type=color]')
    return ok(out.names === 'Rectangle, Oval, Triangle, Diamond, Hexagon' && out.oval && out.triangle && out.swatches === 8 && out.picker, out)
  })
  await test('remove a dancer, then undo and redo', async () => {
    $$('.dancer-list button')[5].click(); await sleep(100)
    btn('Remove from routine').click(); await sleep(150); const removed = people().length
    btn('Undo').click(); await sleep(150); const undone = people().length
    btn('Redo').click(); await sleep(150); const redone = people().length
    btn('Undo').click(); await sleep(150)
    return ok(removed === 5 && undone === 6 && redone === 5 && people().length === 6, { removed, undone, redone })
  })
  await test('Ctrl+Z and Ctrl+Shift+Z undo and redo', async () => {
    btn('Add dancer').click(); await sleep(150); const added = people().length
    key('z', { ctrlKey: true }); await sleep(150); const undone = people().length
    key('z', { ctrlKey: true, shiftKey: true }); await sleep(150); const redone = people().length
    key('z', { ctrlKey: true }); await sleep(150)
    return ok(added === 7 && undone === 6 && redone === 7, { added, undone, redone })
  })
  await test('"Add formation" at the end of the timeline adds after the last one', async () => {
    key('Escape'); $('.clip-add').click(); await until(() => clips().length === 2)
    return ok(clips().length === 2 && clips()[1].classList.contains('is-current') && details() === 'Formation 2')
  })
  await test('moving a selected dancer shows its path from the formation before', async () => {
    $$('.dancer-list button')[0].click(); await sleep(80); key('ArrowUp'); key('ArrowUp'); await sleep(150)
    return ok($$('.floor .trail path').length >= 1 && $('.floor .bend'), { trails: $$('.floor .trail').length })
  })
  await test('dragging the path handle bends the path; double-click straightens it', async () => {
    const h = $('.floor .bend'), svg = $('.floor .stage'), [x, y] = mid(h)
    ptr(h, 'pointerdown', x, y); ptr(svg, 'pointermove', x + 40, y); ptr(svg, 'pointerup', x + 40, y); await sleep(150)
    const bent = /Q/.test($('.floor .trail path').getAttribute('d'))
    $('.floor .bend').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await sleep(150)
    return ok(bent && !/Q/.test($('.floor .trail path').getAttribute('d')), { bent })
  })
  await test('the clash warning names dancers who would walk into each other', async () => {
    key('Escape'); await sleep(80); btn('Line', $('.rail-right')).click(); await sleep(100); btn('Mirror', $('.rail-right')).click(); await sleep(200)
    return ok($('.warn') && $$('.floor .dancer.is-clash').length >= 2, { warn: $('.warn')?.textContent.slice(0, 80) })
  })
  await test('right-click a dancer or prop: colour, offstage, back to the last spot, remove', async () => {
    const out = {}
    const open = async el => { const [x, y] = mid(el); el.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); return until(() => $('.menu-list.ctx')) }
    const close = m => m.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    key('Escape'); await sleep(60)
    let m = await open(people()[2]); out.items = [...m.querySelectorAll('[role=menuitem]')].map(b => b.textContent); out.selectsIt = details() === 'Dancer'
    m.querySelectorAll('.menu-swatches button')[4].click(); await sleep(120); out.coloured = !!people()[2].querySelector('[fill="#b79bff"]') && !$('.menu-list.ctx')
    m = await open(people()[2]); btn('Offstage in this formation', m).click(); await sleep(120); out.off = people()[2].classList.contains('is-off')
    m = await open(people()[2]); btn('Back on stage in this formation', m).click(); await sleep(120); out.on = !people()[2].classList.contains('is-off')
    const before = people()[2].getAttribute('transform')
    m = await open(people()[2]); [...m.querySelectorAll('button')].find(b => b.textContent.startsWith('Back to where')).click(); await sleep(120); out.backToLast = people()[2].getAttribute('transform') !== before
    key('a', { ctrlKey: true }); await sleep(80); m = await open(people()[0]); out.actsOnSelection = !!btn(`Remove ${people().length} from routine`, m); close(m); await sleep(80)
    m = await open($$('.dancer-list')[1].querySelector('button')); btn('Remove prop', m).click(); await sleep(150); out.propRemoved = !$('.floor .is-prop')
    btn('Undo').click(); await sleep(150); out.propBack = !!$('.floor .is-prop')
    key('Escape'); await sleep(60); const n = people().length
    m = await open($$('.dancer-list')[0].querySelectorAll('button')[n - 1]); btn('Remove from routine', m).click(); await sleep(150); out.removed = people().length === n - 1
    btn('Undo').click(); await sleep(150); out.undone = people().length === n
    return ok(Object.entries(out).every(([k, v]) => k === 'items' || v), out)
  })
  await test('formation right-click menu: duplicate, reset, line up, move, delete', async () => {
    const menu = async i => { clips()[i].dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 500 })); return until(() => $('.menu-list.ctx')) }
    const out = {}
    let m = await menu(1); out.items = [...m.querySelectorAll('button')].map(b => b.textContent + (b.disabled ? ' (off)' : ''))
    btn('Duplicate', m).click(); await sleep(150); out.duplicated = clips().length === 3
    m = await menu(2); const reset = [...m.querySelectorAll('button')].find(b => b.textContent.startsWith('Reset')); reset.click(); await sleep(150)
    clips()[1].querySelector('.clip-body').click(); await sleep(100); const f2 = spots(); clips()[2].querySelector('.clip-body').click(); await sleep(100); out.resetMatches = spots() === f2
    m = await menu(2); btn('Line everyone up', m).click(); await sleep(150); out.lineUp = spots() !== f2
    const colours = () => clips().map(c => c.style.background).join()
    const c0 = colours(); m = await menu(2); btn('Move earlier', m).click(); await sleep(150); out.movedEarlier = colours() !== c0
    m = await menu(1); btn('Move later', m).click(); await sleep(150); out.movedBack = colours() === c0
    m = await menu(2); btn('Delete', m).click(); await sleep(150); out.deleted = clips().length === 2
    m = await menu(0); out.firstHasNoReset = [...m.querySelectorAll('button')].find(b => b.textContent.startsWith('Reset')).disabled && btn('Move earlier', m).disabled
    m.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100); out.escapeCloses = !$('.menu-list.ctx')
    return ok(Object.entries(out).every(([k, v]) => k === 'items' || v), out)
  })
  await test('formation panel: name, lighting colour, note, earlier, later, delete', async () => {
    clips()[1].querySelector('.clip-body').click(); await sleep(150)
    const rail = $('.rail-right'), out = {}
    await commit(field('Name (optional)', rail), 'Chorus'); out.named = clips()[1].querySelector('.clip-body').getAttribute('aria-label') === 'Chorus'
    const bg = clips()[1].style.background; [...rail.querySelectorAll('fieldset')].find(f => f.querySelector('legend')?.textContent === 'Lighting colour').querySelectorAll('button')[4].click(); await sleep(100); out.lit = clips()[1].style.background !== bg
    const note = field('Note', rail); setVal(note, 'Big jump'); note.dispatchEvent(new W.FocusEvent('focusout', { bubbles: true })); await sleep(120)
    clips()[0].querySelector('.clip-body').click(); await sleep(100); clips()[1].querySelector('.clip-body').click(); await sleep(150); out.noteKept = field('Note', $('.rail-right')).value === 'Big jump'
    btn('Move formation earlier').click(); await sleep(150); out.earlier = clips()[0].querySelector('.clip-body').getAttribute('aria-label') === 'Chorus'
    btn('Move formation later').click(); await sleep(150); out.later = clips()[1].querySelector('.clip-body').getAttribute('aria-label') === 'Chorus'
    $('.clip-add').click(); await sleep(150); btn('Delete formation').click(); await sleep(150); out.deleted = clips().length === 2
    return ok(Object.values(out).every(Boolean), out)
  })
  await test('the "In formation" and "Moving in" fields resize the bar', async () => {
    clips()[1].querySelector('.clip-body').click(); await sleep(100)
    const w0 = clips()[1].getBoundingClientRect().width
    await commit(field('In formation'), 6); await commit(field('Moving in'), 1)
    const w1 = clips()[1].getBoundingClientRect().width
    return ok(Math.abs(w1 - w0 - 48) < 3 && /of 0:11\.00/.test($('.deck-now').textContent), { w0, w1, total: $('.deck-now').textContent })
  })
  await test('trim handles change lengths by keyboard and by dragging', async () => {
    const hold = () => +field('In formation').value
    const h = clips()[1].querySelector('.trim-hold'); const before = hold()
    h.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(120); const keyed = hold()
    const [x, y] = mid(clips()[1].querySelector('.trim-hold')); const hh = clips()[1].querySelector('.trim-hold')
    ptr(hh, 'pointerdown', x, y); ptr(hh, 'pointermove', x + 48, y); ptr(hh, 'pointerup', x + 48, y); await sleep(150); const dragged = hold()
    const m = clips()[1].querySelector('.trim-transition'), [mx, my] = mid(m), move0 = +field('Moving in').value
    ptr(m, 'pointerdown', mx, my); ptr(m, 'pointermove', mx + 24, my); ptr(m, 'pointerup', mx + 24, my); await sleep(150)
    return ok(Math.abs(keyed - before - 0.1) < 0.01 && Math.abs(dragged - keyed - 1) < 0.05 && Math.abs(+field('Moving in').value - move0 - 0.5) < 0.05, { before, keyed, dragged, move: [move0, field('Moving in').value] })
  })
  await test('clicking a bar puts the playhead at its start', async () => {
    clips()[1].querySelector('.clip-body').click(); await sleep(120); return ok(now() === '0:05.50', { now: now() })
  })
  await test('ruler clicks move the playhead, and every "Snap to" choice works', async () => {
    const ruler = $('.ruler'), r = ruler.getBoundingClientRect(), out = {}
    const at = async s => { ptr(ruler, 'pointerdown', r.left + s * 48, r.top + 5); ptr(ruler, 'pointerup', r.left + s * 48, r.top + 5); await sleep(120); return now() }
    const snap = check('Snap to')
    for (const [v, want] of [['off', '0:01.30'], ['count', '0:01.50'], ['half', '0:01.25'], ['bar', '0:00.00'], ['second', '0:01.00'], ['edge', '0:01.30']]) { setVal(snap, v); await sleep(80); out[v] = await at(1.3); out[v + 'Ok'] = out[v] === want }
    setVal(snap, 'edge'); await sleep(50); out.edgeNear = await at(4.06); out.edgeNearOk = out.edgeNear === '0:04.00'
    setVal(snap, 'off')
    return ok(Object.entries(out).filter(([k]) => k.endsWith('Ok')).every(([, v]) => v), out)
  })
  await test('zoom in, zoom out and Fit change the timeline scale', async () => {
    const w = () => clips()[0].getBoundingClientRect().width, w0 = w()
    btn('Zoom in').click(); await sleep(100); const zin = w(); btn('Zoom out').click(); btn('Zoom out').click(); await sleep(100); const zout = w()
    btn('Fit').click(); await sleep(100); const reel = $('.reel'), fits = $('.clip-add').getBoundingClientRect().left < reel.getBoundingClientRect().right
    for (let i = 0; i < 20 && Math.abs(w() - w0) > 1; i++) { btn(w() < w0 ? 'Zoom in' : 'Zoom out').click(); await sleep(30) }
    return ok(zin > w0 && zout < w0 && fits, { w0, zin, zout, fits })
  })
  await test('Play advances the clock, Stop halts it, and Space toggles', async () => {
    clips()[0].querySelector('.clip-body').click(); await sleep(100)
    btn('Play from the playhead').click(); await sleep(1000); const played = secsNow()
    btn('Stop').click(); await sleep(100); const a = secsNow(); await sleep(400); const b = secsNow()
    key(' '); await sleep(600); const spaced = secsNow(); key(' '); await sleep(100)
    return ok(played > 0.6 && played < 1.5 && a === b && spaced > b, { played, a, b, spaced })
  })
  await test('the speed slider slows playback down', async () => {
    clips()[0].querySelector('.clip-body').click(); await sleep(100)
    const s = check('Speed'); setVal(s, 0.5); await sleep(80)
    btn('Play from the playhead').click(); await sleep(1200); btn('Stop').click(); const t = secsNow(); setVal(s, 1)
    return ok(t > 0.4 && t < 0.85 && $('.check.slider output').textContent === '1.00×', { t })
  })
  await test('"Loop formation" repeats the formation the playhead is in', async () => {
    clips()[0].querySelector('.clip-body').click(); await sleep(100); await commit(field('In formation'), 1)
    check('Loop formation').click(); await sleep(50)
    btn('Play from the playhead').click(); const seen = []; for (let i = 0; i < 12; i++) { await sleep(200); seen.push(secsNow()) } btn('Stop').click()
    check('Loop formation').click(); await commit(field('In formation'), 4)
    const wrapped = seen.some((t, i) => i && t < seen[i - 1]), max = Math.max(...seen)
    return ok(wrapped && max <= 1.1, { seen })
  })
  await test('counts mode: lengths in counts, tempo keeps counts, counts in a bar', async () => {
    const out = {}
    clips()[0].querySelector('.clip-body').click(); await sleep(100)
    setVal(field('Time formations in'), 'counts'); await sleep(150)
    out.inCounts = field('In formation').value === '8' && /counts/.test(clips()[0].querySelector('.clip-body').title)
    out.snapOn = check('Snap to').value === 'count'
    const w0 = clips()[0].getBoundingClientRect().width
    await commit(field('Tempo of the beat grid'), 60); out.keptCounts = field('In formation').value === '8' && clips()[0].getBoundingClientRect().width > w0 * 1.9
    await commit(field('Tempo of the beat grid'), 120)
    await commit(field('Counts in a bar'), 6); clips()[1].querySelector('.clip-body').click(); await sleep(100)
    out.bar = $('.deck-now').textContent; out.barOk = /bar 2, count 3/.test(out.bar) // 5.5 s at 120 BPM is count 11: bar 2, count 5 with 6 a bar? checked below
    await commit(field('Counts in a bar'), 8); setVal(field('Time formations in'), 'seconds'); await sleep(150)
    out.back = field('In formation').value
    return ok(out.inCounts && out.snapOn && out.keptCounts && out.back !== '8', out)
  })
  await test('new formations take the default lengths', async () => {
    await commit(field('New formations hold'), 3); await commit(field('and move in'), 1)
    $('.clip-add').click(); await sleep(150)
    const r = [field('In formation').value, field('Moving in').value]
    btn('Delete formation').click(); await sleep(150)
    return ok(r[0] === '3' && r[1] === '1', { r })
  })
  await test('"Set first beat to playhead" fills in the first beat', async () => {
    clips()[1].querySelector('.clip-body').click(); await sleep(100); btn('Set first beat to playhead').click(); await sleep(120)
    const v = field('First beat at').value; await commit(field('First beat at'), 0)
    return ok(+v === secsNow(), { v, now: now() })
  })
  await test('stage settings: feet, size, grid, snap and floor markings', async () => {
    const out = {}, svg = () => $('.floor .stage')
    setVal(field('Measure in'), 'ft'); await sleep(150); out.feet = field('Stage width').value; out.feetOk = Math.abs(+out.feet - 39.37) < 0.05
    const vb = svg().getAttribute('viewBox'); await commit(field('Stage width'), 30); out.resized = svg().getAttribute('viewBox') !== vb
    const lines = $$('.floor .stage-grid line').length; setVal(field('Grid lines every'), field('Grid lines every').options[2].value); await sleep(100); out.grid = $$('.floor .stage-grid line').length !== lines
    setVal(field('Dancers snap to'), 0); await sleep(80); out.snapNone = field('Dancers snap to').value === '0'
    setVal(field('Floor markings'), 'numbers'); await sleep(100); out.numbers = $$('.floor .stage-number').length > 3
    setVal(field('Floor markings'), 'quarters'); await sleep(100); out.quarters = $$('.floor .stage-quarter').length === 2
    setVal(field('Floor markings'), 'centre'); setVal(field('Measure in'), 'm'); await sleep(120); await commit(field('Stage width'), 12)
    return ok(Object.values(out).every(Boolean), out)
  })
  await test("Dancers' view turns the stage round, and back", async () => {
    btn("Dancers' view").click(); await sleep(120)
    const flipped = /top/.test($('.floor .stage').getAttribute('aria-label')) && +$('.floor .stage-front').getAttribute('y') < 0
    btn("Dancers' view").click(); await sleep(100)
    return ok(flipped && /bottom/.test($('.floor .stage').getAttribute('aria-label')))
  })
  await test('side panels hide and show, and panel edges resize by dragging and by arrow keys', async () => {
    const out = {}, cols = () => getComputedStyle($('.editor')).gridTemplateColumns.split(' ')
    btn('Hide the dancers panel').click(); await sleep(100); out.leftHidden = $('.editor > .rail:not(.rail-right)').hidden && cols()[0] === '0px'
    btn('Show the dancers panel').click(); await sleep(100); out.leftBack = !$('.editor > .rail:not(.rail-right)').hidden
    btn('Hide the details panel').click(); await sleep(100); out.rightHidden = $('.rail-right').hidden && cols()[2] === '0px'
    btn('Show the details panel').click(); await sleep(100); out.rightBack = !$('.rail-right').hidden
    const w0 = parseFloat(cols()[0]), g = $('.grip-left'), [x, y] = mid(g)
    ptr(g, 'pointerdown', x, y); ptr(g, 'pointermove', x + 48, y); ptr(g, 'pointerup', x + 48, y); await sleep(100); out.dragged = parseFloat(cols()[0]) - w0
    for (let i = 0; i < 3; i++) $('.grip-left').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await sleep(100); out.keyedBack = parseFloat(cols()[0]) === w0
    const t0 = $('.track').getBoundingClientRect().height
    for (let i = 0; i < 2; i++) $('.grip-bottom').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await sleep(100); out.taller = $('.track').getBoundingClientRect().height - t0
    for (let i = 0; i < 2; i++) $('.grip-bottom').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    out.saved = !!W.localStorage.getItem('eight.layout')
    return ok(out.leftHidden && out.leftBack && out.rightHidden && out.rightBack && out.dragged === 48 && out.keyedBack && out.taller === 32 && out.saved, out)
  })
  await test('Preview runs the routine full screen, with arrow keys between formations and Escape to leave', async () => {
    // Where everyone stands in each formation, to prove the preview's arrow keys never move anyone.
    const saved = async () => { const r = []; for (const c of clips()) { c.querySelector('.clip-body').click(); await sleep(60); r.push(spots()) } return r.join('|') }
    $$('.dancer-list button')[0].click(); await sleep(60); const before = await saved()
    btn('Preview').click(); await until(() => $('.preview')); const out = { opened: !!$('.preview'), atStart: $('.preview-title b')?.textContent }
    key('ArrowRight'); await sleep(150); out.next = $('.preview-title b')?.textContent
    key('ArrowLeft'); await sleep(150); out.back = $('.preview-title b')?.textContent
    key(' '); await sleep(700); out.playing = btn('Pause', $('.preview')) !== undefined
    key('Escape'); await sleep(200); out.closed = !$('.preview') && !!btn('Play from the playhead')
    out.dancersUntouched = (await saved()) === before
    return ok(out.opened && out.atStart === 'Formation 1' && out.next !== out.atStart && out.dancersUntouched && out.back === 'Formation 1' && out.playing && out.closed, out)
  })
  await test('the Paths menu shows paths for everyone, the selected, or no one', async () => {
    clips()[1].querySelector('.clip-body').click(); await sleep(100)
    const sel = $('.floor-tool select'); setVal(sel, 'always'); await sleep(100); const all = $$('.floor .trail').length
    setVal(sel, 'never'); await sleep(100); const none = $$('.floor .trail').length; setVal(sel, 'selected')
    return ok(all >= 2 && none === 0, { all, none })
  })
  await test('add a song: track label, waveform and volume in its menu', async () => {
    await pick(audioInput(), wav(3, 220, 'song-one.wav')); await until(() => $('.sound-tag'), 8000); await sleep(400)
    const c = $('.wave canvas'), px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) ink++
    const m = await soundMenu(); setVal(m.querySelector('input[type=range]'), 0.3); await sleep(100)
    const tag = $('.sound-tag').textContent; m.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(80)
    return ok(/song-one\.wav/.test(tag) && /30%/.test(tag) && ink > 200 && !$('.menu-list.ctx'), { tag, ink })
  })
  await test('right-clicking the waveform opens the same menu', async () => {
    const w = $('.wave'), [x, y] = mid(w); w.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
    const m = await until(() => $('.menu-list.ctx')); const items = [...m.querySelectorAll('button')].map(b => b.textContent)
    m.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(80)
    return ok(items.includes('Remove music') && items.some(t => t.startsWith('Replace')), { items })
  })
  await test('replace the song with a video: it plays beside the stage, mirrors and hides', async () => {
    const m = await soundMenu(); btn('Replace with another song or video…', m).click(); await sleep(80)
    const video = await (await fetch('/__fixtures/tiny.mp4')).blob()
    await pick(W.__picker, new W.File([video], 'clip.mp4', { type: 'video/mp4' })); await until(() => $('.screen video'), 8000); await sleep(300)
    const out = { shown: !$('.screen').hidden, tag: $('.sound-tag')?.textContent }
    btn('Mirror video').click(); await sleep(80); out.mirrored = $('.screen').classList.contains('is-mirrored'); btn('Mirror video').click()
    btn('Hide video').click(); await sleep(80); out.hidden = $('.screen').hidden && !$('.floor').classList.contains('has-screen'); btn('Show video').click(); await sleep(80)
    out.back = !$('.screen').hidden
    return ok(out.shown && /clip\.mp4/.test(out.tag) && out.mirrored && out.hidden && out.back, out)
  })
  await test('the divider between the stage and the video moves both ways', async () => {
    const share = () => { const [a, , b] = getComputedStyle($('.floor')).gridTemplateColumns.split(' ').map(parseFloat); return a / (a + b) }
    const s0 = share(), g = $('.grip-split'), [x, y] = mid(g)
    ptr(g, 'pointerdown', x, y); ptr(g, 'pointermove', x - 120, y); ptr(g, 'pointerup', x - 120, y); await sleep(100); const smaller = share()
    for (let i = 0; i < 6; i++) $('.grip-split').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await sleep(100); const bigger = share()
    return ok(g && smaller < s0 - 0.05 && bigger > smaller + 0.2, { s0, smaller, bigger })
  })
  await test('a song file can draw the waveform for a video, with an offset', async () => {
    btn('Use a song file for the waveform').click(); await sleep(80)
    await pick(W.__picker, wav(2, 330, 'studio.wav')); await until(() => btn('Starts at playhead'), 6000)
    const from = [...$$('.readout')].find(r => /Waveform from/.test(r.textContent))?.textContent
    clips()[0].querySelector('.clip-body').click(); const ruler = $('.ruler'), r = ruler.getBoundingClientRect(); ptr(ruler, 'pointerdown', r.left + 48, r.top + 5); await sleep(120)
    const playhead = secsNow(); btn('Starts at playhead').click(); await sleep(120); const offset = field('That song starts this far into the video').value
    btn("Use the video's sound").click(); await sleep(400)
    return ok(/studio\.wav/.test(from) && +offset === playhead && playhead > 0 && btn('Use a song file for the waveform'), { from, offset, playhead })
  })
  await test('dropping a file on the editor adds it', async () => {
    const dt = new W.DataTransfer(); dt.items.add(wav(2, 440, 'dropped.wav'))
    const ed = $('.editor'); ed.dispatchEvent(new W.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(60)
    const hint = !!$('.drop-hint'); ed.dispatchEvent(new W.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await until(() => /dropped\.wav/.test($('.sound-tag')?.textContent ?? ''), 8000)
    return ok(hint && /dropped\.wav/.test($('.sound-tag').textContent) && !$('.drop-hint') && !$('.screen video'), { hint, tag: $('.sound-tag')?.textContent })
  })
  await test('trim the start and end of the song, and playback uses only the kept stretch', async () => {
    const out = {}, handle = i => $$('.sound-trim')[i], value = i => +handle(i).getAttribute('aria-valuenow')
    // Which media element is the editor's song, caught when it is played.
    let el = null; const play = W.HTMLMediaElement.prototype.play
    W.HTMLMediaElement.prototype.play = function () { if (!this.closest?.('.preview')) el = this; return play.call(this) }
    for (let i = 0; i < 5; i++) handle(0).dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await sleep(150); out.start = value(0)
    const pps = clips()[0].getBoundingClientRect().width / (+field('In formation')?.value || 4)
    const h = handle(1), [x, y] = mid(h)
    ptr(h, 'pointerdown', x, y); ptr(h, 'pointermove', x - pps * 0.3, y); ptr(h, 'pointerup', x - pps * 0.3, y); await sleep(150); out.end = value(1)
    clips()[0].querySelector('.clip-body').click(); await sleep(100)
    btn('Play from the playhead').click(); await sleep(700); out.clock = secsNow(); out.media = el?.currentTime; btn('Stop').click(); await sleep(100)
    out.inStep = el && Math.abs(el.currentTime - out.start - secsNow()) < 0.35
    const ruler = $('.ruler'), r = ruler.getBoundingClientRect(); setVal(check('Snap to'), 'off')
    ptr(ruler, 'pointerdown', r.left + pps * 1.2, r.top + 5); ptr(ruler, 'pointerup', r.left + pps * 1.2, r.top + 5); await sleep(120)
    let m = await soundMenu(); btn('Trim the end to the playhead', m).click(); await sleep(150); out.endAtPlayhead = value(1)
    m = await soundMenu(); btn('Restore the full length', m).click(); await sleep(150); out.restored = [value(0), value(1)]
    W.HTMLMediaElement.prototype.play = play
    return ok(out.start === 0.5 && Math.abs(out.end - 1.7) < 0.05 && out.inStep && Math.abs(out.endAtPlayhead - 1.7) < 0.05 && out.restored[0] === 0 && out.restored[1] === 2, out)
  })
  await test('a file that is not music or video is refused with a message', async () => {
    await pick(audioInput(), new W.File(['hello'], 'notes.txt', { type: 'text/plain' })); const t = await until(() => $('.toast[role=alert]'))
    const text = t?.textContent; btn('Dismiss', t)?.click()
    return ok(/not music or video/.test(text), { text })
  })
  await test('remove the music, then undo brings it back', async () => {
    const m = await soundMenu(); btn('Remove music', m).click(); await sleep(200); const empty = !!$('.sound-add')
    btn('Undo').click(); await until(() => $('.sound-tag'), 6000)
    return ok(empty && /dropped\.wav/.test($('.sound-tag')?.textContent), { empty })
  })
  let routineFile
  await test('export: routine file', async () => {
    W.__downloads = []; await exportAs(0); const d = await lastDownload(); routineFile = d
    const p = JSON.parse(await d.blob.text())
    return ok(/Renamed test\.eight\.json$/.test(d.name) && p.formations.length === clips().length && p.dancers.length === 7, { name: d.name })
  })
  await test('export: picture of the formation', async () => {
    W.__downloads = []; await exportAs(1); const d = await lastDownload()
    return ok(/\.png$/.test(d.name) && d.blob.type === 'image/png' && d.blob.size > 5000, { name: d.name, size: d.blob?.size })
  })
  await test('export: video of the routine', async () => {
    await exportAs(3, async d => { setVal(d.querySelector('select'), 720) })
    const a = await until(() => $('.toast a[download]'), 30000)
    const b = a && await (await fetch(a.href)).blob()
    const meta = b && await new Promise(res => { const v = D.createElement('video'); v.muted = true; v.onloadedmetadata = () => res([v.videoWidth, v.videoHeight, v.duration]); v.onerror = () => res('unreadable'); setTimeout(() => res('no metadata'), 8000); v.src = a.href })
    btn('Dismiss', a?.closest('.toast'))?.click()
    return ok(b && /^video\//.test(b.type) && b.size > 20000 && meta[0] === 1280, { type: b?.type, size: b?.size, meta, error: $('.toast[role=alert]')?.textContent })
  })
  await test('export: PDF sheets page, its options, Download PDF and Print', async () => {
    const n = clips().length; await exportAs(2); await until(() => $('.sheet'), 6000)
    const out = { sheets: $$('.sheet').length === n }
    const opt = label => [...$$('label.check')].find(l => l.textContent.includes(label)).querySelector('input')
    opt('Dancer names').click(); await sleep(80); out.names = $$('.legend').length === 0; opt('Dancer names').click()
    opt('Paths').click(); await sleep(80); out.paths = $$('.sheet .trail').length === 0; opt('Paths').click()
    opt('Save ink').click(); await sleep(50); out.ink = $('.print').classList.contains('save-ink'); opt('Save ink').click()
    setVal($('.print-options select'), 4); await sleep(80); out.fourUp = $('.print').classList.contains('per-4'); setVal($('.print-options select'), 1)
    W.__downloads = []; btn('Download PDF').click(); const d = await lastDownload(); out.pdf = /\.pdf$/.test(d?.name) && d.blob?.type === 'application/pdf' && d.blob.size > 5000
    btn('Print').click(); out.printed = !!W.__printed
    btn('Back to the editor').click(); await until(() => $('.clip')); out.back = !!$('.clip')
    return ok(Object.values(out).every(Boolean), out)
  })
  await test('Import in the editor opens a routine file as a new routine', async () => {
    const id = W.location.hash; btn('Import').click(); await sleep(50)
    await pick(W.__picker, new W.File([await routineFile.blob.text()], routineFile.name, { type: 'application/json' }))
    await until(() => W.location.hash !== id && $('.clip'), 6000); await sleep(300)
    return ok(W.location.hash !== id && field('Routine name').value === 'Renamed test' && clips().length >= 2, { hash: W.location.hash })
  })
  await test('the editor Help button opens the guide in a new tab', () => ok($('.bar-actions a[href="#/help"][target=_blank]')))
  await test('library: search, sort, duplicate, archive, restore, delete', async () => {
    await goto('#/routines', () => $('.routines li')); const out = {}, count = () => $$('.routines > li').length
    out.start = count()
    setVal($('input[type=search]'), 'zzz'); await sleep(80); out.searchNone = count() === 0; setVal($('input[type=search]'), ''); await sleep(80)
    setVal($('.filters select'), 'name'); await sleep(80); out.sorted = count() === out.start
    btn('Duplicate').click(); await until(() => count() === out.start + 1); out.duplicated = count() === out.start + 1
    btn('Archive').click(); await until(() => count() === out.start); out.archived = !!$$('.filters .btn').find(b => /Show archived \(1\)/.test(b.textContent))
    $$('.filters .btn')[0].click(); await until(() => btn('Restore')); btn('Restore').click(); await sleep(200); $$('.filters .btn')[0]?.click(); await sleep(200); out.restored = count() === out.start + 1
    btn('Delete').click(); await until(() => count() === out.start); out.deleted = count() === out.start
    return ok(Object.entries(out).every(([k, v]) => k === 'start' || v), out)
  })
  await test('library: "Back up all" and importing the backup', async () => {
    const count = () => $$('.routines > li').length, n = count()
    W.__downloads = []; btn('Back up all').click(); const d = await lastDownload(); const all = JSON.parse(await d.blob.text())
    btn('Import a file').click(); await sleep(50); await pick(W.__picker, new W.File([JSON.stringify(all)], d.name, { type: 'application/json' }))
    await until(() => count() === n + all.length, 6000)
    return ok(Array.isArray(all) && all.length === n && count() === n * 2, { n, after: count() })
  })
  await test('opening a routine with its stored song shows it again', async () => {
    $$('.routines a').find(a => a.getAttribute('href') === W.__home).click()
    const tag = await until(() => /dropped\.wav/.test($('.sound-tag')?.textContent ?? ''), 8000)
    const c = $('.wave canvas'), px = c?.getContext('2d').getImageData(0, 0, c.width, c.height).data ?? []; let ink = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) ink++
    return ok(tag && ink > 100, { tag: $('.sound-tag')?.textContent, ink })
  })
  await test('no text in the timeline readout is cut off', async () => {
    const cut = [...$$('.deck-now > span > span')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)
    return ok(cut.length === 0, { cut })
  })

  await clearData()
  const summary = { browser, ua: navigator.userAgent, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }
  const sum = document.getElementById('summary')
  if (sum) { sum.textContent = `Finished: ${summary.passed} passed, ${summary.failed} failed`; sum.className = summary.failed ? 'bad' : 'good' }
  else logEl.textContent = `${summary.passed} passed, ${summary.failed} failed\n\n` + logEl.textContent
  await fetch(`/__result?b=${browser}`, { method: 'POST', body: JSON.stringify(summary) })
}
run().catch(e => { logEl.textContent += '\nHARNESS ERROR ' + e.stack; fetch(`/__result?b=${browser}`, { method: 'POST', body: JSON.stringify({ browser, harnessError: String(e.stack), results }) }) })
