import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT e.*,
        COALESCE(g.group_count, 0)::int AS group_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS group_count
        FROM groups
        GROUP BY event_id
      ) g ON g.event_id = e.id
      ORDER BY e.date ASC
    `)
    res.json(rows.map(formatEvent))
  } catch (err) {
    console.error('GET /api/events', err)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT e.*,
        COALESCE(g.group_count, 0)::int AS group_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS group_count
        FROM groups
        GROUP BY event_id
      ) g ON g.event_id = e.id
      WHERE e.id = $1
    `, [req.params.id])

    if (rows.length === 0) return res.status(404).json({ error: 'Event not found' })
    res.json(formatEvent(rows[0]))
  } catch (err) {
    console.error('GET /api/events/:id', err)
    res.status(500).json({ error: 'Failed to fetch event' })
  }
})

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
    price: parseFloat(row.price),
    category: row.category,
    tags: row.tags || [],
    groupCount: row.group_count,
  }
}

export default router
