/**
 * Writes a deck to out/.
 *
 *   npm run sample                      the quarterly example (examples/quarterly.json)
 *   npm run sample -- my-deck.json      your own DeckSpec
 *   npm run sample -- report-rich       the example report-model adapter
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDeckFromSpec } from '../src/index'
import { buildReportPptx, richModel, sampleModel } from '../src/adapters/report'

const arg = process.argv[2] ?? 'examples/quarterly.json'
const brand = process.env.BRAND
let bytes: ArrayBuffer
let name: string
if (arg === 'report' || arg === 'report-rich') {
  bytes = await buildReportPptx(arg === 'report' ? sampleModel() : richModel(), { brand })
  name = arg
} else {
  bytes = await buildDeckFromSpec(JSON.parse(readFileSync(resolve(arg), 'utf8')), { brand })
  name = resolve(arg).split('/').pop()!.replace(/\.json$/, '')
}
mkdirSync('out', { recursive: true })
writeFileSync(`out/${name}.pptx`, Buffer.from(bytes))
console.log(`wrote out/${name}.pptx`)
