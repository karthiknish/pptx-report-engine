import { buildDeck, type BuildOptions } from './pptx'
import { deckFrames, type DeckSpec } from './spec'

export { buildDeck, repairPptxPackage, xmlSafe, RADIUS } from './pptx'
export type { BuildOptions, DrawOp, PlacedBox } from './pptx'
export { checkLayout } from './check'
export type { LayoutProblem } from './check'
export { deckFrames } from './spec'
export type { DeckSpec, SlideSpec, KpiSpec, Tone } from './spec'
export { MAX_TABLE_ROWS } from './frames'
export type { SlideChart, SlideFigure, SlideFrame, ChartPoint, StackedBar } from './frames'

/** A deck from a plain description of it. */
export function buildDeckFromSpec(spec: DeckSpec, options: BuildOptions = {}): Promise<ArrayBuffer> {
  return buildDeck(deckFrames(spec), options)
}
