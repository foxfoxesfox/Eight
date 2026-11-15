import { stageCanvas } from './ui'

export interface Sheet {
  title: string
  /** Subtitle and timing, shown small under the title. */
  meta: string
  note?: string
  names?: string
  svg: SVGSVGElement
}

/** Builds one PDF of every formation and saves it to the browser's downloads folder. */
// shortcut: the built-in PDF font covers Latin text only; embed a font once names in other scripts must print.
export async function savePdf(name: string, sheets: Sheet[], perPage: 1 | 4) {
  const { jsPDF } = await import('jspdf') // loaded on demand so the editor itself stays small
  const big = perPage === 1
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: big ? 'portrait' : 'landscape' })
  const M = 12
  const cols = big ? 1 : 2
  const cw = (doc.internal.pageSize.getWidth() - M * (cols + 1)) / cols
  const ch = (doc.internal.pageSize.getHeight() - M * (cols + 1)) / cols
  const line = big ? 4.6 : 3.4

  for (let k = 0; k < sheets.length; k++) {
    const s = sheets[k]
    const slot = k % perPage
    if (k && slot === 0) doc.addPage()
    const x = M + (slot % cols) * (cw + M)
    const top = M + Math.floor(slot / cols) * (ch + M)
    let y = top

    doc.setFont('helvetica', 'bold').setFontSize(big ? 18 : 12).setTextColor(23, 23, 26)
    doc.text(doc.splitTextToSize(s.title, cw)[0], x, y + (big ? 6 : 4))
    y += big ? 9 : 6
    doc.setFont('helvetica', 'normal').setFontSize(big ? 10 : 7.5).setTextColor(92, 88, 80)
    const meta: string[] = doc.splitTextToSize(s.meta, cw)
    doc.text(meta, x, y + 3)
    y += meta.length * line + 2

    // Text under the drawing is measured first, so the drawing takes exactly the space that is left.
    const tail: string[][] = [s.note, s.names].filter(Boolean).map(t => doc.splitTextToSize(t!, cw))
    const tailHeight = tail.reduce((h, lines) => h + lines.length * line + 2, 0)
    const canvas = await stageCanvas(s.svg, 1400)
    const scale = Math.min(cw / canvas.width, Math.max(40, top + ch - y - tailHeight) / canvas.height)
    const w = canvas.width * scale
    const h = canvas.height * scale
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', x + (cw - w) / 2, y, w, h)
    y += h + 3

    doc.setTextColor(23, 23, 26)
    for (const lines of tail) {
      doc.text(lines, x, y + 3)
      y += lines.length * line + 2
    }
  }
  doc.save(`${name}.pdf`)
}
