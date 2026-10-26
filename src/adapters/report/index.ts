import { buildDeck, type BuildOptions } from '../../pptx'
import { reportSlides } from './slides'
import type { ReportModel } from './types'

export { reportSlides } from './slides'
export { reportFilename, reportProvenanceLine, reportRangeLabel, reportSummaryLine } from './types'
export type { ReportModel } from './types'
export { richModel, sampleModel } from './sample-model'

/** An example adapter: a whole operations-report model, laid out as a deck. */
export function buildReportPptx(model: ReportModel, options: BuildOptions = {}): Promise<ArrayBuffer> {
  return buildDeck(reportSlides(model), options)
}
