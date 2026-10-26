import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildDeckFromSpec, deckFrames, type DeckSpec } from './index'
import type { PlacedBox } from './pptx'

const spec = JSON.parse(readFileSync(resolve('examples/quarterly.json'), 'utf8')) as DeckSpec

describe('deck spec', () => {
  it('frames a cover, one slide per spec slide and a close', () => {
    const kinds = deckFrames(spec).map((f) => f.kind)
    expect(kinds).toEqual(['cover', 'figures', 'chart', 'table', 'recommendations', 'closing'])
  })

  it('reads a fall in a lower-is-better measure as good news', () => {
    const f = deckFrames(spec)[1]
    if (f?.kind !== 'figures') throw new Error('expected figures')
    expect(f.figures.map((x) => x.sentiment)).toEqual(['good', 'good', 'bad', 'good'])
  })

  it('builds a deck whose boxes stay on the slide and never overlap', async () => {
    let slides: PlacedBox[][] = []
    const bytes = await buildDeckFromSpec(spec, { brand: 'Northgate', inspect: (s) => { slides = s } })
    expect(slides.length).toBeGreaterThanOrEqual(5)
    for (const boxes of slides) {
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-0.001)
        expect(b.x + b.w).toBeLessThanOrEqual(13.331)
        expect(b.y + b.h).toBeLessThanOrEqual(7.501)
      }
    }
    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file('[Content_Types].xml')).toBeTruthy()
  })

  it('needs a cover', async () => {
    const { buildDeck } = await import('./pptx')
    await expect(buildDeck([])).rejects.toThrow(/cover/)
  })
})

describe('layout check and trace', () => {
  it('finds no problems in the example deck', async () => {
    const { checkLayout } = await import('./check')
    let slides: PlacedBox[][] = []
    await buildDeckFromSpec(spec, { inspect: (s) => { slides = s } })
    expect(checkLayout(slides)).toEqual([])
  })

  it('reports a problem when two boxes collide', async () => {
    const { checkLayout } = await import('./check')
    const a = { x: 1, y: 1, w: 2, h: 1, what: 'a' }
    expect(checkLayout([[a, { ...a, what: 'b', x: 2 }]]).map((p) => p.message)).toEqual(['a meets b'])
  })

  it('traces the drawing calls of every slide, background first', async () => {
    let ops: import('./pptx').DrawOp[][] = []
    let boxes: PlacedBox[][] = []
    await buildDeckFromSpec(spec, { trace: (o) => { ops = o }, inspect: (b) => { boxes = b } })
    expect(ops.length).toBe(boxes.length)
    expect(ops[0]![0]!.op).toBe('background')
    expect(ops.some((s) => s.some((o) => o.op === 'chart'))).toBe(true)
    expect(ops.some((s) => s.some((o) => o.op === 'table'))).toBe(true)
  })
})
