import type { ReactNode } from 'react'
import { useId } from 'react'

const path: Record<string, ReactNode> = {
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  trash: <path d="M3.5 4.5h9M6.5 4.5v-1h3v1M5 4.5l.5 8h5l.5-8" />,
  up: <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />,
  down: <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />,
  copy: <><rect x="5.5" y="5.5" width="7" height="7" rx="1.5" /><path d="M10.5 5.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1" /></>,
  download: <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  chevron: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
  left: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  right: <path d="M6 3.5 10.5 8 6 12.5" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="m3.5 8.5 3 3 6-7" />,
  code: <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />,
}

export function Icon({ name }: { name: keyof typeof path }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path[name]}
    </svg>
  )
}

export function IconButton({ icon, label, onClick, disabled }: { icon: keyof typeof path; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function TextField({ label, value, onChange, hint, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string; multiline?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea id={id} value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A bare input for a row cell; its label is the column name, read by screen readers. */
export function Cell({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return <input className={numeric ? 'cell num' : 'cell'} aria-label={label} value={value} placeholder={placeholder ?? label} inputMode={numeric ? 'decimal' : undefined} onChange={(e) => onChange(e.target.value)} />
}
