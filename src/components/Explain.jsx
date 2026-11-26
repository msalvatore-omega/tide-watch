// Help, on demand: a small ? button that explains how to read a panel, a tappable
// <Term> for nautical words, and the full glossary.
import { useRef, useState } from 'react'
import { TERMS, EXPLAIN } from '../glossary.js'

function HelpDialog({ dialogRef, title, children, onClose }) {
  return (
    <dialog ref={dialogRef} className="help" onClose={onClose} onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}>
      <div className="whatsnew-head">
        <h2>{title}</h2>
        <button type="button" className="whatsnew-close" onClick={() => dialogRef.current?.close()} aria-label="Close">✕</button>
      </div>
      <div className="help-body">{children}</div>
    </dialog>
  )
}

const TermList = ({ keys }) => (
  <dl className="terms">
    {keys.map((k) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{TERMS[k]}</dd>
      </div>
    ))}
  </dl>
)

/** "?" button: how to read this panel, plus the terms it uses. */
export function Explain({ id, className = '' }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const e = EXPLAIN[id]
  return (
    <>
      <button type="button" className={`explain-btn no-print ${className}`} onClick={() => { setOpen(true); ref.current?.showModal() }} aria-label={`How to read: ${e.title}`}>?</button>
      <HelpDialog dialogRef={ref} title={e.title} onClose={() => setOpen(false)}>
        {open && (
          <>
            {e.how.map((p, i) => <p key={i}>{p}</p>)}
            <h3>Terms</h3>
            <TermList keys={e.terms} />
          </>
        )}
      </HelpDialog>
    </>
  )
}

/** A nautical word that explains itself when tapped. */
export function Term({ k, children }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="term" onClick={() => { setOpen(true); ref.current?.showModal() }} aria-label={`${children ?? k}: what does this mean?`}>{children ?? k}</button>
      <HelpDialog dialogRef={ref} title={k} onClose={() => setOpen(false)}>
        {open && <p>{TERMS[k]}</p>}
      </HelpDialog>
    </>
  )
}

/** The whole glossary, A to Z. */
export function Glossary() {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const keys = Object.keys(TERMS).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return (
    <>
      <button type="button" className="link" onClick={() => { setOpen(true); ref.current?.showModal() }}>📖 Glossary of terms</button>
      <HelpDialog dialogRef={ref} title="Glossary" onClose={() => setOpen(false)}>
        {open && <TermList keys={keys} />}
      </HelpDialog>
    </>
  )
}
