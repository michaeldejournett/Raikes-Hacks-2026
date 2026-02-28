import { Router } from 'express'
import db from '../db.js'

const router = Router()

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

router.get('/', (_req, res) => {
  try {
    const rows = listEvents.all()
    res.json(rows.map(formatEvent))
  } catch (err) {
    console.error('GET /api/events', err)
    res.status(500).json({ error: 'Failed to fetch events' })
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
