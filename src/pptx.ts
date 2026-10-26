import { usd } from './format'
import { BRAND } from './theme'
import { pngSize } from './logo'
import type { SlideChart, SlideFigure, SlideFrame } from './frames'

/**
 * The drawing engine: slide frames in, a .pptx out.
 *
 * It reads {@link SlideFrame}s and computes nothing, so a figure on a slide is
 * exactly the string it was given. A slide takes the first rows of a table and
 * says how many were left.
 *
 * `pptxgenjs` is imported inside the function so a caller who never builds a
 * deck does not load ~500KB of it.
 *
 * ## Layout
 *
 * Widescreen 13.33 x 7.5in. The type does the work: a takeaway title at 32pt,
 * figures at up to 60pt, nothing under 11pt, and five sizes in all. No section
 * index, no rules, no boxes: surfaces are told apart by tone and by space.
 *
 * Nothing is placed by eye. Every text box is sized from an estimate of how
 * many lines its words take, text that would not fit is shortened or dropped
 * (it stays in the speaker notes), and each slide reports the boxes it placed
 * so a test can prove none of them overlap or leave the slide.
 */

const W = 13.33
const H = 7.5
const M = 0.7
const CONTENT_W = W - M * 2
const TOP = 1.85
/** The lowest a body element may end; the footer lives below it. */
const BOTTOM = 6.8
const FOOT_Y = 7.02

/** pptxgenjs wants hex without the leading #. */
const C = {
  deepOcean: BRAND.deepOcean.slice(1),
  paleBlue: BRAND.paleBlue.slice(1),
  mist: BRAND.mist.slice(1),
  warmWhite: BRAND.warmWhite.slice(1),
  amber: BRAND.electricAmber.slice(1),
  graphite: BRAND.graphite.slice(1),
  bg: 'FCFBF9',
  /** The tone a card sits at on the page: a step darker, never a line or a shadow. */
  card: 'F4F0E8',
  amberSoft: 'F8EEDC',
  /** Gold, for the one phrase on the cover that carries the state. */
  gold: 'E7B65C',
  /** Amber as text on a soft ground; the brand amber is too light to read at 14pt. */
  amberText: '8A5A06',
  /** Labels and captions on white. The brand steel blue is too pale for small text. */
  muted: '4A5B6C',
  failed: 'B42318',
} as const

const FONT = 'Calibri'
/** The five sizes in use. */
const PT = { figure: 60, title: 32, body: 18, small: 14, table: 12, foot: 11 } as const

type Pptx = Awaited<typeof import('pptxgenjs')>['default']
type Pres = InstanceType<Pptx>
type Slide = ReturnType<Pres['addSlide']>

/** `back` marks a plate drawn behind other boxes: they may sit inside it, but nothing may straddle its edge. */
export type PlacedBox = { x: number; y: number; w: number; h: number; what: string; back?: boolean }

// --- keeping the XML valid --------------------------------------------------

/**
 * Anything a person typed can reach the deck: a row name, a step name, a note. A control character
 * or a lone surrogate in it is not legal XML, and one of them makes PowerPoint refuse the whole file.
 */
// eslint-disable-next-line no-control-regex -- the point is to match control characters
const NOT_XML = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu
export const xmlSafe = (text: string): string => text.replace(NOT_XML, '')

/** A number a chart can hold: finite, or zero. */
const finite = (n: number): number => (Number.isFinite(n) ? n : 0)

// --- measuring --------------------------------------------------------------

/** Calibri averages about half an em per character; 0.52 errs on the side of more lines. */
const CHAR_EM = 0.52

function lineCount(text: string, pt: number, widthIn: number): number {
  const perLine = Math.max(1, Math.floor((widthIn * 72) / (pt * CHAR_EM)))
  let lines = 0
  for (const para of text.split('\n')) {
    let used = 0
    let n = 1
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const len = word.length
      if (used === 0) used = len
      else if (used + 1 + len <= perLine) used += 1 + len
      else { n += 1; used = len }
      while (used > perLine) { n += 1; used -= perLine }
    }
    lines += n
  }
  return lines
}
const LINE = 1.2
const textHeight = (text: string, pt: number, w: number) => (lineCount(text, pt, w) * pt * LINE) / 72

/** Cut to at most `lines` lines at this size, ending in an ellipsis when something was left out. */
function clip(text: string, pt: number, w: number, lines: number): string {
  if (lineCount(text, pt, w) <= lines) return text
  const words = text.split(/\s+/)
  let out = ''
  for (const word of words) {
    const next = out ? `${out} ${word}` : word
    if (lineCount(`${next}…`, pt, w) > lines) break
    out = next
  }
  return `${out || text.slice(0, 1)}…`
}

/** The largest size from `sizes` at which `text` fits on `lines` lines. */
function fitSize(text: string, w: number, sizes: readonly number[], lines = 1): number {
  return sizes.find((pt) => lineCount(text, pt, w) <= lines) ?? sizes[sizes.length - 1]!
}

// --- placing ----------------------------------------------------------------

const boxes = new WeakMap<Slide, PlacedBox[]>()
function record(slide: Slide, box: PlacedBox) {
  const list = boxes.get(slide) ?? []
  list.push(box)
  boxes.set(slide, list)
}

type TextOpts = { x: number; y: number; w: number; h: number; fontSize: number; color: string; bold?: boolean; align?: 'left' | 'center' | 'right' }
function put(slide: Slide, text: string, o: TextOpts, what: string) {
  record(slide, { x: o.x, y: o.y, w: o.w, h: o.h, what })
  slide.addText(xmlSafe(text), { ...o, fontFace: FONT, valign: 'top', margin: 0, fit: 'none' })
}

/**
 * The one corner radius, in inches. Every rounded shape in the deck takes it from here: cards,
 * chart and table containers, chips, tags and markers. It is an absolute length, so a small chip
 * and a large card curve alike; a shape too small for it is rounded as far as it can go.
 */
export const RADIUS = 0.14

/** A rounded plate behind other boxes. Surfaces are told apart by tone, not by a line or a shadow. */
function plate(pres: Pres, slide: Slide, box: { x: number; y: number; w: number; h: number }, fill: string, what = 'card') {
  record(slide, { ...box, what, back: true })
  slide.addShape(pres.ShapeType.roundRect, { ...box, fill: { color: fill }, line: { type: 'none' }, rectRadius: Math.min(RADIUS, box.w / 2, box.h / 2) })
}

const PAD = 0.24

function stampProvenance(slide: Slide, text: string, color: string, w = CONTENT_W) {
  if (!text) return
  put(slide, clip(text, PT.foot, w, 1), { x: M, y: FOOT_Y, w, h: 0.3, fontSize: PT.foot, color }, 'footer')
}

function placeLogo(slide: Slide, logo: string | null, x: number, y: number, h: number): { w: number } | null {
  if (!logo) return null
  const size = pngSize(logo)
  const w = size ? (size.width / size.height) * h : h * 3.6
  try {
    slide.addImage({ data: logo, x, y, w, h })
    record(slide, { x, y, w, h, what: 'logo' })
    return { w }
  } catch {
    return null
  }
}

// --- slides -----------------------------------------------------------------

function coverSlide(pres: Pres, cover: CoverFrame, logoWhite: string | null, brand: string) {
  const slide = pres.addSlide()
  slide.background = { color: C.deepOcean }

  const logo = placeLogo(slide, logoWhite, M, 0.8, 0.7)
  if (!logo) put(slide, brand, { x: M, y: 0.8, w: CONTENT_W, h: 0.8, fontSize: PT.figure, bold: true, color: C.warmWhite }, 'wordmark')

  const titleW = 10.5
  const titlePt = fitSize(cover.title, titleW, [PT.figure, 48, PT.title], 2)
  const title = clip(cover.title, titlePt, titleW, 2)
  const titleH = textHeight(title, titlePt, titleW)
  put(slide, title, { x: M, y: 2.8, w: titleW, h: titleH, fontSize: titlePt, bold: true, color: C.warmWhite }, 'title')

  // The state of play, in gold.
  const sumY = 2.8 + titleH + 0.3
  const sumW = 10.5
  const summary = clip(cover.subtitle, PT.title, sumW, 2)
  put(slide, summary, { x: M, y: sumY, w: sumW, h: textHeight(summary, PT.title, sumW), fontSize: PT.title, color: C.gold }, 'summary')

  put(slide, clip(cover.range, PT.body, CONTENT_W, 1), { x: M, y: 6.0, w: CONTENT_W, h: 0.35, fontSize: PT.body, color: C.warmWhite }, 'range')
  if (cover.generated) put(slide, `Generated ${cover.generated}`, { x: M, y: 6.4, w: CONTENT_W, h: 0.3, fontSize: PT.small, color: C.paleBlue }, 'generated')
  stampProvenance(slide, cover.provenance, C.paleBlue)
}

type CoverFrame = Extract<SlideFrame, { kind: 'cover' }>

type Ctx = { logoBlue: string | null; page: number; total: number }

/** The takeaway as the title, top left, at most two lines, on warm paper. */
function contentSlide(pres: Pres, title: string, provenance: string, ctx: Ctx): Slide {
  const slide = pres.addSlide()
  slide.background = { color: C.bg }
  const w = CONTENT_W - 1.7
  const pt = fitSize(title, w, [PT.title, 28, 24], 2)
  const text = clip(title, pt, w, 2)
  put(slide, text, { x: M, y: 0.5, w, h: textHeight(text, pt, w), fontSize: pt, bold: true, color: C.deepOcean }, 'title')
  placeLogo(slide, ctx.logoBlue, W - M - 1.05, 0.55, 0.3)
  const counterW = 1.2
  stampProvenance(slide, provenance, C.muted, CONTENT_W - counterW - 0.3)
  put(slide, `${String(ctx.page).padStart(2, '0')} / ${String(ctx.total).padStart(2, '0')}`, { x: W - M - counterW, y: FOOT_Y, w: counterW, h: 0.3, fontSize: PT.foot, color: C.muted, align: 'right' }, 'page')
  return slide
}

const COMPACT = [40, 36, 32, 28] as const
const LARGE = [PT.figure, 48, 40, PT.title] as const

const TONE = {
  good: { accent: '2F7D4F', chipFill: 'E1F0E6', chipText: '1F6B3F' },
  bad: { accent: C.failed, chipFill: 'F8E1DE', chipText: '9B2318' },
  note: { accent: C.deepOcean, chipFill: 'E3E9EF', chipText: C.deepOcean },
} as const

/** What a KPI card holds, measured. Nothing is drawn until the tallest card in the row is known. */
type Kpi = {
  figure: SlideFigure
  /** Extra lines under the figure, in the order they read. */
  extra: { text: string; color: string }[]
}
type KpiLayout = { kpi: Kpi; pt: number; valueH: number; label: string; labelH: number; chip: { text: string; w: number } | null; hint: string; hintH: number; extra: { text: string; h: number; color: string }[]; textW: number; h: number }

const CHIP_H = 0.32
const SPARK_H = 0.5

/** A KPI card reads top to bottom: its name, the number, how it moved, then what to know. */
function layoutKpi(kpi: Kpi, cardW: number, sizes: readonly number[]): KpiLayout {
  const f = kpi.figure
  const spark = Boolean(f.spark && f.spark.length >= 3)
  const textW = cardW - PAD * 2
  const pt = fitSize(f.value, textW, sizes)
  const valueH = (pt * LINE) / 72
  const label = clip(f.label, PT.small, textW, 1)
  const labelH = (PT.small * LINE) / 72
  const chipText = f.delta ? clip(f.delta.text, PT.small, cardW - PAD * 2 - 0.6, 1) : ''
  const chip = chipText ? { text: chipText, w: Math.min(cardW - PAD * 2, (chipText.length * CHAR_EM * PT.small) / 72 + 0.4) } : null
  // The chip already says how it moved; the line under it keeps only what the chip leaves out.
  const rest = chip && f.hint ? f.hint.replace(/^(up|down)[^·]*·\s*/i, '') : f.hint
  const hint = rest ? clip(rest, PT.small, cardW - PAD * 2, 2) : ''
  const hintH = hint ? textHeight(hint, PT.small, cardW - PAD * 2) : 0
  const extra = kpi.extra.map((e) => {
    const text = clip(e.text, PT.small, cardW - PAD * 2, 3)
    return { text, color: e.color, h: textHeight(text, PT.small, cardW - PAD * 2) }
  })
  const h =
    PAD + labelH + 0.04 + valueH + (chip ? 0.1 + CHIP_H : 0) + (hint ? 0.08 + hintH : 0) + extra.reduce((n, e) => n + 0.08 + e.h, 0) + (spark ? 0.12 + SPARK_H : 0) + PAD
  return { kpi, pt, valueH, label, labelH, chip, hint, hintH, extra, textW, h }
}

function drawKpi(pres: Pres, slide: Slide, l: KpiLayout, box: { x: number; y: number; w: number; h: number }) {
  const f = l.kpi.figure
  plate(pres, slide, box, C.card)
  const tone = f.sentiment ? TONE[f.sentiment] : null
  const x = box.x + PAD
  let y = box.y + PAD
  put(slide, l.label, { x, y, w: l.textW, h: l.labelH, fontSize: PT.small, bold: true, color: C.muted }, 'kpi label')
  y += l.labelH + 0.04
  put(slide, f.value, { x, y, w: l.textW, h: l.valueH, fontSize: l.pt, bold: true, color: C.deepOcean }, 'kpi value')
  y += l.valueH
  if (l.chip) {
    y += 0.1
    const t = TONE[f.sentiment ?? 'note']
    plate(pres, slide, { x, y, w: l.chip.w, h: CHIP_H }, t.chipFill, 'chip')
    put(slide, l.chip.text, { x: x + 0.12, y: y + 0.045, w: l.chip.w - 0.24, h: (PT.small * LINE) / 72, fontSize: PT.small, bold: true, color: t.chipText, align: 'center' }, 'chip text')
    y += CHIP_H
  }
  if (l.hint) {
    y += 0.08
    put(slide, l.hint, { x, y, w: box.w - PAD * 2, h: l.hintH, fontSize: PT.small, color: C.muted }, 'kpi hint')
    y += l.hintH
  }
  for (const e of l.extra) {
    y += 0.08
    put(slide, e.text, { x, y, w: box.w - PAD * 2, h: e.h, fontSize: PT.small, color: e.color }, 'kpi note')
    y += e.h
  }
  if (f.spark && f.spark.length >= 3) {
    // The days behind the number, along the foot of the card.
    const sp = { x, y: box.y + box.h - PAD - SPARK_H, w: box.w - PAD * 2, h: SPARK_H }
    record(slide, { ...sp, what: 'sparkline' })
    slide.addChart(pres.ChartType.bar, [{ name: f.label, labels: f.spark.map((_, i) => String(i + 1)), values: f.spark.map(finite) }], {
      ...sp,
      barDir: 'col',
      chartColors: [tone?.accent ?? C.deepOcean],
      catAxisHidden: true,
      valAxisHidden: true,
      valAxisMinVal: 0,
      valAxisMaxVal: Math.max(1, ...f.spark.map(finite)) * 1.05,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      showLegend: false,
      showValue: false,
      barGapWidthPct: 30,
    })
  }
}

/** KPI cards side by side. Returns the bottom. */
function figuresRow(pres: Pres, slide: Slide, figures: SlideFigure[], box: { x: number; y: number; w: number }, maxCols: number, sizes: readonly number[]): number {
  if (figures.length === 0) return box.y
  const n = Math.min(figures.length, maxCols)
  const gap = n > 1 ? 0.2 : 0
  const cardW = (box.w - gap * (n - 1)) / n
  const laid = figures.slice(0, n).map((figure) => layoutKpi({ figure, extra: [] }, cardW, sizes))
  const cardH = Math.max(...laid.map((l) => l.h))
  laid.forEach((l, i) => drawKpi(pres, slide, l, { x: box.x + i * (cardW + gap), y: box.y, w: cardW, h: cardH }))
  return box.y + cardH
}

/** KPI cards stacked in a narrow column, as many as fit above `limit`. Returns the bottom. */
function figuresColumn(pres: Pres, slide: Slide, figures: SlideFigure[], box: { x: number; y: number; w: number }, limit = BOTTOM): number {
  let y = box.y
  for (const figure of figures) {
    const l = layoutKpi({ figure, extra: [] }, box.w, [36, 32, 28, 24])
    if (y + l.h > limit) break
    drawKpi(pres, slide, l, { x: box.x, y, w: box.w, h: l.h })
    y += l.h + 0.2
  }
  return y
}

function tableBlock(
  pres: Pres,
  slide: Slide,
  columns: string[],
  rows: string[][],
  more: number,
  box: { x: number; y: number; w: number },
  limit = BOTTOM,
): number {
  // Columns share the width in proportion to their longest text, so a name column is not squeezed to the width of a number.
  const MIN_COL = 0.9
  const weight = columns.map((c, i) => Math.min(28, Math.max(c.length + 2, ...rows.map((r) => (r[i] ?? '').length))) + 4)
  const totalWeight = weight.reduce((x, y) => x + y, 0)
  const rawW = weight.map((x) => (box.w * x) / totalWeight)
  const spare = rawW.reduce((sum, x) => sum + Math.max(0, x - MIN_COL), 0)
  const deficit = rawW.reduce((sum, x) => sum + Math.max(0, MIN_COL - x), 0)
  const colWs = rawW.map((x) => (x < MIN_COL ? MIN_COL : spare > 0 ? x - ((x - MIN_COL) / spare) * deficit : x))
  // The cell margin is 0.12in a side, so that is all a column loses to padding.
  const cellWs = colWs.map((x) => x - 0.24)
  const margin: [number, number, number, number] = [0.03, 0.12, 0.03, 0.12]
  const sum = (h: number[]) => h.reduce((a, b) => a + b, 0)
  // Larger type when every row fits with it; otherwise the smaller size, and rows that still do not fit are counted.
  const lay = (pt: number, minRow: number) => {
    const cellAt = (value: string, i: number) => clip(value, pt, cellWs[i]!, 2)
    const heightOf = (value: string, i: number) => Math.max(minRow, textHeight(cellAt(value, i), pt, cellWs[i]!) + 0.14)
    const kept = [...rows]
    const heights = () => [minRow, ...kept.map((row) => Math.max(...row.map((v, i) => heightOf(v, i))))]
    while (kept.length > 1 && box.y + sum(heights()) + (rows.length > kept.length || more > 0 ? 0.45 : 0) > limit) kept.pop()
    return { pt, cellAt, kept, rowH: heights() }
  }
  const roomy = lay(PT.small, 0.42)
  // Larger type only when every row and every column title fits in it without being cut.
  const headersFit = (pt: number) => columns.every((c, i) => lineCount(c, pt, cellWs[i]!) <= 1)
  const chosen = roomy.kept.length === rows.length && headersFit(PT.small) ? roomy : lay(PT.table, 0.36)
  const { pt, cellAt, kept } = chosen
  more += rows.length - kept.length
  // Spare height is shared out across the rows, up to a comfortable row, so a short table is not stuck to the top.
  const leftOver = limit - 0.45 - (box.y + sum(chosen.rowH))
  const stretch = leftOver > 0 ? Math.min(0.2, leftOver / chosen.rowH.length) : 0
  const rowH = chosen.rowH.map((h) => h + stretch)
  const total = sum(rowH)
  const headRow = columns.map((c, i) => ({
    text: xmlSafe(clip(c, pt, cellWs[i]!, 1)),
    options: { bold: true, color: C.warmWhite, fontSize: pt, fontFace: FONT, valign: 'middle' as const, margin },
  }))
  const bodyRows = kept.map((row) =>
    row.map((value, ci) => ({
      text: xmlSafe(cellAt(value, ci)),
      options: { color: C.graphite, fontSize: pt, fontFace: FONT, valign: 'middle' as const, margin },
    })),
  )
  // The table is drawn on bands, not on cell fills: a navy header and a tinted band under every other
  // row, each rounded like every other surface. The cells above them have no fill of their own.
  record(slide, { x: box.x, y: box.y, w: box.w, h: total, what: 'table', back: true })
  plate(pres, slide, { x: box.x, y: box.y, w: box.w, h: rowH[0]! }, C.deepOcean, 'table header')
  let bandY = box.y + rowH[0]!
  kept.forEach((_, ri) => {
    const h = rowH[ri + 1]!
    if (ri % 2 === 0) plate(pres, slide, { x: box.x, y: bandY, w: box.w, h }, C.card, 'table band')
    bandY += h
  })
  slide.addTable([headRow, ...bodyRows], {
    x: box.x, y: box.y, w: box.w, colW: colWs, rowH,
    border: { type: 'none' },
    autoPage: false,
  })
  let bottom = box.y + total
  // Says what was cut rather than quietly showing the first rows.
  if (more > 0) {
    bottom += 0.12
    put(slide, `${more} more row${more === 1 ? '' : 's'} in the full report.`, { x: box.x, y: bottom, w: box.w, h: 0.3, fontSize: PT.small, color: C.muted }, 'more rows')
    bottom += 0.3
  }
  return bottom
}

/** A native chart on a card, with its name above it: editable in PowerPoint / Keynote, not a pasted picture. */
function chartBlock(pres: Pres, slide: Slide, chart: SlideChart, caption: string, box: { x: number; y: number; w: number; h: number }) {
  plate(pres, slide, box, C.card)
  const capH = (PT.small * LINE) / 72
  put(slide, clip(caption, PT.small, box.w - PAD * 2, 1), { x: box.x + PAD, y: box.y + 0.16, w: box.w - PAD * 2, h: capH, fontSize: PT.small, bold: true, color: C.deepOcean }, 'chart title')
  const noteH = chart.kind === 'bars' ? (chart.limit ? 0.32 : 0) : chart.more > 0 ? 0.32 : 0
  const top = box.y + 0.16 + capH + 0.08
  const inner = { x: box.x + 0.15, y: top, w: box.w - 0.3, h: box.y + box.h - top - 0.12 - noteH }
  record(slide, { ...inner, what: 'chart' })
  if (chart.kind === 'bars') {
    const moneyAxis = chart.format === 'money'
    slide.addChart(
      pres.ChartType.bar,
      [{ name: moneyAxis ? 'Cost' : 'Finished', labels: chart.points.map((p) => xmlSafe(p.label)), values: chart.points.map((p) => finite(p.value)) }],
      {
        ...inner,
        barDir: 'col',
        chartColors: [C.deepOcean],
        catAxisLabelColor: C.graphite,
        valAxisLabelColor: C.muted,
        catAxisLabelFontSize: PT.table,
        valAxisLabelFontSize: PT.foot,
        valGridLine: { style: 'none' },
        catGridLine: { style: 'none' },
        showValue: true,
        dataLabelColor: C.graphite,
        dataLabelFontSize: PT.table,
        dataLabelFormatCode: moneyAxis ? '"£"#,##0.00' : '0',
        valAxisLabelFormatCode: moneyAxis ? '"£"#,##0' : '0',
        valAxisHidden: true,
        showLegend: false,
        fontFace: FONT,
      },
    )
    if (chart.limit) {
      const pct = chart.limit.cap > 0 ? Math.round((chart.limit.used / chart.limit.cap) * 100) : 0
      put(slide, clip(`Monthly cap ${usd(chart.limit.cap)} · ${usd(chart.limit.used)} used (${pct}%)`, PT.small, inner.w, 1), {
        x: inner.x, y: inner.y + inner.h + 0.04, w: inner.w, h: 0.28, fontSize: PT.small, color: C.muted, align: 'right',
      }, 'chart note')
    }
    return
  }
  const labels = chart.steps.map((s) => xmlSafe(s.name))
  slide.addChart(
    pres.ChartType.bar,
    [
      { name: 'Done', labels, values: chart.steps.map((s) => finite(s.done)) },
      { name: 'In progress', labels, values: chart.steps.map((s) => finite(s.running)) },
      { name: 'Needs you', labels, values: chart.steps.map((s) => finite(s.waiting)) },
      { name: 'Failed', labels, values: chart.steps.map((s) => finite(s.failed)) },
      { name: 'Not started', labels, values: chart.steps.map((s) => finite(s.notStarted)) },
    ],
    {
      ...inner,
      barDir: 'bar',
      barGrouping: 'stacked',
      chartColors: [C.deepOcean, C.paleBlue, C.amber, C.failed, 'DDD8CC'],
      catAxisLabelColor: C.graphite,
      valAxisLabelColor: C.muted,
      catAxisLabelFontSize: PT.table,
      valAxisLabelFontSize: PT.foot,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      showLegend: true,
      legendPos: 'b',
      legendFontSize: PT.table,
      legendColor: C.graphite,
      fontFace: FONT,
    },
  )
  if (chart.more > 0) {
    put(slide, `and ${chart.more} more step${chart.more === 1 ? '' : 's'}`, {
      x: inner.x, y: inner.y + inner.h + 0.04, w: inner.w, h: 0.28, fontSize: PT.small, color: C.muted, align: 'right',
    }, 'chart note')
  }
}

/** Sentences that say what the numbers mean, on a soft amber panel: as many as fit, in the largest type that keeps them all. */
type Insights = { kept: string[]; pt: number; h: number }
function layoutInsights(bullets: string[], w: number, room: number): Insights | null {
  if (bullets.length === 0) return null
  const inner = w - PAD * 2 - 0.3
  const gap = 8 / 72
  const heightOf = (list: string[], pt: number) => list.reduce((sum, b) => sum + textHeight(b, pt, inner) + gap, 0) - gap
  const fit = (pt: number) => {
    const kept = [...bullets]
    while (kept.length > 0 && heightOf(kept, pt) + PAD * 2 > room) kept.pop()
    return { pt, kept }
  }
  const tries = [PT.body, PT.small].map(fit)
  const most = Math.max(...tries.map((t) => t.kept.length))
  const best = tries.find((t) => t.kept.length === most)!
  if (best.kept.length === 0) return null
  return { kept: best.kept, pt: best.pt, h: heightOf(best.kept, best.pt) + PAD * 2 }
}

function drawInsights(pres: Pres, slide: Slide, l: Insights, box: { x: number; y: number; w: number }) {
  plate(pres, slide, { x: box.x, y: box.y, w: box.w, h: l.h }, C.amberSoft, 'insights')
  const text = { x: box.x + PAD, y: box.y + PAD, w: box.w - PAD * 2, h: l.h - PAD * 2 }
  record(slide, { ...text, what: 'insight text' })
  slide.addText(
    l.kept.map((b) => ({ text: xmlSafe(b), options: { bullet: { indent: 14 }, breakLine: true } })),
    { ...text, fontSize: l.pt, color: C.graphite, fontFace: FONT, valign: 'top', margin: 0, paraSpaceAfter: 8, fit: 'none' },
  )
}

/** Recommendations in two columns, each on its own card with an Act or Watch tag and the basis beneath. */
function recommendationsBody(pres: Pres, slide: Slide, items: { severity: 'high' | 'medium'; text: string; basis: string }[]) {
  if (items.length === 0) {
    put(slide, 'No recommendations this period.', { x: M, y: TOP, w: CONTENT_W, h: 0.4, fontSize: PT.body, color: C.muted }, 'empty')
    return
  }
  const gap = 0.25
  const cardW = (CONTENT_W - gap) / 2
  const w = cardW - PAD * 2
  const tagH = 0.34
  const tagW = 0.9
  const laid = items.map((rec) => {
    const text = clip(rec.text, PT.body, w, 3)
    const basis = clip(rec.basis, PT.small, w, 2)
    const textH = textHeight(text, PT.body, w)
    const basisH = textHeight(basis, PT.small, w)
    return { rec, text, basis, textH, basisH, h: PAD + tagH + 0.12 + textH + 0.06 + basisH + PAD }
  })
  let y = TOP
  let shown = 0
  for (let i = 0; i < laid.length; i += 2) {
    const row = laid.slice(i, i + 2)
    const rowH = Math.max(...row.map((r) => r.h))
    const leaveNote = i + 2 < laid.length ? 0.45 : 0
    if (y + rowH > BOTTOM - leaveNote) break
    row.forEach((r, c) => {
      const x = M + c * (cardW + gap)
      plate(pres, slide, { x, y, w: cardW, h: rowH }, C.card)
      const high = r.rec.severity === 'high'
      plate(pres, slide, { x: x + PAD, y: y + PAD, w: tagW, h: tagH }, high ? C.deepOcean : 'DCE4EC', 'tag')
      put(slide, high ? 'Act' : 'Watch', { x: x + PAD + 0.1, y: y + PAD + 0.06, w: tagW - 0.2, h: 0.22, fontSize: PT.small, bold: true, color: high ? C.gold : C.deepOcean, align: 'center' }, 'severity')
      let cy = y + PAD + tagH + 0.12
      put(slide, r.text, { x: x + PAD, y: cy, w, h: r.textH, fontSize: PT.body, color: C.graphite }, 'recommendation')
      cy += r.textH + 0.06
      // The basis travels with the recommendation on the slide too - a reader
      // has to be able to argue with the threshold, not just the conclusion.
      put(slide, r.basis, { x: x + PAD, y: cy, w, h: r.basisH, fontSize: PT.small, color: C.muted }, 'basis')
      shown += 1
    })
    y += rowH + gap
  }
  if (shown < items.length) {
    put(slide, `and ${items.length - shown} more in the speaker notes.`, { x: M, y, w: CONTENT_W, h: 0.3, fontSize: PT.small, color: C.muted }, 'more')
  }
}

// --- the overview: figures and the day charts on one slide -----------------

type Overview = {
  kind: 'overview'
  takeaway: string
  notes: string
  provenance: string
  figures: SlideFigure[]
  charts: { title: string; chart: SlideChart }[]
}
type Pair = {
  kind: 'pair'
  takeaway: string
  notes: string
  provenance: string
  parts: { caption: string; columns: string[]; rows: string[][]; more: number }[]
}
type ChartTable = {
  kind: 'chartTable'
  takeaway: string
  notes: string
  provenance: string
  figures: SlideFigure[]
  bullets: string[]
  title: string
  chart: SlideChart
  columns: string[]
  rows: string[][]
  more: number
}
type Planned = SlideFrame | Overview | Pair | ChartTable

/**
 * Slides that would each leave most of the page empty are combined.
 *
 * - "At a glance" and the day-by-day charts are one picture: the headline figures along the top and the
 *   charts beneath. The efficiency slide, which sits between them in the plan, follows it.
 * - Two short tables with nothing else on them share a slide, one under the other.
 */
function plan(frames: SlideFrame[]): Planned[] {
  const out: Planned[] = []
  const isBars = (f: SlideFrame | undefined): f is Extract<SlideFrame, { kind: 'chart' }> => f?.kind === 'chart' && f.chart.kind === 'bars'
  const isShort = (f: SlideFrame | undefined): f is Extract<SlideFrame, { kind: 'table' }> => f?.kind === 'table' && f.figures.length === 0 && f.rows.length <= 5
  const used = new Set<number>()
  const appendix = (t: string) => t.replace(/^Appendix: /, '')
  for (let i = 0; i < frames.length; i++) {
    if (used.has(i)) continue
    const f = frames[i]!
    if (f.kind === 'figures' && f.title === 'At a glance') {
      const idx: number[] = []
      for (let j = i + 1; j < frames.length && idx.length < 2; j++) {
        if (isBars(frames[j])) idx.push(j)
        else if (frames[j]!.kind !== 'kpis') break
      }
      if (idx.length > 0) {
        const charts = idx.map((j) => frames[j] as Extract<SlideFrame, { kind: 'chart' }>)
        // With claims to make, the summary keeps its own slide and the charts follow; without, they share one.
        const merge = f.bullets.length === 0
        if (!merge) out.push(f)
        out.push({
          kind: 'overview',
          takeaway: merge ? f.takeaway : charts[0]!.takeaway,
          notes: [merge ? f.notes : '', ...charts.map((c) => c.notes)].filter(Boolean).join('\n'),
          provenance: f.provenance,
          figures: merge ? f.figures : [],
          charts: charts.map((c) => ({ title: c.title, chart: c.chart })),
        })
        idx.forEach((j) => used.add(j))
        // Any efficiency slide that sat between them comes right after.
        for (let j = i + 1; j <= idx[idx.length - 1]!; j++) if (frames[j]!.kind === 'kpis') { out.push(frames[j]!); used.add(j) }
        continue
      }
    }
    const next = frames[i + 1]
    // A chart and the table that details it are one slide.
    if (f.kind === 'chart' && next?.kind === 'table' && next.title === `${f.title}: detail`) {
      out.push({
        kind: 'chartTable',
        takeaway: f.takeaway,
        notes: [f.notes, next.notes].join('\n'),
        provenance: f.provenance,
        figures: f.figures,
        bullets: f.bullets,
        title: f.title,
        chart: f.chart,
        columns: next.columns,
        rows: next.rows,
        more: next.more,
      })
      used.add(i + 1)
      continue
    }
    if (isShort(f) && isShort(next) && !used.has(i + 1)) {
      const bothAppendix = f.title.startsWith('Appendix: ') && next.title.startsWith('Appendix: ')
      out.push({
        kind: 'pair',
        takeaway: bothAppendix ? `Appendix: ${appendix(f.title)} and ${appendix(next.title)}` : `${f.title} and ${next.title.charAt(0).toLowerCase()}${next.title.slice(1)}`,
        notes: [f.notes, next.notes].join('\n'),
        provenance: f.provenance,
        parts: [f, next].map((t) => ({ caption: t.takeaway, columns: t.columns, rows: t.rows, more: t.more })),
      })
      used.add(i + 1)
      continue
    }
    out.push(f)
  }
  return out
}

/** The claims on a summary: a coloured marker and a sentence each, on a card, as many as fit above the limit. */
function claims(pres: Pres, slide: Slide, bullets: string[], tones: ('good' | 'bad' | 'note')[] | undefined, y0: number) {
  const marker = { good: '2F7D4F', bad: C.failed, note: C.amber }
  const w = CONTENT_W - PAD * 2 - 0.45
  let y = y0
  let shown = 0
  for (const [i, text] of bullets.entries()) {
    const line = clip(text, PT.body, w, 2)
    const h = textHeight(line, PT.body, w)
    const cardH = h + PAD * 1.0
    if (y + cardH > BOTTOM) break
    plate(pres, slide, { x: M, y, w: CONTENT_W, h: cardH }, C.card)
    plate(pres, slide, { x: M + PAD, y: y + (cardH - 0.16) / 2, w: 0.16, h: 0.16 }, marker[tones?.[i] ?? 'note'], 'marker')
    put(slide, line, { x: M + PAD + 0.45, y: y + PAD * 0.5, w, h, fontSize: PT.body, color: C.graphite }, 'claim')
    y += cardH + 0.1
    shown += 1
  }
  return shown
}

function frameSlide(pres: Pres, frame: Planned, ctx: Ctx) {
  if (frame.kind === 'cover' || frame.kind === 'closing') return
  const slide = contentSlide(pres, frame.takeaway, frame.provenance, ctx)
  slide.addNotes(xmlSafe(frame.notes))

  if (frame.kind === 'overview') {
    const bottom = frame.figures.length > 0 ? figuresRow(pres, slide, frame.figures, { x: M, y: TOP, w: CONTENT_W }, 5, COMPACT) + 0.25 : TOP
    const h = BOTTOM - bottom
    const n = frame.charts.length
    const gap = 0.25
    const w = (CONTENT_W - gap * (n - 1)) / Math.max(n, 1)
    frame.charts.forEach((c, i) => chartBlock(pres, slide, c.chart, c.title, { x: M + i * (w + gap), y: bottom, w, h }))
    return
  }

  if (frame.kind === 'chartTable') {
    const stripBottom = figuresRow(pres, slide, frame.figures, { x: M, y: TOP, w: CONTENT_W }, 4, COMPACT)
    const y = frame.figures.length > 0 ? stripBottom + 0.25 : TOP
    // The reading goes along the foot of the slide; the chart and table take what is left above it.
    // ...but never so tall that the chart and table above it are squeezed below a readable height.
    const fitted = layoutInsights(frame.bullets, CONTENT_W, 1.4)
    const insights = fitted && BOTTOM - fitted.h - 0.25 - y >= 2.7 ? fitted : null
    const lower = insights ? BOTTOM - insights.h - 0.25 : BOTTOM
    const chartW = 4.4
    const gap = 0.3
    chartBlock(pres, slide, frame.chart, frame.title, { x: M, y, w: chartW, h: lower - y })
    tableBlock(pres, slide, frame.columns, frame.rows, frame.more, { x: M + chartW + gap, y, w: CONTENT_W - chartW - gap }, lower)
    if (insights) drawInsights(pres, slide, insights, { x: M, y: BOTTOM - insights.h, w: CONTENT_W })
    return
  }

  if (frame.kind === 'pair') {
    let y = TOP
    for (const part of frame.parts) {
      const caption = clip(part.caption, PT.body, CONTENT_W, 1)
      put(slide, caption, { x: M, y, w: CONTENT_W, h: (PT.body * LINE) / 72, fontSize: PT.body, bold: true, color: C.deepOcean }, 'caption')
      y = tableBlock(pres, slide, part.columns, part.rows, part.more, { x: M, y: y + 0.4, w: CONTENT_W }) + 0.3
    }
    return
  }

  if (frame.kind === 'figures') {
    if (frame.bullets.length > 0) {
      // Answer first: the headline figures, then the claims behind them.
      const bottom = figuresRow(pres, slide, frame.figures, { x: M, y: TOP, w: CONTENT_W }, 5, COMPACT)
      claims(pres, slide, frame.bullets, frame.bulletTones, bottom + 0.2)
      return
    }
    figuresRow(pres, slide, frame.figures, { x: M, y: TOP, w: CONTENT_W }, 4, frame.figures.length <= 2 ? [120, 96, 80, PT.figure] : LARGE)
    return
  }

  if (frame.kind === 'kpis') {
    // Each measure with how it was counted and what it means, as KPI cards.
    const cols = frame.kpis.slice(0, 4)
    const gap = 0.2
    const cardW = (CONTENT_W - gap * (cols.length - 1)) / cols.length
    const laid = cols.map((k) =>
      layoutKpi(
        {
          figure: { label: k.label, value: k.value, hint: k.inputs, sentiment: k.tone },
          extra: [{ text: k.note, color: C.graphite }],
        },
        cardW,
        LARGE,
      ),
    )
    const cardH = Math.max(...laid.map((l) => l.h))
    laid.forEach((l, i) => drawKpi(pres, slide, l, { x: M + i * (cardW + gap), y: TOP, w: cardW, h: cardH }))
    return
  }

  if (frame.kind === 'recommendations') {
    recommendationsBody(pres, slide, frame.items)
    return
  }

  if (frame.kind === 'chart') {
    const COL_W = 3.4
    const gap = 0.3
    const hasSide = frame.figures.length > 0 || frame.bullets.length > 0
    if (hasSide) {
      let y = TOP
      if (frame.figures.length > 0) y = figuresColumn(pres, slide, frame.figures, { x: M, y: TOP, w: COL_W })
      const insights = layoutInsights(frame.bullets, COL_W, BOTTOM - y)
      if (insights) drawInsights(pres, slide, insights, { x: M, y, w: COL_W })
      chartBlock(pres, slide, frame.chart, frame.title, { x: M + COL_W + gap, y: TOP, w: CONTENT_W - COL_W - gap, h: BOTTOM - TOP })
    } else {
      chartBlock(pres, slide, frame.chart, frame.title, { x: M, y: TOP, w: CONTENT_W, h: BOTTOM - TOP })
    }
    return
  }

  // A table, with its figures in a strip above it.
  const stripBottom = figuresRow(pres, slide, frame.figures, { x: M, y: TOP, w: CONTENT_W }, 4, COMPACT)
  const y = frame.figures.length > 0 ? stripBottom + 0.25 : TOP
  // What the table means goes along the foot of the slide; the table takes what is left above it.
  const fitted = layoutInsights(frame.bullets, CONTENT_W, 1.4)
  const insights = fitted && BOTTOM - fitted.h - 0.25 - y >= 2.4 ? fitted : null
  tableBlock(pres, slide, frame.columns, frame.rows, frame.more, { x: M, y, w: CONTENT_W }, insights ? BOTTOM - insights.h - 0.25 : BOTTOM)
  if (insights) drawInsights(pres, slide, insights, { x: M, y: BOTTOM - insights.h, w: CONTENT_W })
}

function closingSlide(pres: Pres, logoWhite: string | null, provenance: string, brand: string) {
  const slide = pres.addSlide()
  slide.background = { color: C.deepOcean }
  if (!logoWhite || !placeLogo(slide, logoWhite, M, 2.6, 0.8)) {
    put(slide, brand, { x: M, y: 2.6, w: CONTENT_W, h: 0.8, fontSize: PT.figure, bold: true, color: C.warmWhite }, 'wordmark')
  }
  put(slide, 'Questions and next steps', { x: M, y: 3.8, w: CONTENT_W, h: 0.6, fontSize: PT.title, color: C.gold }, 'closing line')
  stampProvenance(slide, provenance, C.paleBlue)
}

/**
 * Build the deck and hand back the bytes.
 *
 * Separate from the download for the same reason the PDF is: a .pptx is a zip
 * of XML, and the only honest test of one is to open it.
 *
 * `inspect` receives, per slide, every box that was placed on it, so a test
 * can check that nothing overlaps and nothing leaves the slide.
 */
export type BuildOptions = {
  /** Wordmark on the cover and closing slide when there is no logo, and the file's author. */
  brand?: string
  /** A PNG data URL for dark slides. */
  logoWhite?: string | null
  /** A PNG data URL for light slides. */
  logoBlue?: string | null
  /** Receives every box placed on every slide, in slide order, so a test can check the layout. */
  inspect?: (slides: PlacedBox[][]) => void
  /** Receives every drawing call made on every slide, in slide order: enough to draw a preview of the deck. */
  trace?: (slides: DrawOp[][]) => void
}

/** One call the engine made to draw a slide, as pptxgenjs received it. */
export type DrawOp = { op: 'background' | 'text' | 'shape' | 'chart' | 'table' | 'image'; args: unknown[] }

const TRACED: Record<string, DrawOp['op']> = { addText: 'text', addShape: 'shape', addChart: 'chart', addTable: 'table', addImage: 'image' }

/** Wraps `pres.addSlide` so each slide's drawing calls are kept as they are made. */
function traceSlides(pres: Pres): DrawOp[][] {
  const out: DrawOp[][] = []
  const addSlide = pres.addSlide.bind(pres) as () => Slide
  ;(pres as unknown as { addSlide: () => Slide }).addSlide = () => {
    const slide = addSlide()
    const ops: DrawOp[] = []
    out.push(ops)
    for (const [name, op] of Object.entries(TRACED)) {
      const original = (slide as unknown as Record<string, (...x: unknown[]) => unknown>)[name]!.bind(slide)
      ;(slide as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        // pptxgenjs rewrites the options it is given (inches to EMU), so keep a copy as it was drawn.
        ops.push({ op, args: structuredClone(args) })
        return original(...args)
      }
    }
    return slide
  }
  return out
}

export async function buildDeck(frames: SlideFrame[], options: BuildOptions = {}): Promise<ArrayBuffer> {
  const PptxGenJS = (await import('pptxgenjs')).default

  const cover = frames.find((f): f is CoverFrame => f.kind === 'cover')
  if (!cover) throw new Error('A deck needs a cover frame')
  const body = frames.filter((f) => f.kind !== 'cover' && f.kind !== 'closing')
  const brand = options.brand?.trim() || 'Deck'
  const logoWhite = options.logoWhite ?? null
  const logoBlue = options.logoBlue ?? null

  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_WIDE'
  pres.author = brand
  pres.title = xmlSafe(cover.title)
  const traced = options.trace ? traceSlides(pres) : null

  const planned = plan(body)
  const total = planned.length + 1
  coverSlide(pres, cover, logoWhite, brand)
  planned.forEach((frame, i) => frameSlide(pres, frame, { logoBlue, page: i + 2, total }))
  closingSlide(pres, logoWhite, cover.provenance, brand)

  if (traced) {
    // A background is a property, not a call; read it back once the slide is drawn.
    ;(pres as unknown as { slides: { background?: unknown }[] }).slides.forEach((s, i) => {
      if (s.background) traced[i]?.unshift({ op: 'background', args: [s.background] })
    })
    options.trace?.(traced)
  }
  if (options.inspect) {
    const out: PlacedBox[][] = []
    // pptxgenjs keeps its slides in order; read the boxes back in the same order.
    for (const s of (pres as unknown as { slides: Slide[] }).slides) out.push(boxes.get(s) ?? [])
    options.inspect(out)
  }

  return repairPptxPackage((await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer)
}

/**
 * Fixes what PptxGenJS 4.0.1 gets wrong in the package, so the file opens cleanly in strict readers
 * (PowerPoint for Windows, Keynote, Google Slides) and not only in PowerPoint for Mac.
 * See gitbrent/PptxGenJS#1449.
 *
 * - `[Content_Types].xml` names a slide master once per slide, though the file holds one. Every
 *   Override that names a part the package does not contain is dropped.
 * - The notes master shares the slide master's theme part. PowerPoint gives each its own, so the
 *   notes master gets a copy.
 * - Default extensions nothing uses (gif, mp4, vml and so on) are dropped.
 *
 * Returns the bytes unchanged when there is nothing to fix.
 */
export async function repairPptxPackage(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const typesFile = zip.file('[Content_Types].xml')
  if (!typesFile) return bytes
  const original = await typesFile.async('string')
  let types = original

  // The notes master gets a theme of its own.
  const notesRels = zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels')
  const masterRels = zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels')
  if (notesRels && masterRels) {
    const notesXml = await notesRels.async('string')
    const masterXml = await masterRels.async('string')
    const notesTheme = /Target="\.\.\/theme\/(theme\d+\.xml)"/.exec(notesXml)?.[1]
    const masterTheme = /Target="\.\.\/theme\/(theme\d+\.xml)"/.exec(masterXml)?.[1]
    if (notesTheme && notesTheme === masterTheme) {
      let n = 2
      while (zip.file(`ppt/theme/theme${n}.xml`)) n += 1
      const own = `theme${n}.xml`
      zip.file(`ppt/theme/${own}`, await zip.file(`ppt/theme/${notesTheme}`)!.async('string'))
      zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', notesXml.replace(`../theme/${notesTheme}`, `../theme/${own}`))
      types = types.replace(
        '</Types>',
        `<Override PartName="/ppt/theme/${own}" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`,
      )
    }
  }

  // Overrides for parts that are not there.
  types = types.replace(/<Override\b[^>]*\bPartName="([^"]+)"[^>]*\/>/g, (whole, part: string) =>
    zip.file(part.replace(/^\//, '')) ? whole : '',
  )

  // Default extensions that no part uses.
  const used = new Set<string>(['xml', 'rels'])
  zip.forEach((path, entry) => {
    if (!entry.dir) used.add(path.slice(path.lastIndexOf('.') + 1).toLowerCase())
  })
  types = types.replace(/<Default\b[^>]*\bExtension="([^"]+)"[^>]*\/>/g, (whole, ext: string) => (used.has(ext.toLowerCase()) ? whole : ''))

  if (types === original) return bytes
  zip.file('[Content_Types].xml', types)
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
