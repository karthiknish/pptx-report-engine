import { Cell, Field, IconButton, Segmented, TextField } from './ui'
import { Icon } from './ui'
import { blankSlide, KINDS, type Deck, type Kind, type Slide } from './model'

type Update<T> = (patch: Partial<T>) => void

const swap = <T,>(list: T[], i: number, j: number) => {
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}
const without = <T,>(list: T[], i: number) => list.filter((_, k) => k !== i)
const replace = <T,>(list: T[], i: number, item: T) => list.map((x, k) => (k === i ? item : x))

function Rows<T>({ label, items, render, onRemove, onAdd, addLabel, max }: { label: string; items: T[]; render: (item: T, i: number) => React.ReactNode; onRemove: (i: number) => void; onAdd: () => void; addLabel: string; max?: number }) {
  return (
    <section className="group" aria-label={label}>
      <h3>{label}</h3>
      {items.length === 0 ? <p className="empty">Nothing here yet.</p> : null}
      {items.map((item, i) => (
        <div className="row" key={i}>
          <div className="row-fields">{render(item, i)}</div>
          <IconButton icon="trash" label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onRemove(i)} />
        </div>
      ))}
      <button type="button" className="text-button" onClick={onAdd} disabled={max !== undefined && items.length >= max}>
        <Icon name="plus" /> {addLabel}
      </button>
    </section>
  )
}

export function CoverEditor({ deck, update, logos, setLogo }: { deck: Deck; update: Update<Deck>; logos: { white: string | null; blue: string | null }; setLogo: (k: 'white' | 'blue', v: string | null) => void }) {
  const pick = (k: 'white' | 'blue') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' && setLogo(k, reader.result)
    reader.readAsDataURL(file)
  }
  return (
    <div className="editor">
      <TextField label="Deck title" value={deck.title} onChange={(title) => update({ title })} />
      <TextField label="One line of state" value={deck.subtitle} onChange={(subtitle) => update({ subtitle })} hint="Shown in gold on the cover: the answer, in a sentence." multiline />
      <TextField label="Period" value={deck.period} onChange={(period) => update({ period })} placeholder="Jul to Sep 2026" />
      <TextField label="Footer" value={deck.footer} onChange={(footer) => update({ footer })} hint="Printed on every slide." placeholder="Company · Confidential" />
      <TextField label="Name in the wordmark" value={deck.brand} onChange={(brand) => update({ brand })} hint="Used as the file author, and as the wordmark when there is no logo." />
      <section className="group" aria-label="Logos">
        <h3>Logos</h3>
        {(['white', 'blue'] as const).map((k) => (
          <div className="logo-row" key={k}>
            <div className={`logo-chip ${k}`}>{logos[k] ? <img src={logos[k]!} alt="" /> : <span>None</span>}</div>
            <div className="logo-meta">
              <span>{k === 'white' ? 'For dark slides' : 'For light slides'}</span>
              <span className="hint">PNG</span>
            </div>
            <label className="text-button">
              <input type="file" accept="image/png" hidden onChange={pick(k)} />
              {logos[k] ? 'Replace' : 'Upload'}
            </label>
            {logos[k] ? <button type="button" className="text-button" onClick={() => setLogo(k, null)}>Remove</button> : null}
          </div>
        ))}
      </section>
    </div>
  )
}

export function SlideEditor({ slide, update }: { slide: Slide; update: Update<Slide> }) {
  const setKind = (kind: Kind) => {
    const fresh = blankSlide(kind)
    // Keep whatever the slide already holds for that kind; start it empty only the first time.
    const has = { kpis: slide.kpis.length, chart: slide.points.length, stacked: slide.stacks.length, table: slide.rows.length, actions: slide.actions.length, text: 1 }[kind]
    update(has ? { kind } : { kind, kpis: fresh.kpis, points: fresh.points, stacks: fresh.stacks, columns: fresh.columns, rows: fresh.rows, actions: fresh.actions })
  }
  return (
    <div className="editor">
      <TextField label="Takeaway" value={slide.title} onChange={(title) => update({ title })} hint="The sentence the reader should leave with. It becomes the slide title." multiline />
      <div className="field">
        <span className="label" id="evidence-label">Evidence</span>
        <Segmented label="Kind of evidence" value={slide.kind} options={KINDS.map((k) => ({ id: k.id, label: k.label }))} onChange={setKind} />
      </div>

      {slide.kind === 'kpis' ? (
        <Rows
          label="Figures" items={slide.kpis} max={4}
          onRemove={(i) => update({ kpis: without(slide.kpis, i) })}
          onAdd={() => update({ kpis: [...slide.kpis, { label: '', value: '', change: '', better: 'up', trend: '', hint: '' }] })}
          addLabel="Add a figure"
          render={(k, i) => {
            const set = (patch: Partial<typeof k>) => update({ kpis: replace(slide.kpis, i, { ...k, ...patch }) })
            return (
              <>
                <div className="pair"><Cell label="Label" value={k.label} onChange={(label) => set({ label })} /><Cell label="Value" value={k.value} onChange={(value) => set({ value })} numeric /></div>
                <div className="pair"><Cell label="Change" value={k.change} onChange={(change) => set({ change })} placeholder="Change, e.g. +12%" numeric /><Cell label="Trend" value={k.trend} onChange={(trend) => set({ trend })} placeholder="Trend: 31, 34, 38" /></div>
                <Segmented label="Which way is better" value={k.better} options={[{ id: 'up', label: 'Higher is better' }, { id: 'down', label: 'Lower is better' }]} onChange={(better) => set({ better })} />
              </>
            )
          }}
        />
      ) : null}

      {slide.kind === 'chart' ? (
        <>
          <div className="field">
            <span className="label">Values are</span>
            <Segmented label="Value format" value={slide.format} options={[{ id: 'count', label: 'Counts' }, { id: 'money', label: 'Money' }]} onChange={(format) => update({ format })} />
          </div>
          <Rows
            label="Bars" items={slide.points}
            onRemove={(i) => update({ points: without(slide.points, i) })}
            onAdd={() => update({ points: [...slide.points, { label: '', value: '' }] })}
            addLabel="Add a bar"
            render={(p, i) => (
              <div className="pair">
                <Cell label="Label" value={p.label} onChange={(label) => update({ points: replace(slide.points, i, { ...p, label }) })} />
                <Cell label="Value" value={p.value} onChange={(value) => update({ points: replace(slide.points, i, { ...p, value }) })} numeric />
              </div>
            )}
          />
        </>
      ) : null}

      {slide.kind === 'stacked' ? (
        <Rows
          label="Rows" items={slide.stacks} max={8}
          onRemove={(i) => update({ stacks: without(slide.stacks, i) })}
          onAdd={() => update({ stacks: [...slide.stacks, { name: '', done: '', running: '', waiting: '', failed: '' }] })}
          addLabel="Add a row"
          render={(r, i) => {
            const set = (patch: Partial<typeof r>) => update({ stacks: replace(slide.stacks, i, { ...r, ...patch }) })
            return (
              <>
                <Cell label="Name" value={r.name} onChange={(name) => set({ name })} />
                <div className="quad">
                  <Cell label="Done" value={r.done} onChange={(done) => set({ done })} numeric />
                  <Cell label="In progress" value={r.running} onChange={(running) => set({ running })} numeric />
                  <Cell label="Needs you" value={r.waiting} onChange={(waiting) => set({ waiting })} numeric />
                  <Cell label="Failed" value={r.failed} onChange={(failed) => set({ failed })} numeric />
                </div>
              </>
            )
          }}
        />
      ) : null}

      {slide.kind === 'table' ? (
        <section className="group" aria-label="Table">
          <h3>Table</h3>
          <div className="table-edit" style={{ gridTemplateColumns: `repeat(${slide.columns.length}, minmax(56px, 1fr)) 32px` }}>
            {slide.columns.map((c, ci) => (
              <Cell key={`h${ci}`} label={`Column ${ci + 1}`} value={c} onChange={(v) => update({ columns: replace(slide.columns, ci, v) })} placeholder={`Column ${ci + 1}`} />
            ))}
            <IconButton icon="close" label="Remove last column" disabled={slide.columns.length <= 1} onClick={() => update({ columns: slide.columns.slice(0, -1), rows: slide.rows.map((r) => r.slice(0, -1)) })} />
            {slide.rows.map((row, ri) =>
              slide.columns.map((_, ci) => (
                <Cell key={`${ri}-${ci}`} label={`Row ${ri + 1}, ${slide.columns[ci] || `column ${ci + 1}`}`} value={row[ci] ?? ''} placeholder="" onChange={(v) => update({ rows: replace(slide.rows, ri, replace(slide.columns.map((_, k) => row[k] ?? ''), ci, v)) })} />
              )).concat(<IconButton key={`d${ri}`} icon="trash" label={`Remove row ${ri + 1}`} onClick={() => update({ rows: without(slide.rows, ri) })} />),
            )}
          </div>
          <div className="actions">
            <button type="button" className="text-button" onClick={() => update({ rows: [...slide.rows, slide.columns.map(() => '')] })}><Icon name="plus" /> Add a row</button>
            <button type="button" className="text-button" disabled={slide.columns.length >= 6} onClick={() => update({ columns: [...slide.columns, ''], rows: slide.rows.map((r) => [...r, '']) })}><Icon name="plus" /> Add a column</button>
          </div>
        </section>
      ) : null}

      {slide.kind === 'actions' ? (
        <Rows
          label="Steps" items={slide.actions} max={6}
          onRemove={(i) => update({ actions: without(slide.actions, i) })}
          onAdd={() => update({ actions: [...slide.actions, { text: '', why: '', priority: 'medium' }] })}
          addLabel="Add a step"
          render={(a, i) => {
            const set = (patch: Partial<typeof a>) => update({ actions: replace(slide.actions, i, { ...a, ...patch }) })
            return (
              <>
                <Cell label="What to do" value={a.text} onChange={(text) => set({ text })} />
                <Cell label="Why" value={a.why} onChange={(why) => set({ why })} placeholder="Why, with the evidence" />
                <Segmented label="Priority" value={a.priority} options={[{ id: 'high', label: 'Act now' }, { id: 'medium', label: 'Watch' }]} onChange={(priority) => set({ priority })} />
              </>
            )
          }}
        />
      ) : null}

      <Rows
        label="Claims" items={slide.bullets} max={4}
        onRemove={(i) => update({ bullets: without(slide.bullets, i) })}
        onAdd={() => update({ bullets: [...slide.bullets, { text: '', tone: 'note' }] })}
        addLabel="Add a claim"
        render={(b, i) => (
          <>
            <Cell label="Claim" value={b.text} onChange={(text) => update({ bullets: replace(slide.bullets, i, { ...b, text }) })} placeholder="A plain sentence that backs the takeaway" />
            <Segmented label="Tone" value={b.tone} options={[{ id: 'good', label: 'Good news' }, { id: 'bad', label: 'Bad news' }, { id: 'note', label: 'Fact' }]} onChange={(tone) => update({ bullets: replace(slide.bullets, i, { ...b, tone }) })} />
          </>
        )}
      />

      <Field label="Speaker notes" hint="Left out of the slide; kept in the notes pane. Defaults to the takeaway and claims.">
        {(id) => <textarea id={id} rows={3} value={slide.notes} onChange={(e) => update({ notes: e.target.value })} />}
      </Field>
    </div>
  )
}

export { swap }
