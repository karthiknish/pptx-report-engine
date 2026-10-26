import { describe, expect, it } from 'vitest'
import { MAX_TABLE_ROWS, reportSlides } from './slides'
import { richModel, sampleModel } from './sample-model'

describe('reportSlides', () => {
  it('follows the owner deck order and draws charts where there is data', () => {
    const frames = reportSlides(sampleModel())
    expect(frames.map((f) => (f.kind === 'cover' || f.kind === 'closing' ? f.kind : `${f.kind}:${f.title}`))).toEqual([
      'cover',
      'figures:At a glance',
      'chart:Finished by day',
      'chart:Cost vs cap',
      'chart:Where work sits',
      'table:Overdue',
      'table:Needs you',
      'recommendations:What to do next',
      'table:Appendix: what the words mean',
      'table:Appendix: where the data came from',
      'closing',
    ])
  })

  it('skips Connected systems when every source is live, shows it when one is down', () => {
    const down = sampleModel()
    down.sections = down.sections.map((s) =>
      s.id === 'connections' ? { ...s, figures: [{ label: 'Live', value: '1' }, { label: 'Down', value: '1' }] } : s,
    )
    expect(reportSlides(down).some((f) => f.kind === 'table' && f.title === 'Connected systems')).toBe(true)
    expect(reportSlides(sampleModel()).some((f) => f.kind === 'table' && f.title === 'Connected systems')).toBe(false)
  })

  it('falls back to figures and tables when there is no series', () => {
    const frames = reportSlides(sampleModel({ series: undefined }))
    expect(frames.some((f) => f.kind === 'chart')).toBe(false)
    expect(frames.some((f) => f.kind === 'figures' && f.title === 'How work moved')).toBe(true)
    expect(frames.some((f) => f.kind === 'table' && f.title === 'Where work sits')).toBe(true)
  })

  it('matches PPTX cover copy', () => {
    const cover = reportSlides(sampleModel())[0]
    expect(cover?.kind).toBe('cover')
    if (cover?.kind !== 'cover') return
    expect(cover.title).toBe('Claims week')
    expect(cover.subtitle).toBe('Queue is calm')
    expect(cover.range).toBe('Claims · 1 Aug to 7 Aug')
    expect(cover.provenance).toBe('From Claims in flight')
  })

  it('gives Overdue its own slide, capped, with the narrative as speaker notes', () => {
    const overdue = reportSlides(sampleModel()).find((f) => f.kind === 'table' && f.title === 'Overdue')
    expect(overdue?.kind).toBe('table')
    if (overdue?.kind !== 'table') return
    expect(overdue.rows).toHaveLength(MAX_TABLE_ROWS)
    expect(overdue.more).toBe(12 - MAX_TABLE_ROWS)
    expect(overdue.takeaway).toBe('12 are past their due date.')
    expect(overdue.notes).toBe(overdue.takeaway)
  })

  it('numbers slides in order and defaults provenance when missing', () => {
    const frames = reportSlides(sampleModel({ provenance: undefined }))
    const labels = frames.flatMap((f) => ('indexLabel' in f ? [f.indexLabel] : []))
    expect(labels[0]).toBe('01 At a glance')
    expect(labels.at(-1)).toBe(`${String(labels.length).padStart(2, '0')} Appendix: where the data came from`)
    expect(frames.every((f) => ('provenance' in f ? f.provenance === 'Confidential' : true))).toBe(true)
  })

  it('adds models used, step performance and the appendix when the report has them', () => {
    const frames = reportSlides(richModel())
    const titles = frames.flatMap((f) => ('title' in f ? [f.title] : []))
    expect(titles).toEqual(
      expect.arrayContaining(['Models used', 'Models used: detail', 'Step performance', 'Step performance: detail', 'Appendix: how we counted']),
    )
    const models = frames.find((f) => f.kind === 'chart' && f.title === 'Models used')
    expect(models?.kind === 'chart' && models.takeaway).toBe('Claude Sonnet took 64% of the spend across 4 models.')
    const detail = frames.find((f) => f.kind === 'table' && f.title === 'Models used: detail')
    expect(detail?.kind === 'table' && detail.rows[0]).toEqual(['Claude Sonnet', '842', '£38.40', '2.4M / 310k', '99%', '2.1s', '£0.05'])
  })

  it('sorts the headline facts into went well, needs attention and worth knowing', () => {
    const frame = reportSlides(richModel()).find((f) => f.kind === 'table' && f.title === 'What went well and what needs attention')
    expect(frame?.kind).toBe('table')
    if (frame?.kind !== 'table') return
    expect(frame.columns).toEqual(['Went well', 'Needs attention', 'Worth knowing'])
    expect(frame.takeaway).toBe('3 things went well and 2 need attention.')
    expect(frame.rows[0]![0]).toBe('112 claims finished, 14 more than the week before.')
    expect(frame.rows[0]![1]).toBe('12 are past their due date; the oldest has waited 8 days.')
  })

  it('has no went-well slide when the report has no headline facts', () => {
    const titles = reportSlides(sampleModel()).flatMap((f) => ('title' in f ? [f.title] : []))
    expect(titles).not.toContain('What went well and what needs attention')
  })

  it('defines the words the report uses, and the model terms only when models are shown', () => {
    const terms = (m: ReturnType<typeof sampleModel>) => {
      const f = reportSlides(m).find((x) => x.kind === 'table' && x.title === 'Appendix: what the words mean')
      return f?.kind === 'table' ? (f.allRows ?? f.rows).map((r) => r[0]) : []
    }
    expect(terms(sampleModel())).toEqual(['Period', 'Finished', 'Needs you', 'Overdue', 'Failed', 'Cost'])
    expect(terms(richModel())).toEqual(expect.arrayContaining(['Calls', 'Success', 'Median time']))
  })

  it('leaves out models used when no calls were recorded', () => {
    const titles = reportSlides(sampleModel()).flatMap((f) => ('title' in f ? [f.title] : []))
    expect(titles.some((t) => t.startsWith('Models used'))).toBe(false)
  })

  it('carries how each claim reads, so the deck can mark good news and bad', () => {
    const glance = reportSlides(richModel()).find((f) => f.kind === 'figures' && f.title === 'At a glance')
    expect(glance?.kind === 'figures' && glance.bulletTones).toEqual(['good', 'bad', 'note', 'note'])
  })
})
