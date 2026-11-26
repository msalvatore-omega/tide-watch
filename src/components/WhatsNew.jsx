// The 🕘 button at the bottom of the page and the "What's new" window it opens:
// Tidely's version history, newest first (from src/changelog.js).
import { useEffect, useRef, useState } from 'react'
import { CHANGELOG, CURRENT_VERSION } from '../changelog.js'

const SEEN_KEY = 'tidely.seenVersion'
const KIND = { new: 'New', improved: 'Improved', fixed: 'Fixed' }

const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) } catch { return null } }
const formatDate = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

export default function WhatsNew() {
  const dialog = useRef(null)
  const [seen, setSeen] = useState(readSeen)
  const [open, setOpen] = useState(false)
  // A first-time visitor has nothing to catch up on; a returning one sees a dot after an update.
  const unread = seen != null && seen !== CURRENT_VERSION
  // Versions released since this person last looked (highlighted in the list).
  const seenIndex = CHANGELOG.findIndex((v) => v.version === seen)
  const isNewToThem = (i) => unread && (seenIndex === -1 || i < seenIndex)

  useEffect(() => {
    if (seen == null) { // remember today's version so later updates can be flagged
      try { localStorage.setItem(SEEN_KEY, CURRENT_VERSION) } catch { /* ignore */ }
    }
  }, [seen])

  const show = () => {
    setOpen(true)
    dialog.current?.showModal()
  }
  const close = () => {
    dialog.current?.close()
  }
  const onClosed = () => {
    setOpen(false)
    try { localStorage.setItem(SEEN_KEY, CURRENT_VERSION) } catch { /* ignore */ }
    setSeen(CURRENT_VERSION)
  }

  return (
    <>
      <button type="button" className="whatsnew-btn no-print" onClick={show} aria-label={`Version ${CURRENT_VERSION}: what's new${unread ? ' (updated since your last visit)' : ''}`}>
        <span aria-hidden="true">🕘</span> v{CURRENT_VERSION}
        {unread && <span className="whatsnew-dot" aria-hidden="true" />}
      </button>

      {/* Native <dialog>: traps focus, closes on Escape, and dims the page behind it. */}
      <dialog ref={dialog} className="whatsnew" aria-labelledby="whatsnew-title" onClose={onClosed} onClick={(e) => e.target === dialog.current && close()}>
        <div className="whatsnew-head">
          <h2 id="whatsnew-title">What's new in Tidely</h2>
          <button type="button" className="whatsnew-close" onClick={close} aria-label="Close">✕</button>
        </div>
        {open && (
          <ol className="whatsnew-list">
            {CHANGELOG.map((v, i) => (
              <li key={v.version} className={isNewToThem(i) ? 'unread' : ''}>
                <div className="whatsnew-version">
                  <strong>v{v.version}</strong>
                  <span>{formatDate(v.date)}</span>
                  {i === 0 && <span className="whatsnew-tag current">current</span>}
                  {isNewToThem(i) && <span className="whatsnew-tag fresh">new to you</span>}
                </div>
                <h3>{v.title}</h3>
                <ul>
                  {v.changes.map((c, j) => (
                    <li key={j}><span className={`kind-tag ${c.kind}`}>{KIND[c.kind]}</span> {c.text}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </dialog>
    </>
  )
}
