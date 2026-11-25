// "At a glance": a plain-English summary and one-tap answers, written by rules from
// the app's own data (no AI). If the Tidely server has an AI key, a free-form
// question box appears as well.
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

  const lines = localBriefing(data)
  const open = PRESETS.find((p) => p.id === openId)

  const ask = async (e) => {
    e.preventDefault()
    const text = question.trim()
    if (text.length < 3) return
    setOpenId(null)
    setAnswer({ status: 'loading', question: text })
    try {
      const a = await askTidely(station.id, text)
      setAnswer({ status: 'ok', question: text, text: a.text })
    } catch (err) {
      setAnswer({ status: 'error', question: text, message: err.message })
    }
  }

  return (
    <section className="panel glance" aria-label="At a glance">
      <h2>✨ At a glance</h2>
      <p className="glance-text">{lines.join(' ')}</p>

      <div className="glance-chips">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={openId === p.id ? 'chip on' : 'chip'} aria-expanded={openId === p.id} onClick={() => { setOpenId(openId === p.id ? null : p.id); setAnswer({ status: 'idle' }) }}>
            {p.label}
          </button>
        ))}
      </div>
      {open && <p className="glance-answer" aria-live="polite">{open.answer({ ...data, station })}</p>}

      {ai && online && station && (
        <>
          <form className="ai-ask" onSubmit={ask}>
            <input
              type="text"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything else…"
              aria-label="Ask a question about tides at this station (answered by AI)"
            />
            <button type="submit" className="secondary" disabled={answer.status === 'loading' || question.trim().length < 3}>Ask AI</button>
          </form>
          {answer.status === 'loading' && <p className="hint" aria-live="polite">Thinking about “{answer.question}”…</p>}
          {answer.status === 'ok' && (
            <p className="glance-answer" aria-live="polite">
              <span className="ai-tag">AI</span> {answer.text}
              <span className="ai-note"> Written by AI from NOAA data; it can be wrong, so check the numbers.</span>
            </p>
          )}
          {answer.status === 'error' && <p className="hint" role="alert">{answer.message}</p>}
        </>
      )}
    </section>
  )
}
