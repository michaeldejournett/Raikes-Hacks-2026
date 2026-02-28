import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { eventId } = req.query
    let sql = `
      SELECT g.*,
        COALESCE(
          json_agg(gm.member_name ORDER BY gm.joined_at)
          FILTER (WHERE gm.member_name IS NOT NULL), '[]'
        ) AS members
      FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
    `
    const params = []

    if (eventId) {
      sql += ' WHERE g.event_id = $1'
      params.push(eventId)
    }

    sql += ' GROUP BY g.id ORDER BY g.created_at DESC'

    const { rows } = await query(sql, params)
    res.json(rows.map(formatGroup))
  } catch (err) {
    console.error('GET /api/groups', err)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { eventId, name, description, creator } = req.body
    if (!eventId || !name || !creator) {
      return res.status(400).json({ error: 'eventId, name, and creator are required' })
    }

    const { rows } = await query(
      `INSERT INTO groups (event_id, name, description, creator)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [eventId, name, description || '', creator]
    )
    const group = rows[0]

    await query(
      'INSERT INTO group_members (group_id, member_name) VALUES ($1, $2)',
      [group.id, creator]
    )

    res.status(201).json(formatGroup({ ...group, members: [creator] }))
  } catch (err) {
    console.error('POST /api/groups', err)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

router.post('/:id/join', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const groupCheck = await query('SELECT id FROM groups WHERE id = $1', [req.params.id])
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' })
    }

    await query(
      `INSERT INTO group_members (group_id, member_name)
       VALUES ($1, $2) ON CONFLICT (group_id, member_name) DO NOTHING`,
      [req.params.id, name]
    )

    const { rows } = await query(`
      SELECT g.*,
        COALESCE(
          json_agg(gm.member_name ORDER BY gm.joined_at)
          FILTER (WHERE gm.member_name IS NOT NULL), '[]'
        ) AS members
      FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      WHERE g.id = $1
      GROUP BY g.id
    `, [req.params.id])

    res.json(formatGroup(rows[0]))
  } catch (err) {
    console.error('POST /api/groups/:id/join', err)
    res.status(500).json({ error: 'Failed to join group' })
  }
})

function formatGroup(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    creator: row.creator,
    members: Array.isArray(row.members) ? row.members : [],
    createdAt: row.created_at,
  }
}

export default router
