import type { DeckSpec, KpiSpec, SlideSpec, Tone } from '../src/index'

export type Kind = 'kpis' | 'chart' | 'stacked' | 'table' | 'actions' | 'text'

export const KINDS: { id: Kind; label: string; noun: string }[] = [
  { id: 'kpis', label: 'Figures', noun: 'Key figures' },
  { id: 'chart', label: 'Bars', noun: 'Bar chart' },
  { id: 'stacked', label: 'Stacked', noun: 'Stacked bars' },
  { id: 'table', label: 'Table', noun: 'Table' },
  { id: 'actions', label: 'Steps', noun: 'Next steps' },
  { id: 'text', label: 'Text', noun: 'Text' },
]

export type Kpi = { label: string; value: string; change: string; better: 'up' | 'down'; trend: string; hint: string }
export type Point = { label: string; value: string }
export type Stack = { name: string; done: string; running: string; waiting: string; failed: string }
export type Action = { text: string; why: string; priority: 'high' | 'medium' }
export type Bullet = { text: string; tone: Tone }

/** A slide as the editor holds it: every kind of evidence keeps its rows, so switching kind loses nothing. */
export type Slide = {
  id: string
  kind: Kind
  title: string
  notes: string
  bullets: Bullet[]
  kpis: Kpi[]
  points: Point[]
  format: 'count' | 'money'
  stacks: Stack[]
  columns: string[]
  rows: string[][]
  actions: Action[]
}

export type Deck = {
  title: string
  subtitle: string
  period: string
  footer: string
  brand: string
  slides: Slide[]
}

let counter = 0
export const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`

export function blankSlide(kind: Kind = 'text'): Slide {
  const base: Slide = {
    id: newId(), kind, title: '', notes: '', bullets: [], kpis: [], points: [], format: 'count', stacks: [], columns: [], rows: [], actions: [],
  }
  if (kind === 'kpis') base.kpis = [{ label: '', value: '', change: '', better: 'up', trend: '', hint: '' }]
  if (kind === 'chart') base.points = [{ label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' }]
  if (kind === 'stacked') base.stacks = [{ name: '', done: '', running: '', waiting: '', failed: '' }]
  if (kind === 'table') { base.columns = ['', '']; base.rows = [['', '']] }
  if (kind === 'actions') base.actions = [{ text: '', why: '', priority: 'medium' }]
  return base
}

const num = (s: string) => {
  const n = Number(s.replace(/[,£$\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function slideToSpec(s: Slide): SlideSpec {
  const out: SlideSpec = { title: s.title.trim() || 'Untitled slide' }
  const bullets = s.bullets.filter((b) => b.text.trim())
  if (bullets.length) {
    out.bullets = bullets.map((b) => b.text.trim())
    if (bullets.some((b) => b.tone !== 'note')) out.tones = bullets.map((b) => b.tone)
  }
  if (s.notes.trim()) out.notes = s.notes.trim()
  if (s.kind === 'kpis') {
    const kpis = s.kpis.filter((k) => k.label.trim() || k.value.trim())
    if (kpis.length) {
      out.kpis = kpis.map((k): KpiSpec => {
        const trend = k.trend.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite)
        return {
          label: k.label.trim(),
          value: k.value.trim(),
          ...(k.change.trim() ? { change: k.change.trim(), better: k.better } : {}),
          ...(k.hint.trim() ? { hint: k.hint.trim() } : {}),
          ...(trend.length >= 3 ? { trend } : {}),
        }
      })
    }
  } else if (s.kind === 'chart') {
    const points = s.points.filter((p) => p.label.trim())
    if (points.length) out.chart = { format: s.format, points: points.map((p) => ({ label: p.label.trim(), value: num(p.value) })) }
  } else if (s.kind === 'stacked') {
    const rows = s.stacks.filter((r) => r.name.trim())
    if (rows.length) out.stacked = rows.map((r) => ({ name: r.name.trim(), done: num(r.done), running: num(r.running), waiting: num(r.waiting), failed: num(r.failed) }))
  } else if (s.kind === 'table') {
    const columns = s.columns.map((c) => c.trim())
    if (columns.some(Boolean)) out.table = { columns, rows: s.rows.filter((r) => r.some((c) => c.trim())).map((r) => columns.map((_, i) => (r[i] ?? '').trim())) }
  } else if (s.kind === 'actions') {
    const actions = s.actions.filter((a) => a.text.trim())
    if (actions.length) out.actions = actions.map((a) => ({ text: a.text.trim(), ...(a.why.trim() ? { why: a.why.trim() } : {}), priority: a.priority }))
  }
  return out
}

export function deckToSpec(d: Deck): DeckSpec {
  return {
    title: d.title.trim() || 'Untitled deck',
    ...(d.subtitle.trim() ? { subtitle: d.subtitle.trim() } : {}),
    ...(d.period.trim() ? { period: d.period.trim() } : {}),
    ...(d.footer.trim() ? { footer: d.footer.trim() } : {}),
    slides: d.slides.map(slideToSpec),
  }
}

export function specToDeck(spec: DeckSpec, brand = ''): Deck {
  return {
    title: spec.title ?? '',
    subtitle: spec.subtitle ?? '',
    period: spec.period ?? '',
    footer: spec.footer ?? '',
    brand,
    slides: (spec.slides ?? []).map((s): Slide => {
      const kind: Kind = s.kpis?.length ? 'kpis' : s.chart ? 'chart' : s.stacked?.length ? 'stacked' : s.table ? 'table' : s.actions?.length ? 'actions' : 'text'
      const b = blankSlide(kind)
      b.title = s.title ?? ''
      b.notes = s.notes ?? ''
      b.bullets = (s.bullets ?? []).map((text, i) => ({ text, tone: s.tones?.[i] ?? 'note' }))
      if (s.kpis) b.kpis = s.kpis.map((k) => ({ label: k.label, value: k.value, change: k.change ?? '', better: k.better ?? 'up', trend: (k.trend ?? []).join(', '), hint: k.hint ?? '' }))
      if (s.chart) { b.points = s.chart.points.map((p) => ({ label: p.label, value: String(p.value) })); b.format = s.chart.format ?? 'count' }
      if (s.stacked) b.stacks = s.stacked.map((r) => ({ name: r.name, done: String(r.done), running: String(r.running ?? 0), waiting: String(r.waiting ?? 0), failed: String(r.failed ?? 0) }))
      if (s.table) { b.columns = [...s.table.columns]; b.rows = s.table.rows.map((r) => [...r]) }
      if (s.actions) b.actions = s.actions.map((a) => ({ text: a.text, why: a.why ?? '', priority: a.priority ?? 'medium' }))
      return b
    }),
  }
}

/** Parses pasted JSON into a spec, or says what is wrong with it in plain words. */
export function parseSpec(text: string): { spec: DeckSpec } | { error: string } {
  let data: unknown
  try { data = JSON.parse(text) } catch (e) { return { error: `That is not valid JSON: ${(e as Error).message}` } }
  if (!data || typeof data !== 'object') return { error: 'The deck needs to be a JSON object.' }
  const d = data as Partial<DeckSpec>
  if (typeof d.title !== 'string') return { error: 'The deck needs a "title".' }
  if (!Array.isArray(d.slides)) return { error: 'The deck needs a "slides" list.' }
  const bad = d.slides.findIndex((s) => !s || typeof s !== 'object' || typeof (s as { title?: unknown }).title !== 'string')
  if (bad >= 0) return { error: `Slide ${bad + 1} needs a "title".` }
  return { spec: d as DeckSpec }
}
