import { Router } from 'express'
import db from '../db.js'

const router = Router()

const getUnread = db.prepare(`
  SELECT n.*, g.event_id
  FROM notifications n
  LEFT JOIN groups g ON n.group_id = g.id
  WHERE n.user_id = ?
  ORDER BY n.created_at DESC
  LIMIT 50
`)
const markAllRead = db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`)
const markOneRead = db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
const unreadCount = db.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0`)

const groupMemberUserIds = db.prepare(`SELECT user_id FROM group_members WHERE group_id = ? AND user_id IS NOT NULL`)
const insertNotification = db.prepare(`
  INSERT INTO notifications (user_id, type, group_id, actor_name, group_name, body)
  VALUES (?, ?, ?, ?, ?, ?)
`)

export function notifyGroupMembers(groupId, excludeUserId, type, actorName, groupName, body = '') {
  const members = groupMemberUserIds.all(groupId)
  for (const m of members) {
    if (m.user_id === excludeUserId) continue
    insertNotification.run(m.user_id, type, groupId, actorName, groupName, body)
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
  next()
}

router.get('/', requireAuth, (req, res) => {
  try {
    const rows = getUnread.all(req.user.id)
    const count = unreadCount.get(req.user.id).count
    res.json({
      unreadCount: count,
      notifications: rows.map(r => ({
        id: r.id,
        type: r.type,
        groupId: r.group_id,
        eventId: r.event_id,
        actorName: r.actor_name,
        groupName: r.group_name,
        body: r.body,
        read: !!r.read,
        createdAt: r.created_at,
      })),
    })
  } catch (err) {
    console.error('GET /api/notifications', err)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

router.post('/read', requireAuth, (req, res) => {
  try {
    const { id } = req.body
    if (id) {
      markOneRead.run(id, req.user.id)
    } else {
      markAllRead.run(req.user.id)
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/notifications/read', err)
    res.status(500).json({ error: 'Failed to mark notifications read' })
  }
})

export default router
