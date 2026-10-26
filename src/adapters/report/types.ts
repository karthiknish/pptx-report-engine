/**
 * Shared report document shape.
 *
 * PDF and PPTX only lay this out. Classic `model.ts` and the web desk both
 * produce this type; neither exporter imports `@/data/tasks`.
 */

export interface ReportFigure {
  /** Full label for exports and history ("Finished · Claims · last 7 days"). */
  label: string
  /** Short on-screen title when the label carries scope/period ("Finished"). */
  title?: string
  value: string
  hint?: string
  delta?: { text: string; tone: 'up' | 'down' | 'neutral' }
  /** One plain sentence behind the tile's info mark (page only). */
  about?: string
  /** Quiet line at the foot of the tile, e.g. how much of the monthly cap is used (page only). */
  foot?: string
}

interface ReportTable {
  columns: string[]
  rows: string[][]
}

export interface ReportSection {
  id: string
  title: string
  narrative: string | null
  figures: ReportFigure[]
  table?: ReportTable
}

export interface Recommendation {
  id: string
  text: string
  basis: string
  severity: 'high' | 'medium'
}

/** A point on a day series; `label` is the axis word ("Thu", "Aug 30"). */
export interface ReportDayPoint {
  label: string
  value: number
}

/** Per-step load for a stacked bar: how many rows sit at each state. */
export interface ReportStepMix {
  name: string
  done: number
  running: number
  waiting: number
  failed: number
  notStarted: number
}

/**
 * Numbers behind the figures, so exporters can draw instead of only tabling.
 * Optional: an archived send from before this field renders without charts.
 */
interface ReportSeries {
  finishedByDay: ReportDayPoint[]
  costByDay: ReportDayPoint[]
  /** Monthly limit and month-to-date use, when a limit is set. */
  limit?: { capUsd: number; usedUsd: number } | null
  steps: ReportStepMix[]
}

export interface ReportModel {
  title: string
  industryLabel: string
  range: { from: string; to: string }
  generatedAt: string
  provenance?: string
  sections: ReportSection[]
  recommendations: Recommendation[]
  /** Month-to-date spend — what the monthly cap is measured against. */
  monthSpendUsd?: number
  /** The prior window in words ("last week", "all of last month"). */
  priorWords?: { than: string; in: string }
  /** Late rows, oldest first — the page names the oldest in Highlights. */
  overdue?: { count: number; oldestLabel?: string; oldestAgeDays?: number }
  /** The facts a reader would circle. Same list on page, PDF and deck. */
  highlights?: { id: string; text: string; tone: 'good' | 'bad' | 'note'; goLabel: string }[]
  /** Per step this period: what ran, what held, what failed, what it cost. */
  stepPerf?: { columnId: string; name: string; ran: number; done: number; held: number; failed: number; spendUsd: number }[]
  /** This period against the last one, measure by measure. */
  compare?: { label: string; now: string; prior: string; change: string; tone: 'good' | 'bad' | 'note' }[]
  /** Efficiency KPIs, each with the formula that produced it. */
  efficiency?: {
    id: string
    label: string
    value: string
    formula: string
    inputs: string
    note: string
    tone: 'good' | 'bad' | 'note'
  }[]
  series?: ReportSeries
  /** The AI models that did the work this period: what each ran, cost and how often it succeeded. */
  models?: ReportModelUse[]
}

/** One AI model's share of the period's work. */
export interface ReportModelUse {
  name: string
  vendor: string
  runs: number
  spendUsd: number
  tokensIn: number
  tokensOut: number
  /** Share of runs that did not error, 0 to 100. */
  successPct: number
  /** Median time of a run, in milliseconds. */
  p50Ms: number
}

export function reportProvenanceLine(model: Pick<ReportModel, 'provenance'>): string {
  return model.provenance?.trim() || 'Confidential'
}

/**
 * Section ids, in the order the report lays them out.
 *
 * These are the builder's own `section.id` values, which is not always the
 * lower-cased title. The Sources section is `connections`. Getting that wrong
 * is silent: the toggle reads as on and the section never appears, because the
 * filter matches on id.
 */
export const REPORT_SECTION_IDS = [
  'summary',
  'value',
  'outcomes',
  'throughput',
  'status',
  'waiting',
  'connections',
] as const

export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number]

/*
 * Order is the argument.
 *
 * The business sections come first because they are what the report is for.
 * Everything from `throughput` down is the desk reporting on itself, which
 * matters to whoever runs the desk and to nobody else in the room.
 */
const REPORT_SECTION_LABEL: Record<ReportSectionId, string> = {
  summary: 'Summary',
  value: 'Value',
  outcomes: 'Outcomes',
  throughput: 'Work done and cost',
  status: 'Step completion',
  waiting: 'Waiting on you',
  connections: 'Sources',
}


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "insurance-claims-weekly-report-all-workflows-2026-09-17-to-2026-09-23.pdf".
 * The old name was the title slug plus a millisecond stamp, which told the
 * person who found it in Downloads nothing about which week it covered.
 */
export function reportFilename(
  report: { title: string; industryLabel?: string; range?: { from: string; to: string } | null },
  extension: string,
): string {
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const day = (iso: string) => /^\d{4}-\d{2}-\d{2}/.exec(iso)?.[0] ?? ''
  const range =
    report.range && day(report.range.from) && day(report.range.to)
      ? day(report.range.from) === day(report.range.to)
        ? day(report.range.from)
        : `${day(report.range.from)}-to-${day(report.range.to)}`
      : ''
  const parts = [report.industryLabel ? slug(report.industryLabel) : '', slug(report.title), range].filter(Boolean)
  return `${parts.join('-') || 'report'}.${extension}`
}

/** The one-line state of the desk ("1 needs you. 35 finished…") for covers. */
export function reportSummaryLine(model: Pick<ReportModel, 'sections' | 'industryLabel'>): string {
  return model.sections.find((s) => s.id === 'summary')?.narrative?.trim() || `${model.industryLabel} report`
}

/**
 * "27 Aug to 2 Sep 2026" from the ISO days the model stores. The model keeps
 * ISO so history can group by covered period; every surface shows this.
 * Desk copy uses "to", never an en-dash or em-dash.
 */
export function reportRangeLabel(from: string, to: string): string {
  const parse = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return m ? { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) } : null
  }
  const a = parse(from)
  const b = parse(to)
  if (!a || !b) return `${from} to ${to}`
  const year = ` ${b.y}`
  if (a.y === b.y && a.mo === b.mo) return `${a.d} to ${b.d} ${MONTHS[b.mo]}${year}`
  if (a.y === b.y) return `${a.d} ${MONTHS[a.mo]} to ${b.d} ${MONTHS[b.mo]}${year}`
  return `${a.d} ${MONTHS[a.mo]} ${a.y} to ${b.d} ${MONTHS[b.mo]} ${b.y}`
}
