import { Router } from 'express'
import db from '../db.js'

const router = Router()

const listByEvent = db.prepare(`SELECT * FROM groups WHERE event_id = ? ORDER BY created_at DESC`)
const listAll = db.prepare(`SELECT * FROM groups ORDER BY created_at DESC`)
const getMembers = db.prepare(`SELECT member_name FROM group_members WHERE group_id = ? ORDER BY joined_at`)
const insertGroup = db.prepare(`INSERT INTO groups (event_id, name, description, creator) VALUES (?, ?, ?, ?)`)
const insertMember = db.prepare(`INSERT OR IGNORE INTO group_members (group_id, member_name) VALUES (?, ?)`)
const getGroup = db.prepare(`SELECT * FROM groups WHERE id = ?`)

function attachMembers(group) {
  const members = getMembers.all(group.id).map((r) => r.member_name)
  return {
    id: group.id,
    eventId: group.event_id,
    name: group.name,
    description: group.description,
    creator: group.creator,
    members,
    createdAt: group.created_at,
  }
}

router.get('/', (req, res) => {
  try {
    const { eventId } = req.query
    const rows = eventId ? listByEvent.all(eventId) : listAll.all()
    res.json(rows.map(attachMembers))
  } catch (err) {
    console.error('GET /api/groups', err)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

router.post('/', (req, res) => {
  try {
    const { eventId, name, description, creator } = req.body
    if (!eventId || !name || !creator) {
      return res.status(400).json({ error: 'eventId, name, and creator are required' })
    }

    const result = insertGroup.run(eventId, name, description || '', creator)
    const groupId = result.lastInsertRowid
    insertMember.run(groupId, creator)

    const group = getGroup.get(groupId)
    res.status(201).json(attachMembers(group))
  } catch (err) {
    console.error('POST /api/groups', err)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

router.post('/:id/join', (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    insertMember.run(group.id, name)
    res.json(attachMembers(getGroup.get(group.id)))
  } catch (err) {
    console.error('POST /api/groups/:id/join', err)
    res.status(500).json({ error: 'Failed to join group' })
  }
})

export default router
