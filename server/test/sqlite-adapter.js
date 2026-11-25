// Stand-in for the Durable Object SQLite API (ctx.storage.sql), backed by node:sqlite.
import { DatabaseSync } from 'node:sqlite'

export function memorySql() {
  const db = new DatabaseSync(':memory:')
  return {
    exec(query, ...params) {
      if (params.length === 0 && query.trim().split(';').filter((s) => s.trim()).length > 1) {
        db.exec(query)
        return [][Symbol.iterator]()
      }
      const stmt = db.prepare(query)
      if (/^\s*(SELECT|WITH)/i.test(query)) return stmt.all(...params)[Symbol.iterator]()
      stmt.run(...params)
      return [][Symbol.iterator]()
    },
  }
}
