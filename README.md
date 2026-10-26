# pptx-report-engine

Turns a structured report model into a designed PowerPoint deck, and checks the layout before it ships.

```ts
import { buildReportPptx, sampleModel } from './src'

const bytes = await buildReportPptx(sampleModel(), { brand: 'Acme', logoWhite, logoBlue })
```

`npm run sample` writes `out/plain.pptx`; `npm run sample -- rich` the full one; `npm run sample -- model.json` your own `ReportModel`.

## How it works

1. **`slides.ts`** turns the `ReportModel` (`types.ts`) into neutral frames: cover, answer-first summary, KPI cards, charts, merged chart + detail tables, recommendations, appendix. No pptx code here, so the same frames can feed a preview or a PDF.
2. **`pptx.ts`** draws each frame with PptxGenJS on a fixed grid. Cards are told apart by tone (no lines, no shadows), one corner radius everywhere (`RADIUS`), text is measured and clipped to its box, titles are action titles. Palette is `theme.ts`, currency is `format.ts`.
3. **`repairPptxPackage()`** fixes the package PptxGenJS 4.0.1 writes (phantom `[Content_Types].xml` overrides, notes master sharing the slide master's theme, unused default extensions; gitbrent/PptxGenJS#1449) so strict readers open it. `xmlSafe()` strips characters that are illegal in XML.

## Design tools

- **Layout inspector**: `buildReportPptx(model, { inspect })` hands back every box placed on every slide. Tests assert nothing overlaps, nothing leaves the slide, and nothing sits in the footer band.
- **Package tests**: zip integrity, well-formed XML, every relationship target exists, hostile text, finite chart values, idempotent repair.
- **Crowded fixture**: every optional part present with text well past what fits, to find collisions.
- **Render to look at**: `RENDER_DECK_DIR=out npx vitest run src/pptx-layout.test.ts` writes plain, rich and crowded decks.
- **Second reader**: `npm run check:office` converts the deck with LibreOffice (`soffice` on PATH) and expects one PDF page per slide.

## Re-skin

Edit `src/theme.ts` (navy, pale blue, amber...) and the extra tones at the top of `src/pptx.ts` (`C`). Fonts are Calibri because custom fonts cannot be embedded in a pptx.
