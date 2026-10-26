/** Writes a sample deck: `npm run sample` (plain), `npm run sample -- rich`, or `-- path/to/model.json`. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReportPptx, richModel, sampleModel } from '../src/index'

const arg = process.argv[2] ?? 'plain'
const model = arg === 'plain' ? sampleModel() : arg === 'rich' ? richModel() : JSON.parse(readFileSync(resolve(arg), 'utf8'))
mkdirSync('out', { recursive: true })
const file = `out/${arg === 'plain' || arg === 'rich' ? arg : 'report'}.pptx`
writeFileSync(file, Buffer.from(await buildReportPptx(model, { brand: process.env.BRAND })))
console.log(`wrote ${file}`)
