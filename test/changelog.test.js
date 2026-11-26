// Keeps the user-facing version history honest: every release must be written up.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CHANGELOG, CURRENT_VERSION } from '../src/changelog.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const parts = (v) => v.split('.').map(Number)
const newer = (a, b) => { // is version a newer than b?
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

describe('version history', () => {
  it('the newest entry is the version in package.json (bump both together)', () => {
    expect(CURRENT_VERSION).toBe(pkg.version)
  })
  it('entries are newest first, with valid versions and dates', () => {
    for (const [i, v] of CHANGELOG.entries()) {
      expect(v.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(v.date))).toBe(false)
      if (i > 0) {
        expect(newer(CHANGELOG[i - 1].version, v.version), `${CHANGELOG[i - 1].version} should be newer than ${v.version}`).toBe(true)
        expect(CHANGELOG[i - 1].date >= v.date, `${CHANGELOG[i - 1].version} is dated before ${v.version}`).toBe(true)
      }
    }
  })
  it('every version says what changed, in sentences a user can read', () => {
    for (const v of CHANGELOG) {
      expect(v.title.length, `${v.version} needs a title`).toBeGreaterThan(3)
      expect(v.changes.length, `${v.version} needs at least one change`).toBeGreaterThan(0)
      for (const c of v.changes) {
        expect(['new', 'improved', 'fixed']).toContain(c.kind)
        expect(c.text.length, `${v.version}: change text too short`).toBeGreaterThan(20)
        expect(c.text.trim().endsWith('.'), `${v.version}: "${c.text.slice(0, 30)}…" should end with a full stop`).toBe(true)
      }
    }
  })
})
