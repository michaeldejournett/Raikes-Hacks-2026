import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import eventsRouter from './routes/events.js'
import groupsRouter from './routes/groups.js'
import { insertNewEvents } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/events', eventsRouter)
app.use('/api/groups', groupsRouter)

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist')
  app.use(express.static(frontendDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// ── Periodic event refresh ────────────────────────────────────────────
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS || '3600000') // default 1 hour

async function refreshEventsFromApi() {
  const url = process.env.EVENTS_API_URL
  if (!url) return
  try {
    console.log('Refreshing events from API…')
    const res = await fetch(url)
    if (!res.ok) { console.error(`Events API returned ${res.status} — skipping refresh`); return }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) { console.error('Events API returned non-JSON — skipping refresh'); return }
    const data = await res.json()
    const added = insertNewEvents(data.events || [])
    console.log(`Refresh complete: ${added} new events added`)
  } catch (err) {
    console.error(`Event refresh failed: ${err.message}`)
  }
}

if (process.env.EVENTS_API_URL) {
  setInterval(refreshEventsFromApi, REFRESH_INTERVAL_MS)
  console.log(`Event refresh scheduled every ${REFRESH_INTERVAL_MS / 60000} minutes`)
}
