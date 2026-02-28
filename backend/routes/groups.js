import { Router } from 'express'
import db from '../db.js'

const router = Router()

const listByEvent = db.prepare(`SELECT * FROM groups WHERE event_id = ? ORDER BY created_at DESC`)
const listAll     = db.prepare(`SELECT * FROM groups ORDER BY created_at DESC`)
const getMembers  = db.prepare(`SELECT id, member_name, email, phone, joined_at FROM group_members WHERE group_id = ? ORDER BY joined_at`)
const getMember   = db.prepare(`SELECT id FROM group_members WHERE group_id = ? AND member_name = ?`)
const getGroup    = db.prepare(`SELECT * FROM groups WHERE id = ?`)

const insertGroup = db.prepare(`
  INSERT INTO groups (event_id, name, description, creator, creator_email, creator_phone, capacity, meetup_details, vibe_tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertMember = db.prepare(`
  INSERT OR IGNORE INTO group_members (group_id, member_name, email, phone) VALUES (?, ?, ?, ?)
`)
const deleteMember = db.prepare(`DELETE FROM group_members WHERE group_id = ? AND member_name = ?`)
const deleteGroup  = db.prepare(`DELETE FROM groups WHERE id = ?`)

const listMessages  = db.prepare(`SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at ASC`)
const insertMessage = db.prepare(`INSERT INTO group_messages (group_id, author, body) VALUES (?, ?, ?)`)

function safeParse(raw, fallback = []) {
  try { return JSON.parse(raw || JSON.stringify(fallback)) } catch { return fallback }
}

function attachMembers(group, revealContact = false) {
  const rows = getMembers.all(group.id)
  const memberCount = rows.length
  const capacity = group.capacity || 0
  const isFull = capacity > 0 && memberCount >= capacity

  const members = rows.map(r => {
    const m = { name: r.member_name }
    if (revealContact) {
      m.email = r.email || ''
      m.phone = r.phone || ''
    }
    return m
  })

  return {
    id: group.id,
    eventId: group.event_id,
    name: group.name,
    description: group.description,
    creator: group.creator,
    creatorEmail: revealContact ? (group.creator_email || '') : '',
    creatorPhone: revealContact ? (group.creator_phone || '') : '',
    capacity,
    memberCount,
    isFull,
    status: isFull ? 'full' : 'open',
    meetupDetails: group.meetup_details || '',
    vibeTags: safeParse(group.vibe_tags),
    members,
    createdAt: group.created_at,
  }
}

router.get('/', (req, res) => {
  try {
    const { eventId, viewer } = req.query
    const rows = eventId ? listByEvent.all(eventId) : listAll.all()
    res.json(rows.map(g => {
      const isMember = viewer && (
        g.creator === viewer ||
        getMember.get(g.id, viewer)
      )
      return attachMembers(g, !!isMember)
    }))
  } catch (err) {
    console.error('GET /api/groups', err)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

router.post('/', (req, res) => {
  try {
    const { eventId, name, description, creator, email, phone, capacity, meetupDetails, vibeTags } = req.body
    if (!eventId || !name || !creator) {
      return res.status(400).json({ error: 'eventId, name, and creator are required' })
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'At least one contact method (email or phone) is required' })
    }

    const cap = Math.max(0, parseInt(capacity) || 0)
    const tags = JSON.stringify(Array.isArray(vibeTags) ? vibeTags : [])

    const result = insertGroup.run(
      eventId, name, description || '', creator,
      email || '', phone || '', cap, meetupDetails || '', tags
    )
    const groupId = result.lastInsertRowid
    insertMember.run(groupId, creator, email || '', phone || '')

    const group = getGroup.get(groupId)
    res.status(201).json(attachMembers(group, true))
  } catch (err) {
    console.error('POST /api/groups', err)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

router.post('/:id/join', (req, res) => {
  try {
    const { name, email, phone } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!email && !phone) {
      return res.status(400).json({ error: 'At least one contact method (email or phone) is required' })
    }

    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const currentCount = getMembers.all(group.id).length
    if (group.capacity > 0 && currentCount >= group.capacity) {
      return res.status(409).json({ error: 'Group is full' })
    }

    insertMember.run(group.id, name, email || '', phone || '')
    res.json(attachMembers(getGroup.get(group.id), true))
  } catch (err) {
    console.error('POST /api/groups/:id/join', err)
    res.status(500).json({ error: 'Failed to join group' })
  }
})

router.post('/:id/leave', (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    if (group.creator === name) {
      deleteGroup.run(group.id)
      return res.json({ deleted: true })
    }

    deleteMember.run(group.id, name)
    res.json(attachMembers(getGroup.get(group.id), false))
  } catch (err) {
    console.error('POST /api/groups/:id/leave', err)
    res.status(500).json({ error: 'Failed to leave group' })
  }
})

// Single group by ID (for share links)
router.get('/:id', (req, res) => {
  try {
    const { viewer } = req.query
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const isMember = viewer && (
      group.creator === viewer || getMember.get(group.id, viewer)
    )
    res.json(attachMembers(group, !!isMember))
  } catch (err) {
    console.error('GET /api/groups/:id', err)
    res.status(500).json({ error: 'Failed to fetch group' })
  }
})

// Messages
router.get('/:id/messages', (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const rows = listMessages.all(group.id)
    res.json(rows.map(r => ({
      id: r.id,
      author: r.author,
      body: r.body,
      createdAt: r.created_at,
    })))
  } catch (err) {
    console.error('GET /api/groups/:id/messages', err)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

router.post('/:id/messages', (req, res) => {
  try {
    const { author, body } = req.body
    if (!author || !body?.trim()) {
      return res.status(400).json({ error: 'author and body are required' })
    }

    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    insertMessage.run(group.id, author, body.trim())

    const rows = listMessages.all(group.id)
    res.status(201).json(rows.map(r => ({
      id: r.id,
      author: r.author,
      body: r.body,
      createdAt: r.created_at,
    })))
  } catch (err) {
    console.error('POST /api/groups/:id/messages', err)
    res.status(500).json({ error: 'Failed to post message' })
  }
})

export default router
