// Share the tide: a picture card plus a link where the device supports it, otherwise
// the link and a line of text, otherwise the link is copied.
import { useState } from 'react'

/** Draw a simple card (no outside images, so it works offline). */
function drawCard({ title, big, state, lines, footer }) {
  const c = document.createElement('canvas')
  c.width = 1080; c.height = 1080
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, 1080)
  sky.addColorStop(0, '#5db8ee'); sky.addColorStop(0.55, '#d6f0ff')
  g.fillStyle = sky; g.fillRect(0, 0, 1080, 1080)
  // water with a wavy top
  const sea = g.createLinearGradient(0, 600, 0, 1080)
  sea.addColorStop(0, '#3aa0e6'); sea.addColorStop(1, '#155e9e')
  g.fillStyle = sea
  g.beginPath(); g.moveTo(0, 640)
  for (let x = 0; x <= 1080; x += 90) { g.quadraticCurveTo(x + 22, 615, x + 45, 640); g.quadraticCurveTo(x + 67, 665, x + 90, 640) }
  g.lineTo(1080, 1080); g.lineTo(0, 1080); g.closePath(); g.fill()
  const font = (px, weight = 700) => { g.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` }
  g.fillStyle = '#12263a'; g.textAlign = 'center'
  font(54); g.fillText(title.length > 34 ? `${title.slice(0, 33)}…` : title, 540, 130)
  font(210, 800); g.fillText(big, 540, 400)
  font(64); g.fillText(state, 540, 510)
  g.fillStyle = '#fff'
  font(52, 600)
  lines.forEach((l, i) => g.fillText(l, 540, 770 + i * 78))
  font(36, 500); g.globalAlpha = 0.9; g.fillText(footer, 540, 1020)
  return new Promise((res) => c.toBlob(res, 'image/png'))
}

export default function Share({ card, text, url }) {
  const [note, setNote] = useState('')
  const flash = (m) => { setNote(m); setTimeout(() => setNote(''), 2500) }
  const share = async () => {
    try {
      if (navigator.share) {
        let files
        try {
          const blob = await drawCard(card)
          const file = blob && new File([blob], 'tide.png', { type: 'image/png' })
          if (file && navigator.canShare?.({ files: [file] })) files = [file]
        } catch { /* share without the picture */ }
        await navigator.share({ title: 'Tidely', text, url, ...(files ? { files } : {}) })
        return
      }
      await navigator.clipboard.writeText(`${text}\n${url}`)
      flash('Copied')
    } catch (e) {
      if (e?.name === 'AbortError') return // the user closed the share sheet
      flash('Couldn’t share')
    }
  }
  return (
    <button type="button" className="star share" onClick={share} aria-label="Share this tide">
      {note ? <span className="share-note" role="status">{note}</span> : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V3M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
      )}
    </button>
  )
}
