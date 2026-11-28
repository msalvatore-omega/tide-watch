// The tide in the user's own terms: the depth of water at their berth, and three lights
// for common jobs driven by rules they set. Both are kept per station on this device.
import Icon from './Icon.jsx'
import { useState } from 'react'
import { berthNow, defaultRules, ruleStatus, RULES } from '../insight.js'
import { ft, hUnit, toFeet, fromFeet, formatAtStation, offsetAt } from '../tides.js'
import { Explain } from './Explain.jsx'

const BERTH_KEY = 'tidely.berth.v1' // { [stationId]: { charted, draft } } in feet
const RULES_KEY = 'tidely.rules.v1' // { [stationId]: { launch, flats, turn } }
const loadAll = (key) => { try { return JSON.parse(localStorage.getItem(key)) ?? {} } catch { return {} } }
const saveOne = (key, id, value) => { try { localStorage.setItem(key, JSON.stringify({ ...loadAll(key), [id]: value })) } catch { /* ignore */ } }

/** The user's berth and rules for this station (state shared by the Now and Plan tabs). */
export function useMyWater(stationId, events) {
  const [store, setStore] = useState(() => ({ berth: loadAll(BERTH_KEY), rules: loadAll(RULES_KEY) }))
  const berth = store.berth[stationId] ?? null
  const rules = events ? { ...defaultRules(events), ...store.rules[stationId] } : null
  const setBerth = (b) => { saveOne(BERTH_KEY, stationId, b); setStore((s) => ({ ...s, berth: { ...s.berth, [stationId]: b } })) }
  const setRules = (r) => { saveOne(RULES_KEY, stationId, r); setStore((s) => ({ ...s, rules: { ...s.rules, [stationId]: r } })) }
  return { berth, rules, setBerth, setRules }
}

function statusText(st, time) {
  if (st.on) return st.until ? `now · until ${time(st.until)}` : 'now'
  return st.next ? `from ${time(st.next)}` : 'not in the next 2 days'
}
const tone = (st, now) => (st.on ? 'on' : st.next && st.next - now < 2 * 3600e3 ? 'soon' : 'off')

/** One line of lights for the Now tab; tapping it opens the Plan tab. */
export function RuleLights({ my, events, now, heightNow, onOpen }) {
  if (!my.rules) return null
  const time = (d) => formatAtStation(d, offsetAt(events, d))
  const b = my.berth ? berthNow(my.berth, events, now, heightNow) : null
  return (
    <button type="button" className="lights" onClick={onOpen} aria-label="By your rules: open the plan">
      {b && (
        <span className={`light ${b.clearance > 1 ? 'on' : b.afloat ? 'soon' : 'bad'}`}>
          <i><Icon name="anchor" /></i>
          <b>{ft(b.depth)} at berth</b>
          <small>{b.afloat ? `${ft(b.clearance)} under keel` : 'aground'}</small>
        </span>
      )}
      {RULES.map((r) => {
        const st = ruleStatus(r.id, my.rules[r.id], events, now, heightNow)
        return (
          <span key={r.id} className={`light ${tone(st, now)}`}>
            <i><Icon name={r.icon} /></i>
            <b>{r.name}</b>
            <small>{statusText(st, time)}</small>
          </span>
        )
      })}
    </button>
  )
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

/**
 * A number field that lets you type freely: what you type is kept as text, saved as soon
 * as it is a figure within range, and tidied (clamped, or put back if empty) when you leave.
 */
function Field({ label, value, onChange, step = 0.1, unit = hUnit(), min, max, allowEmpty = false }) {
  const [text, setText] = useState(String(value))
  const inRange = (n) => (min == null || n >= min) && (max == null || n <= max)
  const typed = (raw) => {
    setText(raw)
    const n = num(raw)
    if ((n != null && inRange(n)) || (raw === '' && allowEmpty)) onChange(raw)
  }
  const leave = () => {
    const n = num(text)
    if (n == null) return setText(allowEmpty ? '' : String(value))
    const fixed = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(step) >= 1 ? Math.round(n) : n))
    setText(String(fixed))
    onChange(String(fixed))
  }
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-in">
        <input type="number" inputMode="decimal" step={step} min={min} max={max} value={text} onChange={(e) => typed(e.target.value)} onBlur={leave} />
        <em>{unit}</em>
      </span>
    </label>
  )
}

/** "My berth": charted depth + draft → depth of water now and clearance under the keel. */
export function Berth({ my, events, now, heightNow, observed }) {
  const [charted, setCharted] = useState(my.berth ? String(fromFeet(my.berth.charted)) : '')
  const [draft, setDraft] = useState(my.berth ? String(fromFeet(my.berth.draft)) : '')
  const time = (d) => formatAtStation(d, offsetAt(events, d), { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const update = (c, d) => {
    setCharted(c); setDraft(d)
    if (num(c) != null && num(d) != null && num(d) >= 0) my.setBerth({ charted: toFeet(num(c)), draft: toFeet(num(d)) })
  }
  const b = my.berth ? berthNow(my.berth, events, now, heightNow) : null
  // A simple cross-section: seabed, water, and the boat's keel.
  const scale = b ? 46 / Math.max(b.depth, my.berth.draft, 1) : 0
  return (
    <section className="panel berth">
      <div className="panel-head">
        <h2><Icon name="anchor" /> My berth</h2>
        <Explain id="berth" />
      </div>
      <div className="fields">
        <Field allowEmpty label="Charted depth" value={charted} onChange={(v) => update(v, draft)} />
        <Field allowEmpty label="Boat's draft" value={draft} min={0} onChange={(v) => update(charted, v)} />
      </div>
      {!b && <p className="hint">Enter the depth printed on the chart at your dock, mooring or ramp, and your draft, to see the water you have there.</p>}
      {b && (
        <>
          <div className="berth-now">
            <svg viewBox="0 0 120 70" className="berth-pic" role="img" aria-label={`Depth of water at your berth ${ft(b.depth)}; ${b.afloat ? `${ft(b.clearance)} under the keel` : 'aground'}.`}>
              <rect x="0" y={Math.max(4, 62 - Math.max(0, b.depth) * scale)} width="120" height={Math.min(58, Math.max(0, b.depth) * scale)} className="berth-water" />
              <rect x="0" y="62" width="120" height="8" className="berth-bed" />
              <path d={`M38 ${62 - Math.max(0, b.depth) * scale - 7} h44 l-7 ${7 + my.berth.draft * scale} h-30 z`} className={`berth-hull ${b.clearance > 1 ? 'ok' : b.afloat ? 'thin' : 'aground'}`} transform={b.afloat ? undefined : `translate(0 ${-b.clearance * scale})`} />
            </svg>
            <div>
              <div className="berth-depth">{ft(b.depth)}</div>
              <div className="berth-sub">depth now ({observed ? 'observed' : 'predicted'} tide)</div>
              <div className={`berth-ukc ${b.clearance > 1 ? 'ok' : b.afloat ? 'thin' : 'aground'}`}>
                {b.afloat ? `${ft(b.clearance)} under the keel` : `Aground by ${ft(-b.clearance)}`}
              </div>
            </div>
          </div>
          <p className="berth-next">
            {b.change
              ? b.afloat ? `▼ Predicted to touch bottom ${time(b.change)}.` : `▲ Predicted to float ${time(b.change)}.`
              : b.afloat ? '✓ Afloat at every state of tide for the next 2 days, by the predictions.' : 'Not predicted to float in the next 2 days.'}
            {b.least && b.least.clearance > 0 && ` Least water in 24 h: ${ft(b.least.depth)} at ${time(b.least.time)} (${ft(b.least.clearance)} under the keel).`}
          </p>
          <p className="hint small-print">Charted depth plus height of tide. Wind and weather shift the real level, and bottoms silt up: keep a margin.</p>
        </>
      )}
    </section>
  )
}

/** "By your rules": three lights and the rules behind them. */
export function Rules({ my, events, now, heightNow }) {
  if (!my.rules) return null
  const time = (d) => formatAtStation(d, offsetAt(events, d), { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const set = (id, key, raw, convert = (v) => v) => {
    if (num(raw) == null) return
    my.setRules({ ...my.rules, [id]: { [key]: convert(num(raw)) } })
  }
  return (
    <section className="panel rules">
      <div className="panel-head">
        <h2>By your rules</h2>
        <Explain id="goodtime" />
      </div>
      <ul className="rule-list">
        {RULES.map((r) => {
          const rule = my.rules[r.id]
          const st = ruleStatus(r.id, rule, events, now, heightNow)
          return (
            <li key={r.id} className={`rule ${tone(st, now)}`}>
              <span className="rule-dot" aria-hidden="true" />
              <span className="rule-main">
                <strong><Icon name={r.icon} /> {r.name}</strong>
                <small>{statusText(st, time)}</small>
              </span>
              {r.id === 'turn'
                ? <Field key={`${r.id}`} label="Within" value={rule.minutes} step="5" min={5} max={180} unit="min" onChange={(v) => set('turn', 'minutes', v, (m) => Math.min(180, Math.max(5, Math.round(m))))} />
                : <Field key={`${r.id}-${hUnit()}`} label={r.id === 'launch' ? 'At least' : 'At most'} value={fromFeet(r.id === 'launch' ? rule.min : rule.max)} onChange={(v) => set(r.id, r.id === 'launch' ? 'min' : 'max', v, toFeet)} />}
            </li>
          )
        })}
      </ul>
      <p className="hint small-print">Lights show the state of the tide against your own figures, from the predictions. They are not a judgment that it is safe to go.</p>
    </section>
  )
}
