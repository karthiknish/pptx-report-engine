import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildDeckFromSpec, checkLayout, type DrawOp, type LayoutProblem, type PlacedBox } from '../src/index'
import { CoverEditor, SlideEditor, swap } from './Editor'
import { EXAMPLES } from './examples'
import { blankSlide, deckToSpec, KINDS, newId, parseSpec, specToDeck, type Deck, type Kind, type Slide as SlideModel } from './model'
import { Slide } from './Preview'
import { Icon, IconButton } from './ui'

const STORE = 'deckwright.v1'
type Logos = { white: string | null; blue: string | null }
type Saved = { deck: Deck; logos: Logos }

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) {
      const s = JSON.parse(raw) as Saved
      if (s?.deck?.slides) return s
    }
  } catch { /* private window or blocked storage: start from the example */ }
  return { deck: specToDeck(EXAMPLES[0]!.spec, 'Northgate'), logos: { white: null, blue: null } }
}

type Built = { ops: DrawOp[][]; boxes: PlacedBox[][]; problems: LayoutProblem[]; error: string | null }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck'

/** The page of the built deck that carries this slide: the one whose title text starts the same way. */
function pageFor(ops: DrawOp[][], title: string, index: number): number {
  const key = title.trim().slice(0, 24).replace(/…$/, '')
  if (key) {
    const hit = ops.findIndex((page, i) => i > 0 && page.some((o) => o.op === 'text' && typeof o.args[0] === 'string' && (o.args[0] as string).startsWith(key)))
    if (hit >= 0) return hit
  }
  return Math.min(ops.length - 1, index + 1)
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="1" y="5" width="16" height="12" rx="3" fill="var(--accent)" />
      <rect x="7" y="9" width="16" height="12" rx="3" fill="var(--accent-soft)" />
    </svg>
  )
}

export function App() {
  const [saved, setSaved] = useState<Saved>(load)
  const { deck, logos } = saved
  const [selected, setSelected] = useState<'cover' | string>('cover')
  const [built, setBuilt] = useState<Built | null>(null)
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const [menu, setMenu] = useState<null | 'deck' | 'add' | 'nav'>(null)
  const [json, setJson] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [stamp, setStamp] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)
  const stampTimer = useRef<number | undefined>(undefined)

  const say = (text: string) => {
    setStamp(text)
    window.clearTimeout(stampTimer.current)
    stampTimer.current = window.setTimeout(() => setStamp(''), 2400)
  }

  const setDeck = useCallback((fn: (d: Deck) => Deck) => setSaved((s) => ({ ...s, deck: fn(s.deck) })), [])

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(saved)) } catch { /* too large or blocked: the deck still works this session */ }
  }, [saved])

  const spec = useMemo(() => deckToSpec(deck), [deck])
  const index = deck.slides.findIndex((s) => s.id === selected)
  const slide = index >= 0 ? deck.slides[index]! : null

  // Rebuild the deck a moment after the last keystroke; a slower build never overwrites a newer one.
  const run = useRef(0)
  useEffect(() => {
    const mine = ++run.current
    const timer = window.setTimeout(async () => {
      try {
        let ops: DrawOp[][] = []
        let boxes: PlacedBox[][] = []
        await buildDeckFromSpec(spec, { brand: deck.brand, logoWhite: logos.white, logoBlue: logos.blue, trace: (o) => { ops = o }, inspect: (b) => { boxes = b } })
        if (mine === run.current) setBuilt({ ops, boxes, problems: checkLayout(boxes), error: null })
      } catch (e) {
        if (mine === run.current) setBuilt((b) => ({ ops: b?.ops ?? [], boxes: b?.boxes ?? [], problems: [], error: (e as Error).message }))
      }
    }, 220)
    return () => window.clearTimeout(timer)
  }, [spec, deck.brand, logos])

  // Follow the selected slide to the page that shows it.
  useEffect(() => {
    if (!built) return
    setPage(selected === 'cover' ? 0 : pageFor(built.ops, slide?.title ?? '', index))
  }, [selected, built, slide?.title, index])

  const pages = built?.ops.length ?? 0
  const pageProblems = built?.problems.filter((p) => p.slide === page + 1) ?? []

  const patchSlide = (patch: Partial<SlideModel>) => setDeck((d) => ({ ...d, slides: d.slides.map((s) => (s.id === selected ? { ...s, ...patch } : s)) }))
  const addSlide = (kind: Kind) => {
    const s = blankSlide(kind)
    setDeck((d) => ({ ...d, slides: [...d.slides.slice(0, index >= 0 ? index + 1 : d.slides.length), s, ...d.slides.slice(index >= 0 ? index + 1 : d.slides.length)] }))
    setSelected(s.id)
    setMenu(null)
    setPane('edit')
  }
  const removeSlide = () => {
    if (!slide) return
    const next = deck.slides[index + 1] ?? deck.slides[index - 1]
    setDeck((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slide.id) }))
    setSelected(next?.id ?? 'cover')
    say('Slide removed')
  }
  const duplicate = () => {
    if (!slide) return
    const copy = { ...structuredClone(slide), id: newId() }
    setDeck((d) => ({ ...d, slides: [...d.slides.slice(0, index + 1), copy, ...d.slides.slice(index + 1)] }))
    setSelected(copy.id)
  }
  const move = (by: -1 | 1) => setDeck((d) => ({ ...d, slides: swap(d.slides, index, index + by) }))

  const openDeck = (spec: Parameters<typeof specToDeck>[0], brand: string) => {
    setSaved((s) => ({ ...s, deck: specToDeck(spec, brand) }))
    setSelected('cover')
    setMenu(null)
  }

  const download = async () => {
    setBusy(true)
    try {
      const bytes = await buildDeckFromSpec(spec, { brand: deck.brand, logoWhite: logos.white, logoBlue: logos.blue })
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${slug(deck.title)}.pptx`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 1000)
      say('Downloaded')
    } catch (e) {
      say(`Could not build: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(spec, null, 2)); say('JSON copied') } catch { setJson(JSON.stringify(spec, null, 2)) }
  }
  const applyJson = () => {
    const r = parseSpec(json ?? '')
    if ('error' in r) return setJsonError(r.error)
    openDeck(r.spec, deck.brand)
    setJson(null)
    setJsonError(null)
  }

  const heading = selected === 'cover' ? 'Cover' : KINDS.find((k) => k.id === slide?.kind)?.noun ?? 'Slide'
  const status = !built
    ? 'Building the preview…'
    : built.error
      ? `The deck could not be built: ${built.error}`
      : pageProblems.length === 0
        ? `Page ${page + 1} of ${pages} fits: nothing overlaps and nothing runs off the slide.`
        : `${pageProblems.length} layout ${pageProblems.length === 1 ? 'problem' : 'problems'} on page ${page + 1}.`
  const totalProblems = built?.problems.length ?? 0

  const nav = (
    <nav aria-label="Slides">
      <p className="group-label">Slides</p>
      <ul>
        <li>
          <button type="button" className="nav-item" aria-current={selected === 'cover' ? 'page' : undefined} onClick={() => { setSelected('cover'); setMenu(null); setPane('edit') }}>
            <span className="nav-title">Cover</span>
            <span className="nav-kind">{deck.title ? '' : 'Untitled'}</span>
          </button>
        </li>
        {deck.slides.map((s) => (
          <li key={s.id}>
            <button type="button" className="nav-item" aria-current={selected === s.id ? 'page' : undefined} onClick={() => { setSelected(s.id); setMenu(null); setPane('edit') }}>
              <span className="nav-title">{s.title.trim() || 'Untitled slide'}</span>
              <span className="nav-kind">{KINDS.find((k) => k.id === s.kind)?.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="menu-anchor">
        <button type="button" className="nav-add" aria-expanded={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')}><Icon name="plus" /> Add a slide</button>
        {menu === 'add' ? (
          <ul className="menu" role="menu">
            {KINDS.map((k) => <li key={k.id}><button type="button" role="menuitem" onClick={() => addSlide(k.id)}>{k.label}</button></li>)}
          </ul>
        ) : null}
      </div>
    </nav>
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><Mark /><span>Deckwright</span></div>
        <div className="menu-anchor">
          <button type="button" className="switcher" aria-expanded={menu === 'deck'} onClick={() => setMenu(menu === 'deck' ? null : 'deck')}>
            <span className="switcher-text"><span className="hint">Deck</span><span className="switcher-name">{deck.title || 'Untitled deck'}</span></span>
            <Icon name="chevron" />
          </button>
          {menu === 'deck' ? (
            <ul className="menu" role="menu">
              {EXAMPLES.map((e) => <li key={e.id}><button type="button" role="menuitem" onClick={() => openDeck(e.spec, deck.brand)}>Open “{e.name}”</button></li>)}
              <li><button type="button" role="menuitem" onClick={() => openDeck({ title: 'Untitled deck', slides: [] }, deck.brand)}>Start a blank deck</button></li>
              <li><button type="button" role="menuitem" onClick={() => { setJson(JSON.stringify(spec, null, 2)); setMenu(null) }}>Edit as JSON</button></li>
            </ul>
          ) : null}
        </div>
        {nav}
      </aside>

      <header className="topbar">
        <button type="button" className="icon-button menu-button" aria-label="Slides" onClick={() => setMenu(menu === 'nav' ? null : 'nav')}><Icon name="menu" /></button>
        <p className="crumb"><span>{deck.title || 'Untitled deck'}</span><Icon name="right" /><strong>{selected === 'cover' ? 'Cover' : slide?.title.trim() || 'Untitled slide'}</strong></p>
        <span className={`pill ${totalProblems ? 'warn' : 'ok'}`} role="status">{!built ? 'Checking' : totalProblems ? `${totalProblems} layout ${totalProblems === 1 ? 'problem' : 'problems'}` : 'Layout clean'}</span>
        <span className="stamp" role="status" aria-live="polite">{stamp}</span>
        <button type="button" className="button" onClick={copyJson}><Icon name="copy" /> Copy JSON</button>
        <button type="button" className="button primary" onClick={download} disabled={busy}><Icon name="download" /> {busy ? 'Building…' : 'Download .pptx'}</button>
      </header>

      {menu === 'nav' ? <div className="sheet-menu" role="dialog" aria-label="Slides"><div className="sheet-menu-head"><strong>{deck.title || 'Untitled deck'}</strong><IconButton icon="close" label="Close" onClick={() => setMenu(null)} /></div>{nav}</div> : null}

      <main className="sheet">
        <div className="title-row">
          <div>
            <h1>{heading}</h1>
            <p className={`finding ${pageProblems.length || built?.error ? 'bad' : ''}`}>{status}</p>
          </div>
          {slide ? (
            <div className="title-actions">
              <IconButton icon="up" label="Move slide earlier" disabled={index === 0} onClick={() => move(-1)} />
              <IconButton icon="down" label="Move slide later" disabled={index === deck.slides.length - 1} onClick={() => move(1)} />
              <IconButton icon="copy" label="Duplicate slide" onClick={duplicate} />
              <IconButton icon="trash" label="Remove slide" onClick={removeSlide} />
            </div>
          ) : null}
        </div>

        <div className="tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={pane === 'edit'} onClick={() => setPane('edit')}>Edit</button>
          <button type="button" role="tab" aria-selected={pane === 'preview'} onClick={() => setPane('preview')}>Preview</button>
        </div>

        <div className="work" data-pane={pane}>
          <div className="edit-col">
            {selected === 'cover' || !slide ? (
              <CoverEditor deck={deck} update={(patch) => setDeck((d) => ({ ...d, ...patch }))} logos={logos} setLogo={(k, v) => setSaved((s) => ({ ...s, logos: { ...s.logos, [k]: v } }))} />
            ) : (
              <SlideEditor slide={slide} update={patchSlide} />
            )}
          </div>
          <div className="preview-col">
            <div className="stage-wrap" data-ui>
              {built?.ops[page] ? <Slide ops={built.ops[page]!} /> : <div className="stage loading" aria-busy="true" />}
            </div>
            <div className="pager">
              <IconButton icon="left" label="Previous page" disabled={page <= 0} onClick={() => setPage(page - 1)} />
              <span className="num">Page {pages ? page + 1 : 0} of {pages}</span>
              <IconButton icon="right" label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} />
            </div>
            {built && built.ops.length > 1 ? (
              <div className="thumbs" aria-label="Pages">
                {built.ops.map((ops, i) => (
                  <button key={i} type="button" className="thumb" aria-current={i === page} aria-label={`Show page ${i + 1}`} onClick={() => setPage(i)}>
                    <div className="stage-wrap" data-ui aria-hidden="true"><Slide ops={ops} /></div>
                    <span className="num">{i + 1}{built.problems.some((p) => p.slide === i + 1) ? ' · needs a look' : ''}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {pageProblems.length ? (
              <ul className="problems">{pageProblems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>
            ) : null}
          </div>
        </div>
      </main>

      {json !== null ? (
        <div className="scrim" onClick={() => setJson(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Deck JSON" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head"><h2>Deck as JSON</h2><IconButton icon="close" label="Close" onClick={() => setJson(null)} /></div>
            <textarea className="json" spellCheck={false} value={json} onChange={(e) => { setJson(e.target.value); setJsonError(null) }} aria-label="Deck JSON" />
            {jsonError ? <p className="error" role="alert">{jsonError}</p> : <p className="hint">Paste a deck here to replace the current one.</p>}
            <div className="dialog-actions"><button type="button" className="button" onClick={() => setJson(null)}>Cancel</button><button type="button" className="button primary" onClick={applyJson}><Icon name="check" /> Use this deck</button></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
