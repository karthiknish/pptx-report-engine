import type { ReportModel } from './types'

/** A small, valid model for tests that need a whole report. */
export function sampleModel(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    title: 'Claims week',
    industryLabel: 'Claims',
    range: { from: '1 Aug', to: '7 Aug' },
    generatedAt: '2026-08-07T12:00:00Z',
    provenance: 'From Claims in flight',
    sections: [
      {
        id: 'summary',
        title: 'At a glance',
        narrative: 'Queue is calm',
        figures: [{ label: 'Open', value: '8' }],
        table: {
          columns: ['Row', 'Owner', 'Due'],
          rows: Array.from({ length: 12 }, (_, i) => [`CLM-${i + 1}`, 'Sam', `${i}d`]),
        },
      },
      {
        id: 'throughput',
        title: 'How work moved',
        narrative: '12 finished this week.',
        figures: [{ label: 'Finished', value: '12' }],
      },
      {
        id: 'value',
        title: 'Spend vs cap',
        narrative: '£4 this week.',
        figures: [{ label: 'This week', value: '£4.00' }],
      },
      {
        id: 'status',
        title: 'Where work sits',
        narrative: null,
        figures: [],
        table: { columns: ['Step', 'Done'], rows: [['Intake', '3']] },
      },
      {
        id: 'waiting',
        title: 'Needs you',
        narrative: null,
        figures: [],
        table: { columns: ['Claim', 'Step', 'Reason'], rows: [['CLM-1', 'Decide', 'Hold']] },
      },
      {
        id: 'connections',
        title: 'Connected systems',
        narrative: 'All live.',
        figures: [{ label: 'Live', value: '2' }, { label: 'Down', value: '0' }],
        table: { columns: ['Source', 'Status'], rows: [['Claims', 'Live']] },
      },
    ],
    recommendations: [{ id: 'r1', text: 'Clear overdue holds', basis: '3 past due', severity: 'high' }],
    series: {
      finishedByDay: [
        { label: 'Mon', value: 3 },
        { label: 'Tue', value: 9 },
      ],
      costByDay: [
        { label: 'Mon', value: 1 },
        { label: 'Tue', value: 3 },
      ],
      limit: { capUsd: 50, usedUsd: 4 },
      steps: [{ name: 'Intake', done: 3, running: 0, waiting: 1, failed: 0, notStarted: 2 }],
    },
    ...overrides,
  }
}

/** A report with every optional part filled in at realistic lengths, as a busy desk would produce. */
export function richModel(): ReportModel {
  const base = sampleModel()
  return {
    ...base,
    title: 'Claims operations, week of 1 to 7 August',
    sections: base.sections.map((sec) =>
      sec.id === 'summary'
        ? {
            ...sec,
            figures: [
              { label: 'Open', value: '8' },
              { label: 'Finished · Claims · last 7 days', title: 'Finished', value: '112', hint: 'up 14% · prior 98', delta: { text: '▲ 14%', tone: 'up' as const } },
              { label: 'Cost · Claims · last 7 days', title: 'Cost', value: '£60.20', hint: 'down 12% per step · prior £0.61', delta: { text: '▼ 12% per step', tone: 'down' as const } },
              { label: 'Overdue', value: '12', hint: 'up 5 · prior 7', delta: { text: '▲ 5', tone: 'up' as const } },
            ],
          }
        : sec,
    ),
    series: {
      finishedByDay: [11, 14, 9, 18, 21, 24, 15].map((value, i) => ({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]!, value })),
      costByDay: [6.1, 8.2, 7.4, 9.9, 10.3, 11.6, 6.7].map((value, i) => ({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]!, value })),
      limit: { capUsd: 750, usedUsd: 60.2 },
      steps: [
        { name: 'Intake', done: 110, running: 4, waiting: 6, failed: 0, notStarted: 20 },
        { name: 'Check policy', done: 80, running: 6, waiting: 12, failed: 4, notStarted: 18 },
        { name: 'Draft reply', done: 84, running: 2, waiting: 4, failed: 2, notStarted: 28 },
        { name: 'Approve', done: 50, running: 0, waiting: 18, failed: 2, notStarted: 40 },
      ],
    },
    highlights: [
      { id: 'finished', text: '112 claims finished, 14 more than the week before.', tone: 'good', goLabel: 'Tasks' },
      { id: 'overdue', text: '12 are past their due date; the oldest has waited 8 days.', tone: 'bad', goLabel: 'Tasks' },
      { id: 'cost', text: 'AI spend was £60.20, 8% of the monthly cap.', tone: 'note', goLabel: 'Cost' },
      { id: 'waiting-step', text: 'Most decisions waiting on you sit at the Approve step.', tone: 'note', goLabel: 'Tasks' },
    ],
    models: [
      { name: 'Claude Sonnet', vendor: 'Anthropic', runs: 842, spendUsd: 38.4, tokensIn: 2_400_000, tokensOut: 310_000, successPct: 99, p50Ms: 2100 },
      { name: 'GPT-5 mini', vendor: 'OpenAI', runs: 611, spendUsd: 14.1, tokensIn: 1_100_000, tokensOut: 190_000, successPct: 97, p50Ms: 1400 },
      { name: 'Gemini Flash', vendor: 'Google', runs: 420, spendUsd: 5.2, tokensIn: 800_000, tokensOut: 90_000, successPct: 94, p50Ms: 900 },
      { name: 'DeepSeek Chat', vendor: 'DeepSeek', runs: 120, spendUsd: 2.5, tokensIn: 300_000, tokensOut: 40_000, successPct: 91, p50Ms: 3200 },
    ],
    stepPerf: [
      { columnId: 'a', name: 'Intake', ran: 120, done: 110, held: 6, failed: 4, spendUsd: 9.4 },
      { columnId: 'b', name: 'Check policy', ran: 96, done: 80, held: 12, failed: 4, spendUsd: 21.3 },
      { columnId: 'c', name: 'Draft reply', ran: 90, done: 84, held: 4, failed: 2, spendUsd: 18.8 },
      { columnId: 'd', name: 'Approve', ran: 70, done: 50, held: 18, failed: 2, spendUsd: 2.1 },
    ],
    compare: [
      { label: 'Finished', now: '112', prior: '98', change: '▲ 14', tone: 'good' },
      { label: 'Cost per item', now: '£0.54', prior: '£0.61', change: '▼ £0.07', tone: 'good' },
      { label: 'Overdue', now: '12', prior: '7', change: '▲ 5', tone: 'bad' },
    ],
    efficiency: [
      { id: 'automation', label: 'Done without a person', value: '82%', formula: 'steps done by agents / all steps done', inputs: '1,462 of 1,782 steps', note: 'Agents carried most of the work.', tone: 'good' },
      { id: 'hours-saved', label: 'Time handed back', value: '311 hours', formula: 'steps done by agents x 12 minutes', inputs: '1,462 steps at 12 minutes each', note: 'Time people did not spend on routine steps.', tone: 'good' },
      { id: 'cost-per-item', label: 'AI spend per step', value: '£0.0412', formula: 'model spend / steps done', inputs: '£60.20 across 1,462 steps', note: 'What one step cost in model spend.', tone: 'note' },
    ],
  }
}
