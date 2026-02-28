import { Router } from 'express'
import db from '../db.js'

const router = Router()

const listByEvent = db.prepare(`SELECT * FROM groups WHERE event_id = ? ORDER BY created_at DESC`)
const listAll = db.prepare(`SELECT * FROM groups ORDER BY created_at DESC`)
const getMembers = db.prepare(`SELECT member_name, user_id FROM group_members WHERE group_id = ? ORDER BY joined_at`)
const insertGroup = db.prepare(`INSERT INTO groups (event_id, name, description, creator, creator_id) VALUES (?, ?, ?, ?, ?)`)
const insertMember = db.prepare(`INSERT OR IGNORE INTO group_members (group_id, member_name, user_id) VALUES (?, ?, ?)`)
const getGroup = db.prepare(`SELECT * FROM groups WHERE id = ?`)
const getExistingGroup = db.prepare(`SELECT id FROM groups WHERE event_id = ? AND creator_id = ?`)
const getMemberByUser = db.prepare(`SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`)
const deleteGroup = db.prepare(`DELETE FROM groups WHERE id = ?`)
const deleteMember = db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`)
const countMembers = db.prepare(`SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?`)

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in with Google to use groups' })
  next()
}

function attachMembers(group, currentUserId = null) {
  const memberRows = getMembers.all(group.id)
  const members = memberRows.map((r) => r.member_name)
  const isOwner = currentUserId != null && group.creator_id === currentUserId
  const hasJoined = currentUserId != null && memberRows.some((r) => r.user_id === currentUserId)
  return {
    id: group.id,
    eventId: group.event_id,
    name: group.name,
    description: group.description,
    creator: group.creator,
    creatorId: group.creator_id,
    members,
    isOwner,
    hasJoined,
    createdAt: group.created_at,
  }
}

router.get('/', (req, res) => {
  try {
    const { eventId } = req.query
    const rows = eventId ? listByEvent.all(eventId) : listAll.all()
    const userId = req.user?.id ?? null
    res.json(rows.map((g) => attachMembers(g, userId)))
  } catch (err) {
    console.error('GET /api/groups', err)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

router.post('/', requireAuth, (req, res) => {
  try {
    const { eventId, name, description } = req.body
    if (!eventId || !name) {
      return res.status(400).json({ error: 'eventId and name are required' })
    }

    const existing = getExistingGroup.get(eventId, req.user.id)
    if (existing) {
      return res.status(409).json({ error: 'You already created a group for this event' })
    }

    const result = insertGroup.run(eventId, name, description || '', req.user.name, req.user.id)
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

    insertMember.run(group.id, req.user.name, req.user.id)
    res.json(attachMembers(getGroup.get(group.id), req.user.id))
  } catch (err) {
    console.error('POST /api/groups/:id/join', err)
    res.status(500).json({ error: 'Failed to join group' })
  }
})

// DELETE /api/groups/:id — owner deletes their group
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

// POST /api/groups/:id/leave — member leaves a group; auto-deletes if empty
router.post('/:id/leave', requireAuth, (req, res) => {
  try {
    const group = getGroup.get(req.params.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (group.creator_id === req.user.id) return res.status(403).json({ error: 'Owners must delete the group instead of leaving' })

    deleteMember.run(group.id, req.user.id)

    const remaining = countMembers.get(group.id).count
    if (remaining === 0) deleteGroup.run(group.id)

    res.json({ ok: true, deleted: remaining === 0 })
  } catch (err) {
    console.error('POST /api/groups/:id/leave', err)
    res.status(500).json({ error: 'Failed to leave group' })
  }
})

export default router
