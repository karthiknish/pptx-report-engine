/**
 * Slide frames — one plan shared by the in-desk Deck preview and the PPTX.
 *
 * The strategy is an owner's deck, not a dump of the model:
 *
 *   cover → At a glance (headline + big figures) → Finished by day (chart)
 *   → Cost vs cap (chart) → Where work sits (stacked bars per step)
 *   → Overdue (its own slide, never buried) → Needs you → Connected systems
 *   → What to do next → appendix (how we counted, data sources) → close
 *
 * Every content slide carries one takeaway sentence (the narrative) and one
 * kind of evidence: figures, a chart, or a short table. Sections that would
 * be empty are skipped, so a quiet week is a short deck, not a hollow one.
 * The narrative also travels as speaker notes in the PPTX.
 */
import { reportSummaryLine } from './types'
import { reportProvenanceLine, reportRangeLabel } from './types'
import type { ReportDayPoint, ReportFigure, ReportModel, ReportStepMix, Recommendation } from './types'
import { usd } from './format'

/** How many table rows fit on a slide before it stops being readable. */
export const MAX_TABLE_ROWS = 9
/** Steps on the stacked-bar slide; the rest fold into "and N more". */
const MAX_STEP_BARS = 8

export type SlideFigure = Pick<ReportFigure, 'label' | 'value' | 'hint' | 'delta'> & {
  /** Whether the move since last period is good news, bad news or neither. */
  sentiment?: 'good' | 'bad' | 'note'
  /** The last few days of this figure, drawn as a sparkline. */
  spark?: number[]
}

/** Measures where a lower number is the better one. A rise in these is bad news. */
const LOWER_IS_BETTER = /cost|spend|overdue|stuck|failed|wait|late|open/i

function sentimentOf(title: string, delta: ReportFigure['delta']): SlideFigure['sentiment'] {
  if (!delta || delta.tone === 'neutral') return undefined
  return (delta.tone === 'up') !== LOWER_IS_BETTER.test(title) ? 'good' : 'bad'
}

export type SlideChart =
  | { kind: 'bars'; points: ReportDayPoint[]; format: 'count' | 'usd'; limit?: { capUsd: number; usedUsd: number } | null }
  | { kind: 'stacked'; steps: ReportStepMix[]; more: number }

type Base = {
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
  | { kind: 'cover'; title: string; subtitle: string; range: string; provenance: string }
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
      items: { severity: Recommendation['severity']; text: string; basis: string }[]
    })
  | { kind: 'closing'; provenance: string }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function reportSlides(model: ReportModel): SlideFrame[] {
  const provenance = reportProvenanceLine(model)
  const by = new Map(model.sections.map((s) => [s.id, s]))
  const series = model.series
  // A figure that has a day-by-day series behind it gets a sparkline.
  const spark = (label: string): number[] | undefined => {
    const days = /^finished$/i.test(label) ? series?.finishedByDay : /^cost$/i.test(label) ? series?.costByDay : undefined
    return days && days.length >= 3 ? days.map((d) => d.value) : undefined
  }
  const figs = (f: ReportFigure[] | undefined): SlideFigure[] =>
    // The short title ("Finished"), not the export label ("Finished · whole desk · last 7 days"),
    // which was cut off at every figure's edge; the scope and period are in the header.
    (f ?? []).map((x) => {
      const label = x.title ?? x.label
      const sentiment = sentimentOf(label, x.delta)
      return {
        label,
        value: x.value,
        ...(x.hint ? { hint: x.hint } : {}),
        ...(x.delta ? { delta: x.delta } : {}),
        ...(sentiment ? { sentiment } : {}),
        ...(spark(label) ? { spark: spark(label) } : {}),
      }
    })
  const frames: SlideFrame[] = [
    {
      kind: 'cover',
      title: model.title,
      // The one-line state of the desk, not the brand tagline.
      subtitle: reportSummaryLine(model),
      range: `${model.industryLabel} · ${reportRangeLabel(model.range.from, model.range.to)}`,
      provenance,
    },
  ]
  let n = 0
  const base = (title: string, takeaway: string | null | undefined, bullets: string[] = []): Base => {
    n += 1
    const line = takeaway?.trim() || title
    const clean = bullets.map((b) => b.trim()).filter(Boolean).slice(0, 4)
    return {
      index: n,
      indexLabel: `${pad(n)} ${title}`,
      title,
      takeaway: line,
      notes: [line, ...clean].join('\n'),
      provenance,
      bullets: clean,
    }
  }
  const hl = model.highlights ?? []
  const hlText = (...ids: string[]) => hl.filter((h) => ids.includes(h.id)).map((h) => h.text)
  const figLine = (f: ReportFigure | undefined) => (f?.hint ? `${f.label}: ${f.value}, ${f.hint}.` : f ? `${f.label}: ${f.value}.` : '')

  // 1. At a glance — the one slide people remember.
  const summary = by.get('summary')
  if (summary && (summary.figures.length > 0 || summary.narrative)) {
    frames.push({
      kind: 'figures',
      ...base('At a glance', summary.narrative, hl.map((h) => h.text)),
      bulletTones: hl.slice(0, 4).map((h) => h.tone),
      figures: figs(summary.figures).slice(0, 5),
    })
  }

  // 1b. Efficiency: the business case, each figure with how it was counted.
  if (model.efficiency && model.efficiency.length > 0) {
    const kpis = model.efficiency
    const auto = kpis.find((k) => k.id === 'automation')
    const saved = kpis.find((k) => k.id === 'hours-saved')
    const cost = kpis.find((k) => k.id === 'cost-per-item')
    frames.push({
      kind: 'kpis',
      ...base(
        'Efficiency',
        auto && saved
          ? `Agents finished ${auto.value} of the steps on their own and saved about ${saved.value} of people's time.`
          : 'How much of the work the agents carried.',
        [
          auto ? `${auto.inputs} were done by agents with no person needed.` : '',
          saved ? `About ${saved.value} of work handed back (${saved.inputs}).` : '',
          cost ? `Each step cost ${cost.value} in AI spend (${cost.inputs}).` : '',
        ],
      ),
      kpis: kpis.map((k) => ({ label: k.label, value: k.value, formula: k.formula, inputs: k.inputs, note: k.note, tone: k.tone })),
    })
  }

  // 2. Finished by day — only when something finished.
  const throughput = by.get('throughput')
  const finished = series?.finishedByDay ?? []
  if (throughput && finished.some((d) => d.value > 0)) {
    frames.push({
      kind: 'chart',
      ...base('Finished by day', throughput.narrative, [
        ...hlText('finished'),
        (() => {
          const peak = [...finished].sort((a, b) => b.value - a.value)[0]
          return peak && peak.value > 0 ? `Busiest day was ${peak.label} with ${peak.value} finished.` : ''
        })(),
        figLine(throughput.figures.find((f) => /average/i.test(f.label))),
      ]),
      chart: { kind: 'bars', points: finished, format: 'count' },
      figures: figs(throughput.figures).slice(0, 3),
    })
  } else if (throughput && throughput.figures.length > 0) {
    frames.push({ kind: 'figures', ...base('How work moved', throughput.narrative), figures: figs(throughput.figures).slice(0, 4) })
  }

  // 3. Cost vs cap — a chart when there is spend, figures otherwise.
  const value = by.get('value')
  const cost = series?.costByDay ?? []
  if (value && cost.some((d) => d.value > 0)) {
    frames.push({
      kind: 'chart',
      ...base('Cost vs cap', value.narrative, [
        ...hlText('cost'),
        figLine(value.figures.find((f) => f.label === 'Cap')),
        figLine(value.figures.find((f) => /used/i.test(f.label))),
      ]),
      chart: { kind: 'bars', points: cost, format: 'usd', limit: series?.limit ?? null },
      figures: figs(value.figures).slice(0, 3),
    })
  } else if (value && value.figures.length > 0) {
    frames.push({ kind: 'figures', ...base('Spend vs cap', value.narrative), figures: figs(value.figures).slice(0, 4) })
  }

  // 3b. Models used: who did the work, what it cost, how reliably. Only when calls were recorded.
  const used = (model.models ?? []).filter((m) => m.runs > 0)
  if (used.length > 0) {
    const totalSpend = used.reduce((n, m) => n + m.spendUsd, 0)
    const totalRuns = used.reduce((n, m) => n + m.runs, 0)
    const okRuns = used.reduce((n, m) => n + (m.runs * m.successPct) / 100, 0)
    const lead = used[0]!
    const share = totalSpend > 0 ? Math.round((lead.spendUsd / totalSpend) * 100) : null
    const perCall = (m: (typeof used)[number]) => (m.runs > 0 ? m.spendUsd / m.runs : 0)
    const dearest = [...used].sort((a, b) => perCall(b) - perCall(a))[0]!
    const weakest = [...used].sort((a, b) => a.successPct - b.successPct)[0]!
    const tok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
    const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`)
    const spendBars = used.filter((m) => m.spendUsd > 0).slice(0, 8)
    frames.push({
      kind: 'chart',
      ...base(
        'Models used',
        used.length === 1
          ? `One model did all ${totalRuns} calls.`
          : share != null && totalSpend > 0
            ? `${lead.name} took ${share}% of the spend across ${used.length} models.`
            : `${used.length} models handled ${totalRuns} calls.`,
        [
          `${totalRuns} calls across ${used.length} model${used.length === 1 ? '' : 's'}${totalSpend > 0 ? `, ${usd(totalSpend)} in all` : ''}.`,
          used.length > 1 ? `${dearest.name} cost most per call at ${usd(perCall(dearest))}.` : '',
          used.length > 1 && weakest.successPct < 100 ? `${weakest.name} succeeded ${weakest.successPct}% of the time, the lowest.` : '',
        ],
      ),
      chart: { kind: 'bars', points: spendBars.map((m) => ({ label: m.name, value: Math.round(m.spendUsd * 100) / 100 })), format: 'usd', limit: null },
      figures: [
        { label: 'Calls', value: totalRuns.toLocaleString('en') },
        { label: 'Succeeded', value: `${Math.round((okRuns / totalRuns) * 100)}%` },
        ...(totalSpend > 0 ? [{ label: 'Model spend', value: usd(totalSpend) }] : []),
      ],
    })
    frames.push({
      kind: 'table',
      ...base('Models used: detail', `Calls, tokens and speed for each model.`),
      columns: ['Model', 'Calls', 'Spend', 'Tokens', 'Success', 'Median', 'Per call'],
      rows: used.slice(0, MAX_TABLE_ROWS).map((m) => [m.name, String(m.runs), usd(m.spendUsd), `${tok(m.tokensIn)} / ${tok(m.tokensOut)}`, `${m.successPct}%`, ms(m.p50Ms), usd(perCall(m))]),
      allRows: used.map((m) => [m.name, String(m.runs), usd(m.spendUsd), `${tok(m.tokensIn)} / ${tok(m.tokensOut)}`, `${m.successPct}%`, ms(m.p50Ms), usd(perCall(m))]),
      more: Math.max(0, used.length - MAX_TABLE_ROWS),
      figures: [],
    })
  }

  // 3c. What went well and what needs attention: the same facts as the headline claims, sorted by how they read.
  {
    const said = (r: { label: string; now: string; prior: string; change: string }) =>
      `${r.label} ${r.change.replace('▲', 'up').replace('▼', 'down')} (${r.now}, was ${r.prior})`
    const compare = model.compare ?? []
    const well = [...hl.filter((h) => h.tone === 'good').map((h) => h.text), ...compare.filter((r) => r.tone === 'good').map(said)]
    const attention = [...hl.filter((h) => h.tone === 'bad').map((h) => h.text), ...compare.filter((r) => r.tone === 'bad').map(said)]
    const know = hl.filter((h) => h.tone === 'note').map((h) => h.text)
    const columns = [
      { name: 'Went well', items: well },
      { name: 'Needs attention', items: attention },
      { name: 'Worth knowing', items: know },
    ].filter((c) => c.items.length > 0)
    if (well.length + attention.length > 0 && well.length + attention.length + know.length >= 3) {
      const depth = Math.min(5, Math.max(...columns.map((c) => c.items.length)))
      frames.push({
        kind: 'table',
        ...base(
          'What went well and what needs attention',
          attention.length === 0
            ? 'Nothing needs attention this period.'
            : well.length === 0
              ? `${attention.length} ${attention.length === 1 ? 'thing needs' : 'things need'} attention and nothing stood out as good news.`
              : `${well.length} ${well.length === 1 ? 'thing' : 'things'} went well and ${attention.length} ${attention.length === 1 ? 'needs' : 'need'} attention.`,
        ),
        columns: columns.map((c) => c.name),
        rows: Array.from({ length: depth }, (_, i) => columns.map((c) => c.items[i] ?? '')),
        more: Math.max(0, Math.max(...columns.map((c) => c.items.length)) - depth),
        figures: [],
      })
    }
  }

  // 4. Where work sits — stacked bars beat a six-column table.
  const status = by.get('status')
  // Open work first (waiting, failed, running), then the busiest: when only
  // eight bars fit, they should be the eight a reader has to act on.
  const steps = (series?.steps ?? [])
    .filter((s) => s.done + s.running + s.waiting + s.failed + s.notStarted > 0)
    .sort((a, b) => b.waiting + b.failed + b.running - (a.waiting + a.failed + a.running) || b.done - a.done)
  if (status && steps.length > 0) {
    frames.push({
      kind: 'chart',
      ...base('Where work sits', status.narrative ?? (steps[0] ? `${steps[0].name} holds the most open work.` : null), [
        ...hlText('waiting-step', 'funnel-drop', 'failed'),
        (() => {
          const busiest = [...steps].sort((a, b) => b.running + b.waiting - (a.running + a.waiting))[0]
          return busiest && busiest.running + busiest.waiting > 0
            ? `${busiest.name} carries the most open work (${busiest.running + busiest.waiting}).`
            : ''
        })(),
      ]),
      chart: { kind: 'stacked', steps: steps.slice(0, MAX_STEP_BARS), more: Math.max(0, steps.length - MAX_STEP_BARS) },
      figures: figs(status.figures).slice(0, 4),
    })
  } else if (status?.table && status.table.rows.length > 0) {
    frames.push({
      kind: 'table',
      ...base('Where work sits', status.narrative),
      columns: status.table.columns,
      rows: status.table.rows.slice(0, MAX_TABLE_ROWS),
      allRows: status.table.rows,
      more: Math.max(0, status.table.rows.length - MAX_TABLE_ROWS),
      figures: [],
    })
  }

  // 5. Overdue — the late rows, with how long things have been open beside them.
  const outcomes = by.get('outcomes')
  if (summary?.table && summary.table.rows.length > 0 && summary.table.columns[0] !== 'Measure' && summary.table.columns[1] === 'Owner') {
    const rows = summary.table.rows
    const oldest = model.overdue?.oldestLabel
    frames.push({
      kind: 'table',
      ...base(
        'Overdue',
        rows.length === 1 ? '1 is past its due date.' : `${rows.length} are past their due date.`,
        [
          ...hlText('overdue'),
          outcomes?.narrative ?? '',
          oldest && model.overdue?.oldestAgeDays != null ? `Start with ${oldest}: ${model.overdue.oldestAgeDays}d late.` : '',
        ],
      ),
      columns: summary.table.columns,
      rows: rows.slice(0, MAX_TABLE_ROWS),
      allRows: rows,
      more: Math.max(0, rows.length - MAX_TABLE_ROWS),
      figures: figs(outcomes?.figures).slice(0, 4),
    })
  } else if (outcomes && outcomes.figures.length > 0) {
    frames.push({
      kind: 'figures',
      ...base("How long they've been open", outcomes.narrative, [outcomes.narrative ?? '']),
      figures: figs(outcomes.figures).slice(0, 4),
    })
  }

  // 6b. Step performance: what each step carried, as bars and as a table.
  if (model.stepPerf && model.stepPerf.length > 0) {
    const busiest = [...model.stepPerf].sort((a, b) => b.ran - a.ran)[0]!
    const holder = [...model.stepPerf].sort((a, b) => b.held - a.held)[0]
    const dearest = [...model.stepPerf].sort((a, b) => b.spendUsd - a.spendUsd)[0]
    const failures = model.stepPerf.reduce((n, r) => n + r.failed, 0)
    const bullets = [
      holder && holder.held > 0 ? `${holder.name} held for a person ${holder.held} time${holder.held === 1 ? '' : 's'}.` : '',
      dearest && dearest.spendUsd > 0 ? `${dearest.name} cost most at ${usd(dearest.spendUsd)}.` : '',
      `${failures} ${failures === 1 ? 'failure' : 'failures'} across ${model.stepPerf.length} steps.`,
    ]
    const ranked = [...model.stepPerf].sort((a, b) => b.ran - a.ran)
    frames.push({
      kind: 'chart',
      ...base('Step performance', `${busiest.name} ran most (${busiest.ran}).`, bullets),
      // Held is work that waited for a person, which the stacked chart already calls "Needs you".
      chart: {
        kind: 'stacked',
        steps: ranked.slice(0, MAX_STEP_BARS).map((r) => ({ name: r.name, done: r.done, running: 0, waiting: r.held, failed: r.failed, notStarted: 0 })),
        more: Math.max(0, ranked.length - MAX_STEP_BARS),
      },
      figures: [],
    })
    frames.push({
      kind: 'table',
      ...base('Step performance: detail', `What each step ran, held, failed and cost.`),
      columns: ['Step', 'Ran', 'Done', 'Held', 'Failed', 'Cost'],
      rows: model.stepPerf
        .slice(0, MAX_TABLE_ROWS)
        .map((r) => [r.name, String(r.ran), String(r.done), String(r.held), String(r.failed), usd(r.spendUsd)]),
      allRows: model.stepPerf.map((r) => [r.name, String(r.ran), String(r.done), String(r.held), String(r.failed), usd(r.spendUsd)]),
      more: Math.max(0, model.stepPerf.length - MAX_TABLE_ROWS),
      figures: [],
    })
  }

  // 6c. Against last period: the same measures, one period earlier.
  if (model.compare && model.compare.length > 0) {
    const said = (r: { label: string; change: string }) =>
      `${r.label} ${r.change.replace('▲', 'up').replace('▼', 'down')}`
    const better = model.compare.filter((r) => r.tone === 'good')
    const worse = model.compare.filter((r) => r.tone === 'bad')
    frames.push({
      kind: 'table',
      ...base(
        'Against last period',
        worse.length === 0
          ? 'Every measure held or got better than the period before.'
          : `${worse.map(said).join(', ')} on the period before.`,
        [
          better.length > 0 ? `Better: ${better.map(said).join(', ')}.` : '',
          worse.length > 0 ? `Watch: ${worse.map(said).join(', ')}.` : '',
          'Each change compares this period with the one just before it.',
        ],
      ),
      columns: ['Measure', 'This period', 'Last period', 'Change'],
      rows: model.compare.map((r) => [r.label, r.now, r.prior, r.change]),
      more: 0,
      figures: [],
    })
  }

  // 7. Needs you — the decisions.
  const waiting = by.get('waiting')
  if (waiting?.table && waiting.table.rows.length > 0) {
    frames.push({
      kind: 'table',
      ...base(
        'Needs you',
        waiting.narrative ?? (waiting.table.rows.length === 1 ? '1 decision is waiting on you.' : `${waiting.table.rows.length} decisions are waiting on you.`),
        [
        ...hlText('waiting-step'),
        (() => {
          const byStep = new Map<string, number>()
          for (const row of waiting.table.rows) byStep.set(row[1] ?? '', (byStep.get(row[1] ?? '') ?? 0) + 1)
          const top = [...byStep.entries()].sort((a, b) => b[1] - a[1])[0]
          return top && byStep.size > 1 ? `${top[0]} accounts for ${top[1]} of them.` : ''
        })(),
        'Approve, send back, or request changes from Tasks.',
      ]),
      columns: waiting.table.columns,
      rows: waiting.table.rows.slice(0, MAX_TABLE_ROWS),
      allRows: waiting.table.rows,
      more: Math.max(0, waiting.table.rows.length - MAX_TABLE_ROWS),
      figures: figs(waiting.figures).slice(0, 2),
    })
  }

  // 8. Connected systems — only when a source is not live.
  const connections = by.get('connections')
  const down = connections?.figures.find((f) => /down/i.test(f.label))
  if (connections?.table && connections.table.rows.length > 0 && down && Number(down.value) > 0) {
    frames.push({
      kind: 'table',
      ...base('Connected systems', connections.narrative),
      columns: connections.table.columns,
      rows: connections.table.rows.slice(0, MAX_TABLE_ROWS),
      allRows: connections.table.rows,
      more: Math.max(0, connections.table.rows.length - MAX_TABLE_ROWS),
      figures: figs(connections.figures).slice(0, 3),
    })
  }

  // 9. What to do next.
  const recs = model.recommendations.slice(0, 5)
  frames.push({
    kind: 'recommendations',
    ...base('What to do next', recs.length === 0 ? 'Nothing crossed a threshold this period.' : recs.length === 1 ? '1 thing to act on or watch.' : `${recs.length} things to act on or watch.`),
    items: recs.map((rec) => ({ severity: rec.severity, text: rec.text, basis: rec.basis })),
  })

  // 9b. Appendix: what the words mean, so a reader who was not in the room reads the figures the same way.
  {
    const terms: [string, string][] = [
      ['Period', `${reportRangeLabel(model.range.from, model.range.to)}, for ${model.industryLabel}. Generated ${new Date(model.generatedAt).toISOString().slice(0, 10)}.`],
      ['Finished', 'A step that was completed in the period, by an agent or by a person.'],
      ['Needs you', 'Work paused until a person approves it, sends it back or asks for changes.'],
      ['Overdue', 'An open item that is past its due date.'],
      ['Failed', 'A step that stopped with an error and has not been retried successfully.'],
      ['Cost', 'What the model calls behind the steps that ran in the period cost, in pounds.'],
      ...(used.length > 0
        ? ([
            ['Calls', 'Each time a step asked an AI model to do work.'],
            ['Success', 'The share of calls that came back without an error.'],
            ['Median time', 'Half of the calls were faster than this, and half were slower.'],
          ] as [string, string][])
        : []),
    ]
    frames.push({
      kind: 'table',
      ...base('Appendix: what the words mean', 'The terms in this report, in plain words.'),
      columns: ['Term', 'What it means'],
      rows: terms.slice(0, MAX_TABLE_ROWS).map(([a, b]) => [a, b]),
      allRows: terms.map(([a, b]) => [a, b]),
      more: Math.max(0, terms.length - MAX_TABLE_ROWS),
      figures: [],
    })
  }

  // 10. Appendix: how the figures were counted and where the data came from, for anyone who wants to check.
  if (model.efficiency && model.efficiency.length > 0) {
    const rows = model.efficiency.map((k) => [k.label, k.formula, k.inputs])
    frames.push({
      kind: 'table',
      ...base('Appendix: how we counted', `Every efficiency figure, with the sum behind it.`),
      columns: ['Measure', 'How it was counted', 'Counted from'],
      rows: rows.slice(0, MAX_TABLE_ROWS),
      allRows: rows,
      more: Math.max(0, rows.length - MAX_TABLE_ROWS),
      figures: [],
    })
  }
  if (connections?.table && connections.table.rows.length > 0) {
    frames.push({
      kind: 'table',
      ...base('Appendix: where the data came from', `The apps and sources this report read from.`),
      columns: connections.table.columns,
      rows: connections.table.rows.slice(0, MAX_TABLE_ROWS),
      allRows: connections.table.rows,
      more: Math.max(0, connections.table.rows.length - MAX_TABLE_ROWS),
      figures: [],
    })
  }

  frames.push({ kind: 'closing', provenance })
  return frames
}
