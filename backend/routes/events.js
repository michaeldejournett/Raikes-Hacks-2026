import { Router } from 'express'
import db from '../db.js'

const router = Router()

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8080'
const NO_LLM = process.env.OLLAMA_URL ? 'false' : 'true'  // skip Ollama if not configured

const listEvents = db.prepare(`
  SELECT e.*,
    (SELECT COUNT(*) FROM groups g WHERE g.event_id = e.id) AS groupCount
  FROM events e
  ORDER BY e.date ASC
`)

const getEvent = db.prepare(`
  SELECT e.*,
    (SELECT COUNT(*) FROM groups g WHERE g.event_id = e.id) AS groupCount
  FROM events e
  WHERE e.id = ?
`)

const FIELD_WEIGHTS = { name: 4, venue: 2, category: 2, description: 1, tags: 1 }

router.get('/', (_req, res) => {
  try {
    const rows = listEvents.all()
    res.json(rows.map(formatEvent))
  } catch (err) {
    console.error('GET /api/events', err)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q || !q.trim()) return res.json({ terms: [], llmUsed: false, results: [] })

    const rawTerms = q.toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 1) || []
    let terms = rawTerms
    let llmUsed = false

    try {
      const resp = await fetch(
        `${FASTAPI_URL}/search?${new URLSearchParams({ q, top: '1', no_llm: NO_LLM })}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (resp.ok) {
        const data = await resp.json()
        if (data.terms?.length) {
          terms = data.terms
          llmUsed = true
        }
      }
    } catch { /* FastAPI unavailable — use raw terms */ }

    const allRows = listEvents.all()
    const scored = []

    for (const row of allRows) {
      const ev = formatEvent(row)
      let score = 0
      const fields = {
        name: (ev.name || '').toLowerCase(),
        description: (ev.description || '').toLowerCase(),
        venue: (ev.venue || '').toLowerCase(),
        category: (ev.category || '').toLowerCase(),
        tags: (ev.tags || []).join(' ').toLowerCase(),
      }

      for (const term of terms) {
        for (const [field, text] of Object.entries(fields)) {
          if (text.includes(term)) score += FIELD_WEIGHTS[field] || 1
        }
      }

      if (score > 0) scored.push({ ...ev, score })
    }

    scored.sort((a, b) => b.score - a.score)

    res.json({ terms, llmUsed, count: scored.length, results: scored })
  } catch (err) {
    console.error('GET /api/events/search', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

router.get('/:id', (req, res) => {
  try {
    const row = getEvent.get(req.params.id)
    if (!row) return res.status(404).json({ error: 'Event not found' })
    res.json(formatEvent(row))
  } catch (err) {
    console.error('GET /api/events/:id', err)
    res.status(500).json({ error: 'Failed to fetch event' })
  }
})

function safeParseTags(raw) {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

function formatEvent(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    date: row.date,
    time: row.time,
    endDate: row.end_date,
    endTime: row.end_time,
    location: row.location,
    venue: row.venue,
    price: row.price,
    category: row.category,
    tags: safeParseTags(row.tags),
    groupCount: row.groupCount,
    url: row.url || null,
    imageUrl: row.image_url || null,
  }
}

export default router
