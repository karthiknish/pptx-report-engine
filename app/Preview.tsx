import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { DrawOp } from '../src/index'

/** The slide is 13.33 x 7.5 inches; every position the engine reports is in inches. */
const W = 13.33
const H = 7.5

type Box = { x: number; y: number; w: number; h: number }
const pct = (v: number, of: number) => `${(v / of) * 100}%`
const place = (b: Box): CSSProperties => ({ left: pct(b.x, W), top: pct(b.y, H), width: pct(b.w, W), height: pct(b.h, H) })
/** The slide is laid out at 96 pixels to the inch and scaled to fit, so type keeps its true proportion. */
const PX = 96
const inch = (v: number) => `${v * PX}px`
const pt = (v: number) => `${(v / 72) * PX}px`
const hex = (c: unknown, fallback = '000000') => `#${typeof c === 'string' ? c : fallback}`

type TextRun = { text: string; options?: { bullet?: unknown } }
type Opts = Box & {
  fontSize?: number; color?: string; bold?: boolean; align?: 'left' | 'center' | 'right'
  fill?: { color: string }; rectRadius?: number; paraSpaceAfter?: number
}

function Text({ args }: { args: unknown[] }) {
  const [content, raw] = args as [string | TextRun[], Opts]
  const style: CSSProperties = {
    ...place(raw),
    fontSize: pt(raw.fontSize ?? 18),
    color: hex(raw.color, '1D232B'),
    fontWeight: raw.bold ? 700 : 400,
    textAlign: raw.align ?? 'left',
  }
  if (typeof content === 'string') return <div className="s-text" style={style}>{content}</div>
  return (
    <div className="s-text" style={style}>
      {content.map((run, i) => (
        <div key={i} className={run.options?.bullet ? 's-bullet' : undefined} style={{ marginBottom: pt(raw.paraSpaceAfter ?? 0) }}>
          {run.text}
        </div>
      ))}
    </div>
  )
}

type Series = { name: string; labels: string[]; values: number[] }
type ChartOpts = Box & {
  barDir?: 'col' | 'bar'; barGrouping?: string; chartColors?: string[]; showValue?: boolean; showLegend?: boolean
  catAxisHidden?: boolean; catAxisLabelFontSize?: number; dataLabelFontSize?: number; legendFontSize?: number
  dataLabelFormatCode?: string; valAxisMaxVal?: number
}

const money = (v: number, code?: string) => (code?.includes('£') ? `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(Math.round(v)))

/** A chart drawn in SVG units of 1/100 inch, with type sized in the same units. */
function Chart({ args }: { args: unknown[] }) {
  const [, data, o] = args as [string, Series[], ChartOpts]
  const w = o.w * 100
  const h = o.h * 100
  const u = (size: number) => (size / 72) * 100
  const colors = (o.chartColors ?? ['20374D']).map((c) => hex(c))
  const labels = data[0]?.labels ?? []
  const body: ReactNode[] = []

  if (o.barDir === 'bar') {
    const legendH = o.showLegend ? u(o.legendFontSize ?? 12) * 2.4 : 0
    const labelW = Math.min(w * 0.3, Math.max(...labels.map((l) => l.length), 4) * u(o.catAxisLabelFontSize ?? 12) * 0.52 + 12)
    const rows = labels.length || 1
    const rowH = (h - legendH) / rows
    const totals = labels.map((_, i) => data.reduce((n, s) => n + (s.values[i] ?? 0), 0))
    const max = Math.max(1, ...totals)
    labels.forEach((label, i) => {
      let x = labelW
      const barH = rowH * 0.58
      const y = i * rowH + (rowH - barH) / 2
      body.push(<text key={`l${i}`} x={labelW - 8} y={y + barH / 2} textAnchor="end" dominantBaseline="central" fontSize={u(o.catAxisLabelFontSize ?? 12)} fill="#1D232B">{label}</text>)
      data.forEach((s, si) => {
        const bw = ((s.values[i] ?? 0) / max) * (w - labelW)
        if (bw > 0) body.push(<rect key={`${i}-${si}`} x={x} y={y} width={bw} height={barH} fill={colors[si % colors.length]} />)
        x += bw
      })
    })
    if (o.showLegend) {
      let x = labelW
      data.forEach((s, si) => {
        body.push(<rect key={`k${si}`} x={x} y={h - legendH * 0.6} width={u(9)} height={u(9)} fill={colors[si % colors.length]} />)
        body.push(<text key={`kt${si}`} x={x + u(9) + 6} y={h - legendH * 0.6 + u(9) / 2} dominantBaseline="central" fontSize={u(o.legendFontSize ?? 12)} fill="#1D232B">{s.name}</text>)
        x += u(9) + 12 + s.name.length * u(o.legendFontSize ?? 12) * 0.52 + 16
      })
    }
  } else {
    const series = data[0]
    const values = series?.values ?? []
    const labelH = o.catAxisHidden ? 0 : u(o.catAxisLabelFontSize ?? 12) * 1.8
    const valueH = o.showValue ? u(o.dataLabelFontSize ?? 12) * 1.6 : 0
    const plotH = h - labelH - valueH
    const max = o.valAxisMaxVal ?? Math.max(1, ...values) * 1.05
    const n = Math.max(1, values.length)
    const slot = w / n
    const gap = o.catAxisHidden ? 0.3 : 0.45
    values.forEach((v, i) => {
      const bh = Math.max(0, (v / max) * plotH)
      const x = i * slot + (slot * gap) / 2
      const bw = slot * (1 - gap)
      body.push(<rect key={i} x={x} y={valueH + plotH - bh} width={bw} height={bh} fill={colors[0]} />)
      if (o.showValue) body.push(<text key={`v${i}`} x={x + bw / 2} y={valueH + plotH - bh - 6} textAnchor="middle" fontSize={u(o.dataLabelFontSize ?? 12)} fill="#1D232B">{money(v, o.dataLabelFormatCode)}</text>)
      if (!o.catAxisHidden) body.push(<text key={`c${i}`} x={x + bw / 2} y={h - labelH * 0.35} textAnchor="middle" fontSize={u(o.catAxisLabelFontSize ?? 12)} fill="#1D232B">{labels[i]}</text>)
    })
  }
  return (
    <svg className="s-chart" style={place(o)} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Chart">
      {body}
    </svg>
  )
}

type Cell = { text: string; options?: { bold?: boolean; color?: string; fontSize?: number } }
function Table({ args }: { args: unknown[] }) {
  const [rows, o] = args as [Cell[][], Box & { colW: number[]; rowH: number[] }]
  let y = o.y
  return (
    <>
      {rows.map((row, ri) => {
        const top = y
        y += o.rowH[ri] ?? 0
        let x = o.x
        return row.map((cell, ci) => {
          const left = x
          x += o.colW[ci] ?? 0
          return (
            <div
              key={`${ri}-${ci}`}
              className="s-cell"
              style={{
                ...place({ x: left, y: top, w: o.colW[ci] ?? 0, h: o.rowH[ri] ?? 0 }),
                fontSize: pt(cell.options?.fontSize ?? 12),
                color: hex(cell.options?.color, '1D232B'),
                fontWeight: cell.options?.bold ? 700 : 400,
              }}
            >
              {cell.text}
            </div>
          )
        })
      })}
    </>
  )
}

/** One slide, drawn from the calls the engine made to build it. */
export function Slide({ ops }: { ops: DrawOp[] }) {
  const bg = ops.find((o) => o.op === 'background')
  const color = hex((bg?.args[0] as { color?: string } | undefined)?.color, 'FCFBF9')
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / (W * PX))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return (
    <div ref={box} className="stage" style={{ height: `${H * PX * scale}px` }}>
      <div className="canvas" style={{ width: W * PX, height: H * PX, background: color, transform: `scale(${scale})` }}>
      {ops.map((op, i) => {
        if (op.op === 'shape') {
          const [, o] = op.args as [string, Opts]
          return <div key={i} className="s-shape" style={{ ...place(o), background: hex(o.fill?.color, 'F4F0E8'), borderRadius: inch(o.rectRadius ?? 0) }} />
        }
        if (op.op === 'text') return <Text key={i} args={op.args} />
        if (op.op === 'chart') return <Chart key={i} args={op.args} />
        if (op.op === 'table') return <Table key={i} args={op.args} />
        if (op.op === 'image') {
          const [o] = op.args as [Box & { data: string }]
          return <img key={i} className="s-image" style={place(o)} src={o.data} alt="" />
        }
        return null
      })}
      </div>
    </div>
  )
}
