import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import db from '../db.js'
import { notifyGroupMembers } from './notifications.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${crypto.randomUUID()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only images are allowed'))
  },
})

const router = Router()

const listByEvent = db.prepare(`SELECT * FROM groups WHERE event_id = ? ORDER BY created_at DESC`)
const listAll     = db.prepare(`SELECT * FROM groups ORDER BY created_at DESC`)
const getMembers  = db.prepare(`SELECT gm.id, gm.member_name, gm.user_id, gm.joined_at, u.email, u.picture FROM group_members gm LEFT JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ? ORDER BY gm.joined_at`)
const getMemberByUser = db.prepare(`SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`)
const getGroup    = db.prepare(`SELECT * FROM groups WHERE id = ?`)
const getExistingGroup = db.prepare(`SELECT id FROM groups WHERE event_id = ? AND creator_id = ?`)

const insertGroup = db.prepare(`
  INSERT INTO groups (event_id, name, description, creator, creator_id, capacity, meetup_details, vibe_tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertMember = db.prepare(`
  INSERT OR IGNORE INTO group_members (group_id, member_name, user_id) VALUES (?, ?, ?)
`)
const deleteMember = db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`)
const deleteGroup  = db.prepare(`DELETE FROM groups WHERE id = ?`)
const countMembers = db.prepare(`SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?`)

const listMessages  = db.prepare(`SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at ASC`)
const insertMessage = db.prepare(`INSERT INTO group_messages (group_id, author, body, image_url) VALUES (?, ?, ?, ?)`)

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in with Google to use groups' })
  next()
}

function safeParse(raw, fallback = []) {
  try { return JSON.parse(raw || JSON.stringify(fallback)) } catch { return fallback }
}

function attachMembers(group, currentUserId = null) {
  const rows = getMembers.all(group.id)
  const memberCount = rows.length
  const capacity = group.capacity || 0
  const isFull = capacity > 0 && memberCount >= capacity
  const isOwner = currentUserId != null && group.creator_id === currentUserId
  const hasJoined = currentUserId != null && rows.some(r => r.user_id === currentUserId)

  const members = rows.map(r => {
    const m = { name: r.member_name }
    if (hasJoined || isOwner) {
      m.email = r.email || ''
      m.picture = r.picture || ''
    }
    return m
  })

  return {
    id: group.id,
    eventId: group.event_id,
    name: group.name,
    description: group.description,
    creator: group.creator,
    creatorId: group.creator_id,
    capacity,
    memberCount,
    isFull,
    status: isFull ? 'full' : 'open',
    meetupDetails: group.meetup_details || '',
    vibeTags: safeParse(group.vibe_tags),
    members,
    isOwner,
    hasJoined,
    createdAt: group.created_at,
  }
}

const listMyGroups = db.prepare(`
  SELECT g.*, e.name AS event_name
  FROM groups g
  JOIN group_members gm ON gm.group_id = g.id
  JOIN events e ON e.id = g.event_id
  WHERE gm.user_id = ?
  ORDER BY gm.joined_at DESC
`)

router.get('/mine', requireAuth, (req, res) => {
  try {
    const rows = listMyGroups.all(req.user.id)
    res.json(rows.map(g => ({
      ...attachMembers(g, req.user.id),
      eventName: g.event_name,
    })))
  } catch (err) {
    console.error('GET /api/groups/mine', err)
    res.status(500).json({ error: 'Failed to fetch your groups' })
  }
})

router.get('/', (req, res) => {
  try {
    const { eventId } = req.query
    const rows = eventId ? listByEvent.all(eventId) : listAll.all()
    const userId = req.user?.id ?? null
    res.json(rows.map(g => attachMembers(g, userId)))
  } catch (err) {
    console.error('GET /api/groups', err)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

router.post('/', requireAuth, (req, res) => {
  try {
    const { eventId, name, description, capacity, meetupDetails, vibeTags } = req.body
    if (!eventId || !name) {
      return res.status(400).json({ error: 'eventId and name are required' })
    }

    const existing = getExistingGroup.get(eventId, req.user.id)
    if (existing) {
      return res.status(409).json({ error: 'You already created a group for this event' })
    }

    const cap = Math.max(0, parseInt(capacity) || 0)
    const tags = JSON.stringify(Array.isArray(vibeTags) ? vibeTags : [])

    const result = insertGroup.run(
      eventId, name, description || '', req.user.name, req.user.id,
      cap, meetupDetails || '', tags
    )
    const groupId = result.lastInsertRowid
    insertMember.run(groupId, req.user.name, req.user.id)

    const group = getGroup.get(groupId)
    res.status(201).json(attachMembers(group, req.user.id))
  } catch (err) {
    console.error('POST /api/groups', err)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

router.post('/:id/join', requireAuth, (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    if (group.creator_id === req.user.id) {
      return res.status(403).json({ error: "You can't join your own group" })
    }

    const alreadyMember = getMemberByUser.get(group.id, req.user.id)
    if (alreadyMember) {
      return res.status(409).json({ error: 'You already joined this group' })
    }

    const currentCount = countMembers.get(group.id).count
    if (group.capacity > 0 && currentCount >= group.capacity) {
      return res.status(409).json({ error: 'Group is full' })
    }

    insertMember.run(group.id, req.user.name, req.user.id)
    notifyGroupMembers(group.id, req.user.id, 'join', req.user.name, group.name)
    res.json(attachMembers(getGroup.get(group.id), req.user.id))
  } catch (err) {
    console.error('POST /api/groups/:id/join', err)
    res.status(500).json({ error: 'Failed to join group' })
  }
})

// Owner deletes their group
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (group.creator_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can delete it' })

    deleteGroup.run(group.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/groups/:id', err)
    res.status(500).json({ error: 'Failed to delete group' })
  }
})

// Member leaves a group; auto-deletes if empty
router.post('/:id/leave', requireAuth, (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (group.creator_id === req.user.id) return res.status(403).json({ error: 'Owners must delete the group instead of leaving' })

    deleteMember.run(group.id, req.user.id)
    notifyGroupMembers(group.id, req.user.id, 'leave', req.user.name, group.name)

    const remaining = countMembers.get(group.id).count
    if (remaining === 0) deleteGroup.run(group.id)

    res.json({ ok: true, deleted: remaining === 0 })
  } catch (err) {
    console.error('POST /api/groups/:id/leave', err)
    res.status(500).json({ error: 'Failed to leave group' })
  }
})

// Single group by ID (for share links)
router.get('/:id', (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    const userId = req.user?.id ?? null
    res.json(attachMembers(group, userId))
  } catch (err) {
    console.error('GET /api/groups/:id', err)
    res.status(500).json({ error: 'Failed to fetch group' })
  }
})

function serializeMessages(groupId) {
  return listMessages.all(groupId).map(r => ({
    id: r.id,
    author: r.author,
    body: r.body,
    imageUrl: r.image_url || '',
    createdAt: r.created_at,
  }))
}

// Messages
router.get('/:id/messages', (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    res.json(serializeMessages(group.id))
  } catch (err) {
    console.error('GET /api/groups/:id/messages', err)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

router.post('/:id/messages', requireAuth, (req, res) => {
  try {
    const { body } = req.body
    if (!body?.trim()) {
      return res.status(400).json({ error: 'body is required' })
    }

    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    insertMessage.run(group.id, req.user.name, body.trim(), '')
    notifyGroupMembers(group.id, req.user.id, 'message', req.user.name, group.name, body.trim().slice(0, 100))

    res.status(201).json(serializeMessages(group.id))
  } catch (err) {
    console.error('POST /api/groups/:id/messages', err)
    res.status(500).json({ error: 'Failed to post message' })
  }
})

router.post('/:id/messages/image', requireAuth, upload.single('image'), (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (!req.file) return res.status(400).json({ error: 'No image provided' })

    const imageUrl = `/api/uploads/${req.file.filename}`
    const caption = (req.body.body || '').trim()

    insertMessage.run(group.id, req.user.name, caption, imageUrl)
    notifyGroupMembers(group.id, req.user.id, 'message', req.user.name, group.name, caption || '📷 Image')

    res.status(201).json(serializeMessages(group.id))
  } catch (err) {
    console.error('POST /api/groups/:id/messages/image', err)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

export default router
