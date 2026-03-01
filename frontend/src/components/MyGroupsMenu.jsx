import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

export default function MyGroupsMenu({ onNavigateToEvent }) {
  const [groups, setGroups] = useState([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const load = async () => {
    try {
      const data = await api.getMyGroups()
      setGroups(data)
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
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

  const handleClick = (g) => {
    if (onNavigateToEvent) onNavigateToEvent(g.eventId)
    setOpen(false)
  }

  return (
    <div className="mygroups-wrapper" ref={panelRef}>
      <button className="mygroups-btn" onClick={() => setOpen(p => !p)} aria-label="My Groups">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        My Groups
        {groups.length > 0 && <span className="mygroups-count">{groups.length}</span>}
      </button>

      {open && (
        <div className="mygroups-panel">
          <div className="mygroups-panel-header">
            <span className="mygroups-panel-title">My Groups</span>
            <span className="mygroups-panel-subtitle">{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="mygroups-panel-list">
            {groups.length === 0 ? (
              <div className="mygroups-empty">You haven't joined any groups yet.</div>
            ) : (
              groups.map(g => (
                <button key={g.id} className="mygroups-item" onClick={() => handleClick(g)}>
                  <div className="mygroups-item-top">
                    <span className="mygroups-item-name">{g.name}</span>
                    <span className={`mygroups-item-badge ${g.status}`}>{g.status === 'full' ? 'Full' : 'Open'}</span>
                  </div>
                  <span className="mygroups-item-event">{g.eventName}</span>
                  <span className="mygroups-item-meta">
                    {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}
                    {g.isOwner && ' · Owner'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
