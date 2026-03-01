import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function notifIcon(type) {
  if (type === 'join') return '👋'
  if (type === 'leave') return '🚪'
  if (type === 'message') return '💬'
  return '🔔'
}

function notifText(n) {
  if (n.type === 'join') return <><strong>{n.actorName}</strong> joined <strong>{n.groupName}</strong></>
  if (n.type === 'leave') return <><strong>{n.actorName}</strong> left <strong>{n.groupName}</strong></>
  if (n.type === 'message') return <><strong>{n.actorName}</strong> in <strong>{n.groupName}</strong>: {n.body}</>
  return 'New activity'
}

export default function NotificationBell({ onNavigateToEvent }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const load = async () => {
    try {
      const data = await api.getNotifications()
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      // not authenticated or error — hide bell gracefully
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleToggle = () => {
    setOpen(prev => !prev)
  }

  const handleMarkAllRead = async () => {
    await api.markNotificationsRead()
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleNotifClick = async (n) => {
    if (!n.read) {
      await api.markNotificationsRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    if (n.eventId && onNavigateToEvent) {
      onNavigateToEvent(n.eventId)
      setOpen(false)
    }
  }

  return (
    <div className="notif-bell-wrapper" ref={panelRef}>
      <button className="notif-bell-btn" onClick={handleToggle} aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'notif-unread'}`}
                  onClick={() => handleNotifClick(n)}
                >
                  <span className="notif-item-icon">{notifIcon(n.type)}</span>
                  <div className="notif-item-body">
                    <span className="notif-item-text">{notifText(n)}</span>
                    <span className="notif-item-time">{formatTimeAgo(n.createdAt)}</span>
                  </div>
                  {!n.read && <span className="notif-dot" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
