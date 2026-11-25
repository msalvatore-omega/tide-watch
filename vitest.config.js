import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// App unit tests live in test/. The alerts server has its own tests (server/test, node:test).
export default defineConfig({
  plugins: [react()],
  test: { include: ['test/**/*.test.js'], environment: 'node' },
})
