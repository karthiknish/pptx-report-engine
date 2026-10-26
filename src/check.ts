import type { PlacedBox } from './pptx'

const SLIDE_W = 13.33
const SLIDE_H = 7.5
/** Body content ends here; the footer lives below. */
const BODY_BOTTOM = 6.95

export type LayoutProblem = { slide: number; message: string }

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

/**
 * Checks the boxes `inspect` returns: nothing leaves the slide, nothing sits in the footer band,
 * no two boxes land on top of each other. Slides are numbered from 1.
 */
export function checkLayout(slides: PlacedBox[][]): LayoutProblem[] {
  const out: LayoutProblem[] = []
  slides.forEach((boxes, i) => {
    const slide = i + 1
    for (const b of boxes) {
      if (b.x < 0 || b.y < 0 || b.x + b.w > SLIDE_W || b.y + b.h > SLIDE_H - 0.1) out.push({ slide, message: `${b.what} runs off the slide` })
      else if (b.what !== 'footer' && b.what !== 'page' && b.y + b.h > BODY_BOTTOM) out.push({ slide, message: `${b.what} reaches into the footer` })
    }
    for (let x = 0; x < boxes.length; x++) {
      for (let y = x + 1; y < boxes.length; y++) {
        if (collide(boxes[x]!, boxes[y]!)) out.push({ slide, message: `${boxes[x]!.what} meets ${boxes[y]!.what}` })
      }
    }
  })
  return out
}
