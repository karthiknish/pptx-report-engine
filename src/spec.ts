import { MAX_TABLE_ROWS, type SlideFigure, type SlideFrame } from './frames'

/**
 * The simple way in: describe a deck as plain JSON, get a designed one.
 *
 *   { title, subtitle, period, slides: [ { title: 'Revenue grew 12%', kpis: [...], bullets: [...] } ] }
 *
 * A slide's `title` is its takeaway: write it as the sentence you want the reader to leave with.
 * Give each slide one kind of evidence: `kpis`, `chart`, `stacked` or `table`. A slide with only
 * `bullets` or `actions` is a text slide.
 */
export type Tone = 'good' | 'bad' | 'note'

export type KpiSpec = {
  label: string
  value: string
  /** Movement since last time, e.g. "+12%". */
  change?: string
  /** Which way is better. Sets the chip colour. Default `up`. */
  better?: 'up' | 'down'
  /** Direction of the movement; inferred from a leading + or - when omitted. */
  direction?: 'up' | 'down'
  /** Small line under the value. */
  hint?: string
  /** The last few values, drawn as a sparkline. */
  trend?: number[]
}

export type SlideSpec = {
  /** The takeaway sentence; becomes the slide title. */
  title: string
  bullets?: string[]
  /** Tone per bullet, same order. */
  tones?: Tone[]
  kpis?: KpiSpec[]
  chart?: { points: { label: string; value: number }[]; format?: 'count' | 'money'; limit?: { cap: number; used: number } }
  stacked?: { name: string; done: number; running?: number; waiting?: number; failed?: number; notStarted?: number }[]
  table?: { columns: string[]; rows: string[][] }
  /** Recommended next steps, most important first. */
  actions?: { text: string; why?: string; priority?: 'high' | 'medium' }[]
  /** Speaker notes. Defaults to the title and bullets. */
  notes?: string
}

export type DeckSpec = {
  title: string
  subtitle?: string
  /** "Q3 2026", "27 Aug to 2 Sep" - shown on the cover. */
  period?: string
  /** Footer on every slide. */
  footer?: string
  slides: SlideSpec[]
}

const sentiment = (k: KpiSpec): SlideFigure['sentiment'] => {
  if (!k.change) return undefined
  const dir = k.direction ?? (k.change.trim().startsWith('-') || k.change.trim().startsWith('▼') ? 'down' : 'up')
  return (dir === 'up') === ((k.better ?? 'up') === 'up') ? 'good' : 'bad'
}

const figure = (k: KpiSpec): SlideFigure => {
  const dir = k.direction ?? (k.change?.trim().startsWith('-') || k.change?.trim().startsWith('▼') ? 'down' : 'up')
  const s = sentiment(k)
  return {
    label: k.label,
    value: k.value,
    ...(k.hint ? { hint: k.hint } : {}),
    ...(k.change ? { delta: { text: k.change, tone: dir } } : {}),
    ...(s ? { sentiment: s } : {}),
    ...(k.trend && k.trend.length >= 3 ? { spark: k.trend } : {}),
  }
}

export function deckFrames(spec: DeckSpec): SlideFrame[] {
  const provenance = spec.footer?.trim() || ''
  const frames: SlideFrame[] = [{ kind: 'cover', title: spec.title, subtitle: spec.subtitle ?? '', range: spec.period ?? '', provenance }]
  spec.slides.forEach((s, i) => {
    const bullets = (s.bullets ?? []).map((b) => b.trim()).filter(Boolean).slice(0, 4)
    const base = {
      index: i + 1,
      indexLabel: `${String(i + 1).padStart(2, '0')} ${s.title}`,
      title: s.title,
      takeaway: s.title,
      notes: s.notes ?? [s.title, ...bullets].join('\n'),
      provenance,
      bullets,
      ...(s.tones ? { bulletTones: s.tones.slice(0, bullets.length) } : {}),
    }
    if (s.kpis?.length) frames.push({ ...base, kind: 'figures', figures: s.kpis.map(figure) })
    else if (s.chart) frames.push({ ...base, kind: 'chart', chart: { kind: 'bars', points: s.chart.points, format: s.chart.format ?? 'count', limit: s.chart.limit ?? null }, figures: [] })
    else if (s.stacked?.length) {
      const steps = s.stacked.slice(0, 8).map((r) => ({ name: r.name, done: r.done, running: r.running ?? 0, waiting: r.waiting ?? 0, failed: r.failed ?? 0, notStarted: r.notStarted ?? 0 }))
      frames.push({ ...base, kind: 'chart', chart: { kind: 'stacked', steps, more: Math.max(0, s.stacked.length - 8) }, figures: [] })
    } else if (s.table) {
      frames.push({ ...base, kind: 'table', columns: s.table.columns, rows: s.table.rows.slice(0, MAX_TABLE_ROWS), allRows: s.table.rows, more: Math.max(0, s.table.rows.length - MAX_TABLE_ROWS), figures: [] })
    } else if (s.actions?.length) {
      frames.push({ ...base, kind: 'recommendations', items: s.actions.map((a) => ({ severity: a.priority ?? 'medium', text: a.text, basis: a.why ?? '' })) })
    } else if (bullets.length) {
      frames.push({ ...base, kind: 'figures', figures: [] })
    }
  })
  frames.push({ kind: 'closing', provenance })
  return frames
}
