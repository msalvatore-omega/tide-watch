import Icon from './components/Icon.jsx'
import { Component, useEffect, useRef, useState } from 'react'
import { fetchHiLo, fetchStationInfo } from './noaa.js'
import { tideNow, seriesAt, stationDate, formatStationTime, formatAtStation, formatCountdown, nmText, hwlw, hDiff, tempText, setClock24, isClock24, setMetric, isMetric, ft } from './tides.js'
import { useSixMinute, useConditions, useNearestLiveGauge, useOnline, liveNow, isSurge, diffText } from './live.js'
import { sunTimes, moonPhase } from './astro.js'
import { useFavorites } from './favorites.js'
import { useFloodLevels, useHistoryFacts, floodStage } from './history.js'
import HistoryFacts from './components/HistoryFacts.jsx'
import TideChart from './components/TideChart.jsx'
import StationPicker from './components/StationPicker.jsx'
import Instruments, { freshWeather, MoonDisc } from './components/Instruments.jsx'
import WhatsNew from './components/WhatsNew.jsx'
import WeekTable from './components/WeekTable.jsx'
import Planner from './components/Planner.jsx'
import Currents from './components/Currents.jsx'
import Glance from './components/Glance.jsx'
import AlertsPanel, { useSwingAlerts } from './components/AlertsPanel.jsx'
import { Explain, Glossary } from './components/Explain.jsx'
import Marine, { useMarine } from './components/Marine.jsx'
import { useMyWater, RuleLights, Berth, Rules } from './components/MyWater.jsx'
import Tour from './components/Tour.jsx'
import Share from './components/Share.jsx'
import { currentAlerts } from './nws.js'

const DEFAULT_STATION = '8574680' // Baltimore (Fort McHenry), MD
const STORAGE_KEY = 'tidewatch.station'
const MAX_READING_AGE_MS = 60 * 60e3 // older gauge readings aren't shown as "now"
const TABS = [
  { id: 'now', label: 'Now' },
  { id: 'week', label: 'Week' },
  { id: 'plan', label: 'Plan' },
  { id: 'currents', label: 'Currents' },
]

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, v) => { try { localStorage.setItem(key, v) } catch { /* ignore */ } }

/** If something unexpected breaks, show a way back instead of a blank page. */
class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    const home = () => { location.href = location.pathname }
    return (
      <main>
        <h1><Icon name="wave" /> Tidely</h1>
        <div className="error" role="alert">
          Something went wrong showing this page.
          <button className="link" onClick={home}>Start over</button>
        </div>
      </main>
    )
  }
}

export default function App() {
  return <ErrorBoundary><Tidely /></ErrorBoundary>
}

function Tidely() {
  const params = new URLSearchParams(location.search)
  const [stationId, setStationId] = useState(() => params.get('station') || read(STORAGE_KEY) || DEFAULT_STATION)
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'now'))
  // Loaded data is tagged with its station, so nothing from the previous station is
  // ever shown (or favorited) after switching.
  const [stationState, setStation] = useState(null)
  const [eventsState, setEvents] = useState(null)
  const station = stationState?.id === stationId ? stationState : null
  const events = eventsState?.stationId === stationId ? eventsState.events : null
  const lastRefetch = useRef(0)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [reloadKey, setReloadKey] = useState(0)
  const [badgeOpen, setBadgeOpen] = useState(undefined) // undefined = default (flood warning open)
  const favs = useFavorites()
  // 24-hour clock by default, as in tide tables; the choice is remembered.
  const [clock24, setClock] = useState(isClock24)
  const toggleClock = () => {
    setClock24(!clock24)
    setClock(!clock24)
    write('tidely.clock', clock24 ? '12' : '24')
  }
  // Feet and °F, or metres and °C. (Speeds stay in knots, pressure in millibars.)
  const [metric, setUnits] = useState(isMetric)
  const toggleUnits = () => {
    setMetric(!metric)
    setUnits(!metric)
    write('tidely.units', metric ? 'us' : 'metric')
  }
  const [tourRequest, setTourRequest] = useState(0)
  const online = useOnline()

  // Save favorites' predictions in the background so they're available offline.
  const favoriteIds = favs.favorites.map((f) => f.id).join(',')
  useEffect(() => {
    if (!online || !favoriteIds) return
    const timer = setTimeout(() => {
      for (const id of favoriteIds.split(',')) if (id !== stationId) fetchHiLo(id).catch(() => {})
    }, 5000)
    return () => clearTimeout(timer)
  }, [favoriteIds, online]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the clock every 30s so the picture and countdowns stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // High/low predictions (31 days) and station details.
  useEffect(() => {
    let cancelled = false
    setError('')
    // If the station's details can't be loaded (e.g. offline), fall back to the favorite's saved name.
    const saved = favs.favorites.find((f) => f.id === stationId)
    const fallback = { id: stationId, name: saved?.name ?? `Station ${stationId}`, state: saved?.state }
    Promise.all([fetchHiLo(stationId), fetchStationInfo(stationId).catch(() => fallback)])
      .then(([ev, info]) => {
        if (cancelled) return
        setEvents({ stationId, events: ev })
        setStation({ ...info, id: stationId })
        write(STORAGE_KEY, stationId)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [stationId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shareable URL: ?station=…&tab=…
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('station', stationId)
    url.searchParams.delete('mode') // old Predicted/Live links
    if (tab === 'now') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    history.replaceState(null, '', url)
  }, [stationId, tab])

  // Refetch once we're within a day of the end of the loaded predictions: at most once
  // an hour and only when online, so stale saved data can't cause a reload loop.
  useEffect(() => {
    if (!events || !online || now <= events.at(-1).time - 24 * 3600e3) return
    if (Date.now() - lastRefetch.current < 3600e3) return
    lastRefetch.current = Date.now()
    setReloadKey((k) => k + 1)
  }, [now, events, online])

  const swing = useSwingAlerts(events, now, stationId)
  const { surgeFeet } = swing.settings

  // Live gauge + exact 6-minute forecast, refreshed every 6 minutes. Used whenever available.
  const six = useSixMinute(stationId)
  const sixData = six.status === 'ok' ? six.data : null
  const hasGauge = sixData?.observed.length > 0
  const noGauge = sixData != null && !hasGauge
  const reading = hasGauge ? liveNow(sixData, now) : null
  const live = reading && reading.ageMs < MAX_READING_AGE_MS ? reading : null
  const nearestGauge = useNearestLiveGauge(station, noGauge)
  const weatherGauge = hasGauge
    ? { id: stationId, name: null }
    : nearestGauge ? { id: nearestGauge.id, name: `${nearestGauge.name} (${nmText(nearestGauge.miles)})` } : null
  const weather = useConditions(weatherGauge?.id ?? null)

  const wx = freshWeather(weather.status === 'ok' ? weather.data : null, now) // current conditions for the picture

  const tide = events ? tideNow(events, now) : null
  const marine = useMarine(station, online)
  const marineAlerts = marine?.alerts ? currentAlerts(marine.alerts, now) : []
  const my = useMyWater(stationId, events)
  const flood = useFloodLevels(stationId)
  const todayStart = tide ? new Date(Date.parse(`${stationDate(now, tide.offsetMs)}T00:00:00Z`) - tide.offsetMs) : null
  const historyFacts = useHistoryFacts({ stationId, enabled: Boolean(live), level: live?.height, observed: sixData?.observed, flood, todayStart, offsetMs: tide?.offsetMs })

  // Flood warning: water at flood level now, or a high tide in the next 24 hours forecast
  // to reach it (adding today's surge if the gauge is running above the forecast).
  let floodWarning = null
  if (flood && tide) {
    const surge = live?.diff > 0 ? live.diff : 0
    const nextHigh = events.find((e) => e.type === 'H' && e.time > now && e.time - now < 24 * 3600e3 && floodStage(e.height + surge, flood))
    if (live && floodStage(live.height, flood)) {
      floodWarning = { now: true, stage: floodStage(live.height, flood), height: live.height }
    } else if (nextHigh) {
      floodWarning = { event: nextHigh, stage: floodStage(nextHigh.height + surge, flood), height: nextHigh.height, withSurge: surge > 0 && !floodStage(nextHigh.height, flood) ? nextHigh.height + surge : null }
    }
  }
  const forecastNow = tide ? seriesAt(sixData?.predicted, now) ?? tide.height : null
  const hasCoords = station?.lat != null && tide

  // What the picture and "Right now" show: the gauge when it's live, else the forecast.
  let view = null
  if (tide) {
    if (live) {
      const min = Math.min(tide.min, live.height)
      const max = Math.max(tide.max, live.height)
      const rising = live.trend ? live.trend === 'rising' || (live.trend === 'steady' && tide.rising) : tide.rising
      const fraction = max === min ? 0.5 : (live.height - min) / (max - min)
      view = { height: live.height, rising, fraction, min, max }
    } else {
      const fraction = tide.max === tide.min ? 0.5 : Math.min(1, Math.max(0, (forecastNow - tide.min) / (tide.max - tide.min)))
      view = { ...tide, height: forecastNow, fraction }
    }
  }

  // Warnings ride on the picture as small badges; tapping one shows its detail.
  // A coastal-flood warning opens by itself.
  const badges = []
  if (floodWarning) {
    badges.push({
      id: 'flood',
      icon: 'wave',
      label: floodWarning.now ? `${cap(floodWarning.stage)} flood` : `Flood risk ${formatStationTime(floodWarning.event.local, { withDay: false })}`,
      detail: floodWarning.now
        ? `${cap(floodWarning.stage)} coastal flooding now: gauge reads ${ft(floodWarning.height)}; minor flood stage is ${ft(flood.minor)}.`
        : floodWarning.withSurge
          ? `${cap(floodWarning.stage)} coastal flooding possible. High water ${formatStationTime(floodWarning.event.local)}: predicted ${ft(floodWarning.height)}, about ${ft(floodWarning.withSurge)} if the water stays this far above prediction. Minor flood stage is ${ft(flood.minor)}.`
          : `${cap(floodWarning.stage)} coastal flooding possible. High water ${formatStationTime(floodWarning.event.local)} predicted ${ft(floodWarning.height)}; minor flood stage is ${ft(flood.minor)}.`,
    })
  }
  if (isSurge(live, surgeFeet)) {
    badges.push({
      id: 'surge',
      icon: 'wind',
      label: hDiff(live.diff),
      detail: `Water is ${diffText(live.diff)}: observed ${ft(live.height)}, predicted ${ft(live.predicted)}. ${live.diff > 0 ? 'Wind set-up or storm surge.' : 'Offshore wind is blowing the water out.'}`,
    })
  }
  const bigRange = tide ? swing.alerts?.find((a) => a.from.time - now < 24 * 3600e3) : null
  if (bigRange) {
    badges.push({
      id: 'range',
      icon: 'warning',
      label: bigRange.inProgress ? 'Large range' : `Large range ${formatCountdown(bigRange.from.time - now)}`,
      detail: `Large tidal range${bigRange.inProgress ? ' under way' : ''}: ${bigRange.rising ? 'rise' : 'fall'} of ${ft(bigRange.size)} to ${hwlw(bigRange.to)} ${formatStationTime(bigRange.to.local)}, ${bigRange.ratio.toFixed(1)}× the usual range.`,
    })
  }
  for (const a of marineAlerts) {
    const text = a.description.replace(/\n(?!\n)/g, ' ').replace(/\s{2,}/g, ' ').trim()
    badges.push({
      id: `wx-${a.id}`,
      kind: a.rank >= 3 ? 'wx severe' : 'wx',
      icon: 'flag',
      label: a.event,
      detail: `${a.event} ${a.onset && a.onset > now ? `from ${formatAtStation(a.onset, tide.offsetMs, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : `until ${formatAtStation(a.ends, tide.offsetMs, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`} (National Weather Service). ${text.length > 420 ? `${text.slice(0, 420)}…` : text}`,
    })
  }
  const moon = moonPhase(now)
  const isStand = live?.trend === 'steady'
  const heroState = isStand ? { glyph: '◆', text: 'Stand', cls: 'stand' } : view?.rising ? { glyph: '▲', text: 'Flood tide', cls: 'flood' } : { glyph: '▼', text: 'Ebb tide', cls: 'ebb' }
  const shownBadge = badges.find((b) => b.id === (badgeOpen === undefined ? 'flood' : badgeOpen)) ?? null

  const gaugeNote = live ? null
    : noGauge ? (nearestGauge
      ? <>No tide gauge at this station · <button type="button" className="link inline" onClick={() => setStationId(nearestGauge.id)}>{nearestGauge.name} has one ({nmText(nearestGauge.miles)})</button></>
      : 'No tide gauge at this station')
    : reading ? `${online ? 'Gauge not reporting' : 'Saved data'} (last observation ${Math.round(reading.ageMs / 3600e3)} h ago)`
    : !online ? 'Offline: showing predictions'
    : six.status === 'error' ? 'Tide gauge unreachable'
    : six.status === 'loading' ? 'Reading the tide gauge…'
    : null

  const stationLabel = station ? `${station.name}${station.state ? `, ${station.state}` : ''}` : 'Loading…'

  return (
    <main>
      <header>
        <h1><Icon name="wave" /> Tidely</h1>
        {!picking && (
          <div className="station-row">
            <button className="station" onClick={() => setPicking(true)} aria-label="Change station">
              <span className="station-name">{stationLabel}</span>
              <span className="change">▾</span>
            </button>
            {station && (
              <button
                type="button"
                className={favs.isFavorite(station.id) ? 'star on' : 'star'}
                onClick={() => favs.toggle(station)}
                aria-pressed={favs.isFavorite(station.id)}
                aria-label={favs.isFavorite(station.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                {favs.isFavorite(station.id) ? '★' : '☆'}
              </button>
            )}
            {station && tide && view && (
              <Share
                url={location.href}
                text={`${stationLabel}: height of tide ${ft(view.height)}, ${live?.trend === 'steady' ? 'at stand' : view.rising ? 'flooding' : 'ebbing'}. High water ${formatStationTime(tide.nextHigh.local)} (${ft(tide.nextHigh.height)}), low water ${formatStationTime(tide.nextLow.local)} (${ft(tide.nextLow.height)}).`}
                card={{
                  title: stationLabel,
                  big: ft(view.height),
                  state: live?.trend === 'steady' ? '◆ Stand' : view.rising ? '▲ Flood tide' : '▼ Ebb tide',
                  lines: [`▲ High water ${formatStationTime(tide.nextHigh.local)} · ${ft(tide.nextHigh.height)}`, `▼ Low water ${formatStationTime(tide.nextLow.local)} · ${ft(tide.nextLow.height)}`],
                  footer: `${live ? 'Observed' : 'Predicted'} ${formatAtStation(now, tide.offsetMs)} · Tidely · NOAA data`,
                }}
              />
            )}
          </div>
        )}
      </header>

      {!picking && favs.favorites.length > 0 && (
        <nav className="fav-row no-print" aria-label="Favorite stations">
          {favs.favorites.map((f) => (
            <button key={f.id} type="button" className={f.id === stationId ? 'chip on' : 'chip'} onClick={() => setStationId(f.id)}>
              {f.name.split(',')[0]}
            </button>
          ))}
        </nav>
      )}

      {picking && (
        <StationPicker
          favorites={favs.favorites}
          isFavorite={favs.isFavorite}
          onToggleFavorite={favs.toggle}
          onPick={(id) => { setStationId(id); setPicking(false) }}
          onCancel={() => setPicking(false)}
          near={station?.lat != null ? { lat: station.lat, lng: station.lng } : null}
        />
      )}

      <div className="tabs no-print" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="tab-panel" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!online && (
        <div className="notice offline" role="status">
          <Icon name="offline" /> <strong>You're offline.</strong> Showing saved tide predictions{error ? '' : ' for this station'}; gauge observations and weather will return when you reconnect.
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {online ? `Couldn't load tides: ${error}` : 'This station isn\'t saved for offline use. Open it once while connected (or add it to favorites) to save it.'}
          <button className="link" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!error && events && !tide && (
        <div className="error" role="alert">
          The saved tide predictions for this station have run out. {online ? '' : 'Reconnect to load new ones.'}
          {online && <button className="link" onClick={() => setReloadKey((k) => k + 1)}>Reload</button>}
        </div>
      )}
      {!error && !events && <div className="skeleton" aria-busy="true">Checking the tides…</div>}

      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tide && view && tab === 'now' && (
        <>
          <section className="hero">
            <div className="hero-top">
              <div className="hero-height">{ft(view.height)}</div>
              <div className="hero-state">
                <strong className={heroState.cls}>{heroState.glyph} {heroState.text}</strong>
                <span>
                  {live
                    ? <>● observed {formatAtStation(live.time, tide.offsetMs)}{Math.abs(live.diff ?? 0) >= 0.05 ? ` · ${hDiff(live.diff)} on prediction` : ''}</>
                    : '○ predicted'}
                </span>
              </div>
              <div className="hero-moon" role="img" aria-label={`Moon: ${moon.name}, ${Math.round(moon.illumination * 100)} percent lit${moon.tides === 'spring' ? ', spring tides' : moon.tides === 'neap' ? ', neap tides' : ''}.`}>
                <MoonDisc moon={moon} size={40} />
                <small aria-hidden="true">{moon.tides === 'spring' ? 'springs' : moon.tides === 'neap' ? 'neaps' : `${Math.round(moon.illumination * 100)}%`}</small>
              </div>
              <Explain id="scene" />
            </div>
            <TideChart gauge events={events} now={now} predicted={sixData?.predicted} observed={hasGauge ? sixData.observed : null} flood={flood} />
            <div className="hero-next">
              {[tide.nextHigh, tide.nextLow].sort((x, y) => x.time - y.time).map((e) => (
                <div key={e.type} className={e.type === 'H' ? 'next high' : 'next low'}>
                  <span className="next-name">{e.type === 'H' ? '▲ High water' : '▼ Low water'}</span>
                  <span className="next-time">{formatStationTime(e.local, { withDay: false })}</span>
                  <span className="next-sub">{ft(e.height)} · {formatCountdown(e.time - now)}</span>
                </div>
              ))}
            </div>
            {wx && <Conditions wx={wx} source={weatherGauge?.name} />}
            {gaugeNote && <p className="dial-note">{gaugeNote}</p>}
          </section>

          {badges.length > 0 && (
            <section className="badge-wrap">
              <div className="scene-badges">
                {badges.map((b) => (
                  <button key={b.id} type="button" className={`scene-pill ${b.kind ?? b.id}${shownBadge?.id === b.id ? ' on' : ''}`} aria-expanded={shownBadge?.id === b.id} onClick={() => setBadgeOpen(shownBadge?.id === b.id ? null : b.id)}>
                    <Icon name={b.icon} /> {b.label}
                  </button>
                ))}
              </div>
              {shownBadge && <p className={`badge-detail ${shownBadge.kind ?? shownBadge.id}`} role={shownBadge.id === 'flood' ? 'alert' : 'status'}>{shownBadge.detail}</p>}
            </section>
          )}

          <div className="folds">
            {marine?.forecast.length > 0 && (
              <Fold icon="cloud" title="Marine forecast" hint={marine.forecast[0].name}>
                <Marine marine={marine} now={now} offsetMs={tide.offsetMs} />
              </Fold>
            )}
            <Fold icon="sun" title="Sun and moon" hint={moonPhase(now).name}>
              <Instruments
                now={now}
                sun={hasCoords ? sunTimes(now, station.lat, station.lng, tide.offsetMs) : null}
                moon={moonPhase(now)}
                offsetMs={tide.offsetMs}
              />
            </Fold>
            <Fold icon="rules" title="By your rules" hint="launch · fish · flats">
              <RuleLights my={my} events={events} now={now} heightNow={view.height} onOpen={() => setTab('plan')} />
            </Fold>
            <Fold icon="chat" title="Quick answers" hint="summary · weekend">
              <Glance
                key={stationId}
                station={station}
                online={online}
                now={now}
                events={events}
                tide={tide}
                live={live}
                forecastNow={forecastNow}
                alerts={swing.alerts}
                flood={flood}
                surgeFeet={surgeFeet}
                weather={weather.status === 'ok' ? weather.data : null}
              />
            </Fold>
            {live && <HistoryFacts history={historyFacts} flood={flood} now={now} offsetMs={tide.offsetMs} />}
            {station && (
              <Fold icon="range" title="Large ranges" hint={swing.alerts?.length ? `${swing.alerts.length} this week` : 'none this week'}>
                <AlertsPanel
                  station={station}
                  now={now}
                  {...swing}
                  reading={live}
                  liveStatus={live ? 'ok' : noGauge ? 'unavailable' : reading ? 'error' : six.status}
                />
              </Fold>
            )}
          </div>
        </>
      )}

      {tide && tab === 'week' && <WeekTable events={events} now={now} offsetMs={tide.offsetMs} station={station} alerts={swing.alerts} flood={flood} />}
      {tide && view && tab === 'plan' && (
        <>
          <Planner events={events} now={now} station={station} live={live} />
          <div className="folds">
            <Fold icon="anchor" title="My berth" hint={my.berth ? 'depth at your spot' : 'set your depth and draft'}>
              <Berth key={`berth-${stationId}-${metric}`} my={my} events={events} now={now} heightNow={view.height} observed={Boolean(live)} />
            </Fold>
            <Fold icon="rules" title="By your rules" hint="launch · fish · flats">
              <Rules key={`rules-${stationId}`} my={my} events={events} now={now} heightNow={view.height} />
            </Fold>
          </div>
        </>
      )}
      {tide && tab === 'currents' && <Currents key={stationId} events={events} now={now} station={station} wind={wx?.wind ?? null} />}
      </div>

      <footer>
        {tide && (
          <details className="about">
            <summary aria-label="About this data">ⓘ <span>{formatAtStation(now, tide.offsetMs)} station time</span></summary>
            <p>
              Heights in {metric ? 'metres' : 'feet'} above chart datum (MLLW). Times are the station's own.{' '}
              <a href={`https://tidesandcurrents.noaa.gov/stationhome.html?id=${stationId}`} target="_blank" rel="noreferrer">NOAA data</a>
              {hasGauge ? '; gauge observations are preliminary, every 6 minutes' : ''}. Not for navigation.
            </p>
            <div className="about-tools">
              <button type="button" className="link" onClick={toggleClock}><Icon name="clock" /> Use the {clock24 ? '12' : '24'}-hour clock</button>
              <button type="button" className="link" onClick={toggleUnits}><Icon name="ruler" /> Use {metric ? 'feet and °F' : 'metres and °C'}</button>
              <Glossary />
              <button type="button" className="link" onClick={() => setTourRequest((n) => n + 1)}><Icon name="tour" /> Show the tour</button>
            </div>
          </details>
        )}
        <WhatsNew />
        <Tour request={tourRequest} />
      </footer>
    </main>
  )
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** A row that opens: keeps the secondary panels out of the way until wanted. */
function Fold({ icon, title, hint, children }) {
  return (
    <details className="fold">
      <summary><Icon name={icon} size="1.3em" /> <strong>{title}</strong>{hint && <small>{hint}</small>}</summary>
      <div className="fold-body">{children}</div>
    </details>
  )
}

/** Present conditions at the gauge, on one line. */
function Conditions({ wx, source }) {
  const p = wx.pressure
  const trend = p?.change3h == null ? '' : p.change3h > 1 ? '↗' : p.change3h < -1 ? '↘' : '→'
  const said = [
    wx.wind && `Wind ${wx.wind.dir ?? ''} ${Math.round(wx.wind.knots)} knots`,
    wx.airTemp && `air ${tempText(wx.airTemp.f)}`,
    wx.waterTemp && `sea ${tempText(wx.waterTemp.f)}`,
    p && `barometer ${Math.round(p.mb)} millibars${trend === '↗' ? ', rising' : trend === '↘' ? ', falling' : ''}`,
  ].filter(Boolean).join(', ')
  return (
    <div className="conditions" role="img" aria-label={`${said}${source ? `. From ${source}` : ''}.`}>
      {wx.wind && (
        <span>
          {wx.wind.deg != null && (
            <svg viewBox="-10 -10 20 20" className="wx-arrow" aria-hidden="true" style={{ transform: `rotate(${wx.wind.deg + 180}deg)` }}>
              <line x1="0" y1="7" x2="0" y2="-3" /><polygon points="0,-9 -5,-1 5,-1" />
            </svg>
          )}
          <b>{wx.wind.dir} {Math.round(wx.wind.knots)} kt</b><small>wind</small>
        </span>
      )}
      {wx.airTemp && <span><b>{tempText(wx.airTemp.f)}</b><small>air</small></span>}
      {wx.waterTemp && <span><b>{tempText(wx.waterTemp.f)}</b><small>sea</small></span>}
      {p && <span><b>{Math.round(p.mb)} {trend}</b><small>mb</small></span>}
      {source && <em>{source}</em>}
    </div>
  )
}
