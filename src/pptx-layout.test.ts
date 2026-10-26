import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildReportPptx, RADIUS, repairPptxPackage, type PlacedBox } from './pptx'
import { richModel, sampleModel } from './sample-model'
import type { ReportModel } from './types'

const SLIDE_W = 13.33
const SLIDE_H = 7.5

const long = 'The queue held more work than the agents could clear because three approvals were waiting on one person who was away for the week'

/** Every optional part present, with text well past what fits, to find where boxes collide. */
function crowded(): ReportModel {
  const base = sampleModel()
  return {
    ...base,
    title: 'Claims operations weekly report for the whole of the north west region',
    sections: base.sections.map((s) => ({ ...s, narrative: s.narrative ? long : s.narrative })),
    stepPerf: Array.from({ length: 12 }, (_, i) => ({ columnId: `c${i}`, name: `Step number ${i + 1} with a long name`, ran: 40 - i, done: 30 - i, held: i, failed: i % 3, spendUsd: 12.5 * i })),
    compare: [
      { label: 'Finished', now: '112', prior: '98', change: '▲ 14', tone: 'good' },
      { label: 'Cost per item', now: '£4.20', prior: '£3.10', change: '▲ £1.10', tone: 'bad' },
    ],
    efficiency: [
      { id: 'automation', label: 'Done without a person', value: '82%', formula: 'a / b', inputs: '1,462 of 1,782 steps were done by agents with no person needed', note: long, tone: 'good' },
      { id: 'hours-saved', label: 'Time handed back', value: '311 hours', formula: 'a * b', inputs: '1,462 steps at 12 minutes each', note: long, tone: 'good' },
      { id: 'cost-per-item', label: 'AI spend per step', value: '£0.0412', formula: 'a / b', inputs: '£60.20 across 1,462 steps', note: long, tone: 'note' },
    ],
    models: Array.from({ length: 6 }, (_, i) => ({ name: `Model number ${i + 1} with a very long name`, vendor: 'Vendor', runs: 500 - i * 60, spendUsd: 20 - i * 2.5, tokensIn: 2_000_000 - i * 200_000, tokensOut: 300_000, successPct: 99 - i * 3, p50Ms: 1200 + i * 400 })),
    highlights: Array.from({ length: 4 }, (_, i) => ({ id: `h${i}`, text: `${long}, claim ${i + 1}`, tone: 'note' as const, goLabel: 'Tasks' })),
    recommendations: Array.from({ length: 5 }, (_, i) => ({
      id: `rec-${i}`,
      severity: i < 2 ? ('high' as const) : ('medium' as const),
      text: `${long}, item ${i + 1}`,
      basis: `${long}. Threshold ${i + 1} of the desk.`,
    })),
  }
}

async function layout(model: ReportModel): Promise<PlacedBox[][]> {
  let slides: PlacedBox[][] = []
  await buildReportPptx(model, { inspect: (s) => { slides = s } })
  return slides
}

const touches = (a: PlacedBox, b: PlacedBox) =>
  a.x < b.x + b.w - 0.001 && b.x < a.x + a.w - 0.001 && a.y < b.y + b.h - 0.001 && b.y < a.y + a.h - 0.001
const inside = (a: PlacedBox, b: PlacedBox) =>
  a.x >= b.x - 0.001 && a.y >= b.y - 0.001 && a.x + a.w <= b.x + b.w + 0.001 && a.y + a.h <= b.y + b.h + 0.001

/** Two boxes collide when they touch, unless one is a plate and the other sits wholly on it. */
const collide = (a: PlacedBox, b: PlacedBox) => {
  if (!touches(a, b)) return false
  if (a.back && inside(b, a)) return false
  if (b.back && inside(a, b)) return false
  return true
}

describe.each([
  ['a plain report', () => sampleModel()],
  ['a realistic report', richModel],
  ['a crowded report', crowded],
])('deck layout: %s', (_name, make) => {
  it('keeps every box on the slide', async () => {
    const slides = await layout(make())
    expect(slides.length).toBeGreaterThan(2)
    slides.forEach((boxes, si) => {
      for (const b of boxes) {
        expect(b.x, `slide ${si + 1} ${b.what} left`).toBeGreaterThanOrEqual(0)
        expect(b.y, `slide ${si + 1} ${b.what} top`).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w, `slide ${si + 1} ${b.what} right`).toBeLessThanOrEqual(SLIDE_W)
        expect(b.y + b.h, `slide ${si + 1} ${b.what} bottom`).toBeLessThanOrEqual(SLIDE_H - 0.1)
      }
    })
  })

  it('never places two boxes on top of each other', async () => {
    const slides = await layout(make())
    slides.forEach((boxes, si) => {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(collide(boxes[i]!, boxes[j]!), `slide ${si + 1}: ${boxes[i]!.what} meets ${boxes[j]!.what}`).toBe(false)
        }
      }
    })
  })

  it('keeps body content above the footer', async () => {
    const slides = await layout(make())
    slides.forEach((boxes, si) => {
      for (const b of boxes.filter((x) => x.what !== 'footer' && x.what !== 'page')) {
        expect(b.y + b.h, `slide ${si + 1} ${b.what}`).toBeLessThanOrEqual(6.95)
      }
    })
  })
})

/**
 * Writes a plain and a crowded deck to disk so they can be opened and looked at. Skipped unless asked for:
 *
 *   RENDER_DECK_DIR=/tmp/decks npx vitest run src/pptx-layout.test.ts
 */
it.skipIf(!process.env.RENDER_DECK_DIR)('writes sample decks to look at', async () => {
  const dir = process.env.RENDER_DECK_DIR!
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plain.pptx'), Buffer.from(await buildReportPptx(sampleModel())))
  writeFileSync(join(dir, 'rich.pptx'), Buffer.from(await buildReportPptx(richModel())))
  writeFileSync(join(dir, 'crowded.pptx'), Buffer.from(await buildReportPptx(crowded())))
}, 60_000)

/** Is this XML well formed: tags balance, declarations and comments are skipped, nothing is left open. */
function wellFormed(xml: string): string | null {
  const stack: string[] = []
  const tag = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = tag.exec(xml))) {
    if (!m[2]) continue
    if (m[4]) continue
    if (m[1]) {
      const open = stack.pop()
      if (open !== m[2]) return `</${m[2]}> closes ${open ?? 'nothing'}`
    } else stack.push(m[2])
  }
  return stack.length ? `${stack.at(-1)} is never closed` : null
}

const resolveTarget = (from: string, target: string) => {
  const parts = from.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

async function open(model: ReportModel) {
  return JSZip.loadAsync(await buildReportPptx(model))
}

describe('deck shape', () => {
  it('curves every rounded shape by the same length', async () => {
    const zip = await open(richModel())
    const radii: number[] = []
    for (const path of Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))) {
      const xml = await zip.file(path)!.async('string')
      for (const m of xml.matchAll(/<a:ext cx="(\d+)" cy="(\d+)"\/><\/a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val (\d+)"\/>/g)) {
        const [cx, cy, adj] = [Number(m[1]), Number(m[2]), Number(m[3])]
        const inches = (adj / 100000) * (Math.min(cx, cy) / 914400)
        // A shape too small for the radius is rounded as far as it goes, which is half its short side.
        expect(inches).toBeCloseTo(Math.min(RADIUS, Math.min(cx, cy) / 914400 / 2), 2)
        radii.push(inches)
      }
    }
    expect(radii.length).toBeGreaterThan(20)
    expect(Math.max(...radii)).toBeCloseTo(RADIUS, 2)
  })

  it('draws every table on rounded bands: a header, and a band under alternate rows', async () => {
    const slides = await layout(richModel())
    let tables = 0
    for (const [i, boxes] of slides.entries()) {
      for (const table of boxes.filter((b) => b.what === 'table')) {
        tables += 1
        const header = boxes.find((b) => b.what === 'table header' && Math.abs(b.y - table.y) < 0.001 && Math.abs(b.x - table.x) < 0.001)
        expect(header, `slide ${i + 1} header`).toBeTruthy()
        expect(header!.w).toBeCloseTo(table.w, 2)
        const bands = boxes.filter((b) => b.what === 'table band' && b.y >= table.y && b.y + b.h <= table.y + table.h + 0.001)
        expect(bands.length, `slide ${i + 1} bands`).toBeGreaterThan(0)
      }
    }
    expect(tables).toBeGreaterThan(3)
  })
})

describe('deck package', () => {
  it('names only parts the package contains, so strict readers do not offer to repair it', async () => {
    const zip = await open(richModel())
    const types = await zip.file('[Content_Types].xml')!.async('string')
    const parts = [...types.matchAll(/<Override\b[^>]*\bPartName="([^"]+)"/g)].map((m) => m[1]!)
    expect(parts.length).toBeGreaterThan(10)
    expect(parts.filter((p) => !zip.file(p.replace(/^\//, '')))).toEqual([])
    expect(new Set(parts).size).toBe(parts.length)
  })

  it('gives every part a content type', async () => {
    const zip = await open(richModel())
    const types = await zip.file('[Content_Types].xml')!.async('string')
    const overrides = new Set([...types.matchAll(/<Override\b[^>]*\bPartName="([^"]+)"/g)].map((m) => m[1]!))
    const defaults = new Set([...types.matchAll(/<Default\b[^>]*\bExtension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase()))
    const untyped: string[] = []
    zip.forEach((path, entry) => {
      if (entry.dir || path === '[Content_Types].xml') return
      if (!overrides.has(`/${path}`) && !defaults.has(path.slice(path.lastIndexOf('.') + 1).toLowerCase())) untyped.push(path)
    })
    expect(untyped).toEqual([])
  })

  it('drops file types nothing uses', async () => {
    const zip = await open(richModel())
    const types = await zip.file('[Content_Types].xml')!.async('string')
    for (const ext of ['gif', 'mp4', 'm4v', 'svg', 'vml']) expect(types).not.toContain(`Extension="${ext}"`)
  })

  it('points every relationship at a part that exists', async () => {
    const zip = await open(richModel())
    const dangling: string[] = []
    for (const path of Object.keys(zip.files).filter((f) => f.endsWith('.rels'))) {
      const xml = await zip.file(path)!.async('string')
      const source = path.replace('_rels/', '').replace(/\.rels$/, '')
      for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
        if (/TargetMode="External"/.test(m[0])) continue
        const target = /Target="([^"]+)"/.exec(m[0])?.[1]
        if (!target) continue
        const at = target.startsWith('/') ? target.slice(1) : resolveTarget(source, target)
        if (!zip.file(at)) dangling.push(`${path} -> ${at}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('gives the notes master a theme of its own', async () => {
    const zip = await open(richModel())
    const target = (xml: string) => /Target="\.\.\/theme\/([^"]+)"/.exec(xml)?.[1]
    const notes = target(await zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels')!.async('string'))
    const master = target(await zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels')!.async('string'))
    expect(notes).toBeTruthy()
    expect(notes).not.toBe(master)
  })

  it('writes well-formed XML in every part', async () => {
    const zip = await open(richModel())
    const bad: string[] = []
    for (const path of Object.keys(zip.files).filter((f) => /\.(xml|rels)$/.test(f))) {
      const problem = wellFormed(await zip.file(path)!.async('string'))
      if (problem) bad.push(`${path}: ${problem}`)
    }
    expect(bad).toEqual([])
  })

  it('survives text no XML can hold: control characters, lone surrogates, emoji', async () => {
    const hostile = 'Intake\u0000 \u0008step \uD800 ok \u{1F600}'
    const model = richModel()
    model.title = hostile
    model.models = model.models!.map((m, i) => (i === 0 ? { ...m, name: hostile } : m))
    model.stepPerf = model.stepPerf!.map((s, i) => (i === 0 ? { ...s, name: hostile } : s))
    model.highlights = model.highlights!.map((h, i) => (i === 0 ? { ...h, text: hostile } : h))
    model.recommendations = [{ id: 'x', severity: 'high', text: hostile, basis: hostile }]
    const zip = await open(model)
    // eslint-disable-next-line no-control-regex -- checking for exactly these characters
    const illegal = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/
    const bad: string[] = []
    for (const path of Object.keys(zip.files).filter((f) => /\.(xml|rels)$/.test(f))) {
      const xml = await zip.file(path)!.async('string')
      // Surrogate pairs (the emoji) are legal; only a lone half is not.
      const lone = xml.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
      if (illegal.test(lone)) bad.push(path)
      const problem = wellFormed(xml)
      if (problem) bad.push(`${path}: ${problem}`)
    }
    expect(bad).toEqual([])
  })

  it('keeps charts finite when the numbers behind them are not', async () => {
    const model = richModel()
    model.series = {
      ...model.series!,
      finishedByDay: model.series!.finishedByDay.map((d, i) => (i === 1 ? { ...d, value: Number.NaN } : d)),
      costByDay: model.series!.costByDay.map((d, i) => (i === 2 ? { ...d, value: Number.POSITIVE_INFINITY } : d)),
    }
    const zip = await open(model)
    const charts = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))
    expect(charts.length).toBeGreaterThan(0)
    for (const path of charts) {
      const xml = await zip.file(path)!.async('string')
      expect(xml, path).not.toMatch(/NaN|Infinity/)
    }
  })

  it('leaves a clean package unchanged when it is repaired again', async () => {
    const once = await buildReportPptx(richModel())
    const twice = await repairPptxPackage(once)
    expect(twice).toBe(once)
  })
})

/**
 * A second, independent reader. LibreOffice opens the deck the way a user's machine would, and the
 * PDF it writes must have one page per slide. Skipped unless asked for, and skipped when LibreOffice
 * is not installed or does not run:
 *
 *   CHECK_SOFFICE=1 npx vitest run src/pptx-layout.test.ts
 */
function sofficeRuns(): boolean {
  if (!process.env.CHECK_SOFFICE) return false
  try {
    execFileSync('soffice', ['--version'], { stdio: 'pipe', timeout: 20_000 })
    return true
  } catch {
    return false
  }
}

it.skipIf(!sofficeRuns())('opens in LibreOffice with one page per slide', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-check-'))
  const file = join(dir, 'deck.pptx')
  writeFileSync(file, Buffer.from(await buildReportPptx(richModel())))
  const slides = (await layout(richModel())).length
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, file], { stdio: 'pipe', timeout: 120_000 })
  const pdf = join(dir, 'deck.pdf')
  expect(existsSync(pdf)).toBe(true)
  const pages = (readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  expect(pages).toBe(slides)
}, 150_000)
