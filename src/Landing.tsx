import { useEffect, useState, type CSSProperties } from 'react'
import { GELS, newProject, positionsAt, startTimes, totalTime, type Position, type Project } from './model'
import { StageView } from './Stage'

// A made-up four-formation routine, used only to show the stage moving.
const demo: Project = (() => {
  const p = newProject('Demo', 8)
  const ids = p.dancers.map(d => d.id)
  const shape = (pts: [number, number][]): Record<string, Position> => Object.fromEntries(ids.map((id, i) => [id, { x: pts[i][0], y: pts[i][1] }]))
  const shapes: [string, [number, number][]][] = [
    ['Opening line', [[-3.5, 4], [-2.5, 4], [-1.5, 4], [-0.5, 4], [0.5, 4], [1.5, 4], [2.5, 4], [3.5, 4]]],
    ['The point', [[-3, 1.5], [-2, 3], [-1, 4.5], [0, 6], [1, 4.5], [2, 3], [3, 1.5], [0, 3]]],
    ['Two rows', [[-3, 2.5], [-1, 2.5], [1, 2.5], [3, 2.5], [-3, 5.5], [-1, 5.5], [1, 5.5], [3, 5.5]]],
    ['Circle', [[-2.5, 4], [-1.8, 5.8], [0, 6.5], [1.8, 5.8], [2.5, 4], [1.8, 2.2], [0, 1.5], [-1.8, 2.2]]],
  ]
  p.formations = shapes.map(([name, pts], i) => ({ id: String(i), name, color: GELS[i].hex, hold: 2, transition: 2, positions: shape(pts) }))
  return p
})()

function Demo() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const total = totalTime(demo.formations) + 2
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => { setCount(((now - t0) / 1000) % total); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const view = positionsAt(demo.formations, count)
  const f = demo.formations[view.index]
  let wash = f.color!
  if (view.moving) {
    const t = (count - (startTimes(demo.formations)[view.index] - f.transition)) / f.transition
    wash = `color-mix(in srgb, ${f.color} ${Math.round(t * 100)}%, ${demo.formations[view.index - 1].color})`
  }
  return (
    <figure className="demo" style={{ '--gel': f.color, '--wash': wash } as CSSProperties}>
      <StageView stage={demo.stage} dancers={demo.dancers} positions={view.positions} label="Example: eight dancers moving through four formations" />
      <figcaption>Example routine: {f.name.toLowerCase()}, count {Math.floor((count * 2) % 8) + 1}</figcaption>
    </figure>
  )
}

export function Landing() {
  return (
    <div className="page landing">
      <header className="bar">
        <span className="wordmark">Eight</span>
        <nav className="bar-actions"><a className="btn btn-solid" href="#/routines">Open the planner</a></nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Every dancer. Every count.</h1>
            <p>Eight is a free formation planner for dancers, choreographers and crews. Place everyone on the stage, step through each formation, and watch the transitions play count by count, right in your browser.</p>
            <a className="btn btn-solid btn-big" href="#/routines">Start planning</a>
            <p className="fine">No account. Nothing to install. Nothing to pay.</p>
          </div>
          <Demo />
        </section>
        <section className="about">
          <h2>Why "Eight"</h2>
          <p>Eight takes its name from the dance eight-count: a simple structure for bringing movement together. We bring that same clarity to planning formations, helping you see every position, shape every transition, and keep everyone on the same count.</p>
          <dl>
            <div><dt>Yours to keep</dt><dd>Routines are saved in your browser on your device. Export any of them as a file to back up or send to your crew.</dd></div>
            <div><dt>Built in counts</dt><dd>Each formation holds for a number of counts and takes a number of counts to reach. Set the tempo and press play.</dd></div>
            <div><dt>Coming next</dt><dd>Music with a waveform, curved paths, PDF export and share links are planned and not here yet.</dd></div>
          </dl>
        </section>
      </main>
      <footer className="foot">Eight is free and has no ads or tracking.</footer>
    </div>
  )
}
