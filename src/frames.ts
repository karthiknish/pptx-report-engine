/**
 * Slide frames: the neutral description of a deck that the drawing engine reads.
 *
 * A frame is one slide's worth of content (a title sentence, some evidence, a few
 * bullets), with no pptx in it. Build them by hand, from a `DeckSpec` (see spec.ts),
 * or from any data model with an adapter (see adapters/report).
 */

/** A point on a series; `label` is the axis word ("Thu", "Aug 30"). */
export type ChartPoint = { label: string; value: number }

/** One row of a stacked bar: how many items sit in each state. */
export type StackedBar = { name: string; done: number; running: number; waiting: number; failed: number; notStarted: number }

/** How many table rows fit on a slide before it stops being readable. */
export const MAX_TABLE_ROWS = 9
/** Steps on the stacked-bar slide; the rest fold into "and N more". */
const MAX_STEP_BARS = 8

export type SlideFigure = {
  label: string
  value: string
  hint?: string
  /** The move since last period. */
  delta?: { text: string; tone: 'up' | 'down' | 'neutral' }
  /** Whether the move since last period is good news, bad news or neither. */
  sentiment?: 'good' | 'bad' | 'note'
  /** The last few days of this figure, drawn as a sparkline. */
  spark?: number[]
}

export type SlideChart =
  | { kind: 'bars'; points: ChartPoint[]; format: 'count' | 'money'; limit?: { cap: number; used: number } | null }
  | { kind: 'stacked'; steps: StackedBar[]; more: number }

export type Base = {
  index: number
  indexLabel: string
  title: string
  takeaway: string
  notes: string
  provenance: string
  /** Two to four plain sentences that explain the numbers on this slide. */
  bullets: string[]
  /** How each bullet reads, where that is known: good news, bad news, or a plain fact. */
  bulletTones?: ('good' | 'bad' | 'note')[]
}

type SlideKpi = { label: string; value: string; formula: string; inputs: string; note: string; tone: 'good' | 'bad' | 'note' }

export type SlideFrame =
  | { kind: 'cover'; title: string; subtitle: string; range: string; provenance: string; generated?: string }
  | (Base & { kind: 'kpis'; kpis: SlideKpi[] })
  | (Base & { kind: 'figures'; figures: SlideFigure[] })
  | (Base & { kind: 'chart'; chart: SlideChart; figures: SlideFigure[] })
  | (Base & {
      kind: 'table'
      columns: string[]
      /** Capped for a slide. */
      rows: string[][]
      /** Every row, for the PDF, which has room for them. */
      allRows?: string[][]
      more: number
      figures: SlideFigure[]
    })
  | (Base & {
      kind: 'recommendations'
      items: { severity: 'high' | 'medium'; text: string; basis: string }[]
    })
  | { kind: 'closing'; provenance: string }

