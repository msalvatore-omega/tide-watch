// A short first-visit tour: five cards, skippable, and reachable again from ⓘ.
import Icon from './Icon.jsx'
import { useEffect, useRef, useState } from 'react'

const KEY = 'tidely.tour.v1'
const seen = () => { try { return localStorage.getItem(KEY) === 'done' } catch { return true } }

const STEPS = [
  { icon: 'wave', title: 'Welcome aboard', text: 'Tidely shows the tide where you are: the height now, and the next high and low water. Here is a one-minute look around.' },
  { icon: 'trendUp', title: 'The tide now', text: 'The big figure is the height of tide. The gauge and curve beneath show where the water is, where it has been and where it is going; the red line is now. Below are the next high and low water and the conditions at the gauge.' },
  { icon: 'pin', title: 'Your station', text: 'Tap the station name to search by zip code or port. Stations marked “Tide gauge” measure the real water; the rest give predictions only. Tap ☆ to keep favourites one tap away.' },
  { icon: 'tour', title: 'Four tabs', text: 'Now is the present tide, the graph for the week ahead and the weather at the gauge. Week draws the next seven days. Map shows what every tide gauge around you is reading now; tap one to make it your station. Info has the marine forecast, sun and moon, quick answers, records and large ranges.' },
  { icon: 'help', title: 'Help is always there', text: 'Tap any ? for how to read a panel and what its terms mean. Underlined words explain themselves. The ⓘ at the foot of the page has the glossary, units and this tour.' },
]

export default function Tour({ request }) {
  const ref = useRef(null)
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // First visit: open by itself, once the page has settled.
    if (seen()) return
    const t = setTimeout(() => { setStep(0); setOpen(true); ref.current?.showModal?.() }, 900)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!request) return
    setStep(0); setOpen(true); ref.current?.showModal?.()
  }, [request])

  const done = () => {
    try { localStorage.setItem(KEY, 'done') } catch { /* ignore */ }
    setOpen(false)
  }
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  return (
    <dialog ref={ref} className="tour" aria-labelledby="tour-title" onClose={done}>
      {open && (
        <>
          <div className="tour-icon"><Icon name={s.icon} size="2.6rem" /></div>
          <h2 id="tour-title">{s.title}</h2>
          <p aria-live="polite">{s.text}</p>
          <div className="tour-dots" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : ''} />)}
          </div>
          <div className="tour-nav">
            {!last && <button type="button" className="link" onClick={() => ref.current?.close()}>Skip</button>}
            {step > 0 && <button type="button" className="secondary" onClick={() => setStep(step - 1)}>Back</button>}
            <button type="button" className="primary" autoFocus onClick={() => (last ? ref.current?.close() : setStep(step + 1))}>{last ? 'Done' : 'Next'}</button>
          </div>
        </>
      )}
    </dialog>
  )
}
