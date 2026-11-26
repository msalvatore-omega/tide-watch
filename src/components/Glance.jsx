// Quick answers as a row of icon buttons: the written summary and four common
// questions, each shown only when tapped (rules, no AI). If the Tidely server has an
// AI key, a free-form question box appears as well.
import Icon from './Icon.jsx'
import { useEffect, useState } from 'react'
import { localBriefing, PRESETS } from '../briefing.js'
import { aiAvailable, askTidely } from '../ai.js'

export default function Glance({ station, online, ...data }) {
  const [openId, setOpenId] = useState(null)
  const [ai, setAi] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    aiAvailable().then((ok) => !cancelled && setAi(ok))
    return () => { cancelled = true }
  }, [])

  const items = [
    { id: 'summary', icon: 'note', short: 'Summary', label: 'Tidal summary', answer: () => localBriefing(data).join(' ') },
    ...PRESETS.map((p) => ({ ...p, answer: () => p.answer({ ...data, station }) })),
    ...(ai && online && station ? [{ id: 'ask', icon: 'chat', short: 'Ask', label: 'Ask a question (AI)' }] : []),
  ]
  const open = items.find((i) => i.id === openId)

  const ask = async (e) => {
    e.preventDefault()
    const text = question.trim()
    if (text.length < 3) return
    setAnswer({ status: 'loading', question: text })
    try {
      const a = await askTidely(station.id, text)
      setAnswer({ status: 'ok', question: text, text: a.text })
    } catch (err) {
      setAnswer({ status: 'error', question: text, message: err.message })
    }
  }

  return (
    <section className="glance" aria-label="Quick answers">
      <div className="glance-row">
        {items.map((i) => (
          <button key={i.id} type="button" className={openId === i.id ? 'glance-btn on' : 'glance-btn'} aria-expanded={openId === i.id} aria-label={i.label} onClick={() => setOpenId(openId === i.id ? null : i.id)}>
            <span className="glance-icon"><Icon name={i.icon} size="1.5em" /></span>
            <span className="glance-short" aria-hidden="true">{i.short}</span>
          </button>
        ))}
      </div>
      {open && open.id !== 'ask' && <p className="glance-answer" aria-live="polite">{open.answer()}</p>}
      {open?.id === 'ask' && (
        <div className="glance-answer">
          <form className="ai-ask" onSubmit={ask}>
            <input
              type="text"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about tides, currents or weather here…"
              aria-label="Ask a question about tides at this station (answered by AI)"
            />
            <button type="submit" className="secondary" disabled={answer.status === 'loading' || question.trim().length < 3}>Ask</button>
          </form>
          {answer.status === 'loading' && <p className="hint" aria-live="polite">Working on “{answer.question}”…</p>}
          {answer.status === 'ok' && (
            <p aria-live="polite">
              <span className="ai-tag">AI</span> {answer.text}
              <span className="ai-note"> Written by AI from NOAA data; it can be wrong, so check the numbers.</span>
            </p>
          )}
          {answer.status === 'error' && <p className="hint" role="alert">{answer.message}</p>}
        </div>
      )}
    </section>
  )
}
