import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import path from 'path'
import { fileURLToPath } from 'url'
import eventsRouter from './routes/events.js'
import groupsRouter from './routes/groups.js'
import notificationsRouter from './routes/notifications.js'
import authRouter, { passport } from './routes/auth.js'
import { insertNewEvents } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Trust Railway's reverse proxy so cookies work correctly over HTTPS
app.set('trust proxy', 1)

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
app.use(cors({ origin: allowedOrigin, credentials: true }))
app.use(express.json())

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',   // lax is correct — frontend and backend share the same domain
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}))

app.use(passport.initialize())
app.use(passport.session())

app.use('/api/auth', authRouter)
app.use('/api/events', eventsRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')))

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
