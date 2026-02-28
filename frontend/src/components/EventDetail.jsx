import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { getCategoryMeta } from '../data/events'
import { generateIcs } from '../utils/icsGenerator'
import GroupModal from './GroupModal'
import GroupMessageBoard from './GroupMessageBoard'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm} CT`
}

export default function EventDetail({ event, onBack }) {
  const cat = getCategoryMeta(event.category)

  const [modal, setModal]           = useState(null)
  const [myName, setMyName]         = useState(() => sessionStorage.getItem('curia_name') || '')
  const [groups, setGroups]         = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [expandedChat, setExpandedChat]   = useState(null)
  const [copiedId, setCopiedId]           = useState(null)

  const loadGroups = useCallback(async () => {
    try {
      const data = await api.getGroups(event.id, myName || undefined)
      setGroups(data)
    } catch (err) {
      console.error('Failed to load groups:', err)
    } finally {
      setLoadingGroups(false)
    }
  }, [event.id, myName])

  useEffect(() => { loadGroups() }, [loadGroups])

  const isMemberOf = (group) =>
    group.members.some(m => m.name === myName)

  const handleModalConfirm = async (data) => {
    try {
      if (modal.mode === 'create') {
        await api.createGroup({
          eventId: event.id,
          name: data.groupName,
          description: data.description,
          creator: data.yourName,
          email: data.email,
          phone: data.phone,
          capacity: data.capacity,
          meetupDetails: data.meetupDetails,
          vibeTags: data.vibeTags,
        })
      } else {
        await api.joinGroup(modal.group.id, {
          name: data.yourName,
          email: data.email,
          phone: data.phone,
        })
      }
      setMyName(data.yourName)
      sessionStorage.setItem('curia_name', data.yourName)
      await loadGroups()
    } catch (err) {
      console.error('Group operation failed:', err)
    }
    setModal(null)
  }

  const handleLeave = async (group) => {
    if (!myName) return
    const isCreator = group.creator === myName
    const msg = isCreator
      ? 'You created this group. Leaving will delete it for everyone. Continue?'
      : 'Leave this group?'
    if (!window.confirm(msg)) return

    try {
      await api.leaveGroup(group.id, myName)
      await loadGroups()
    } catch (err) {
      console.error('Failed to leave group:', err)
    }
  }

  const shareGroup = (group) => {
    const url = `${window.location.origin}${window.location.pathname}?event=${event.id}&group=${group.id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(group.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const toggleChat = (groupId) => {
    setExpandedChat(prev => prev === groupId ? null : groupId)
  }

  const isSameDay = event.date === event.endDate

  return (
    <div>
      <button className="detail-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to events
      </button>

      <div className="detail-hero">
        {event.imageUrl ? (
          <img className="detail-hero-image" src={event.imageUrl} alt={event.name} />
        ) : (
          <div className="detail-hero-banner" style={{ background: cat.color }} />
        )}
        <div className="detail-hero-body">
          <div
            className="detail-category-badge"
            style={{ background: cat.bg, color: cat.color }}
          >
            {cat.emoji} {cat.label}
          </div>

          <h1 className="detail-name">{event.name}</h1>

          <div className="detail-meta-grid">
            <div className="detail-meta-item">
              <span className="detail-meta-icon">📅</span>
              <div>
                <div className="detail-meta-label">Date</div>
                <div className="detail-meta-value">{formatDate(event.date)}</div>
                {!isSameDay && (
                  <div className="detail-meta-value" style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    → {formatDate(event.endDate)}
                  </div>
                )}
              </div>
            </div>

            <div className="detail-meta-item">
              <span className="detail-meta-icon">🕐</span>
              <div>
                <div className="detail-meta-label">Time</div>
                <div className="detail-meta-value">
                  {formatTime(event.time)} – {formatTime(event.endTime)}
                </div>
              </div>
            </div>

            <div className="detail-meta-item">
              <span className="detail-meta-icon">📍</span>
              <div>
                <div className="detail-meta-label">Location</div>
                <div className="detail-meta-value">{event.venue}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{event.location}</div>
              </div>
            </div>
          </div>

          <p className="detail-description">{event.description}</p>

          {event.tags?.length > 0 && (
            <div className="tags">
              {event.tags.map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
            </div>
          )}

          <div className="divider" />

          <div className="detail-actions">
            <button
              className="btn btn-primary"
              onClick={() => generateIcs(event)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Add to Calendar (.ics)
            </button>

            {event.url && (
              <a
                className="btn"
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: cat.color, color: '#fff', borderColor: cat.color }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                View Event Page
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Groups Section ── */}
      <div className="groups-section">
        <div className="groups-section-header">
          <h2 className="groups-section-title">
            👥 Going with a group?
            <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 8 }}>
              {loadingGroups ? '…' : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
            </span>
          </h2>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'create' })}>
            + Create Group
          </button>
        </div>

        {!loadingGroups && groups.length === 0 ? (
          <div className="groups-empty">
            <p>No groups yet — be the first to organize one!</p>
          </div>
        ) : (
          <div className="groups-list">
            {groups.map((group) => {
              const joined = isMemberOf(group)
              const pct = group.capacity > 0
                ? Math.min(100, Math.round((group.memberCount / group.capacity) * 100))
                : null

              return (
                <div key={group.id} className={`group-card ${group.isFull ? 'group-card-full' : ''}`}>
                  <div className="group-card-header">
                    <div className="group-card-title-row">
                      <span className="group-card-name">{group.name}</span>
                      <span className={`group-status-badge ${group.status}`}>
                        {group.status === 'full' ? 'Full' : 'Open'}
                      </span>
                    </div>
                    <div className="group-card-actions">
                      {joined ? (
                        <>
                          <span className="badge joined-badge">✓ Joined</span>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleLeave(group)}
                            title={group.creator === myName ? 'Delete group' : 'Leave group'}
                          >
                            {group.creator === myName ? '🗑️' : '🚪'}
                          </button>
                        </>
                      ) : !group.isFull ? (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setModal({ mode: 'join', group })}
                        >
                          Join
                        </button>
                      ) : (
                        <span className="badge full-badge">Group Full</span>
                      )}
                    </div>
                  </div>

                  <div className="group-card-meta">
                    Created by {group.creator} · {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                    {group.capacity > 0 && ` / ${group.capacity} max`}
                  </div>

                  {/* Capacity bar */}
                  {pct !== null && (
                    <div className="capacity-bar-wrapper">
                      <div className="capacity-bar">
                        <div
                          className={`capacity-bar-fill ${group.isFull ? 'full' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="capacity-label">{group.memberCount}/{group.capacity}</span>
                    </div>
                  )}

                  {group.description && (
                    <p className="group-card-description">{group.description}</p>
                  )}

                  {/* Meetup details */}
                  {group.meetupDetails && (
                    <div className="group-meetup">
                      <span className="group-meetup-icon">📍</span>
                      <span>{group.meetupDetails}</span>
                    </div>
                  )}

                  {/* Vibe tags */}
                  {group.vibeTags?.length > 0 && (
                    <div className="group-vibes">
                      {group.vibeTags.map(tag => (
                        <span key={tag} className="vibe-tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Members with contact info (visible only to group members) */}
                  <div className="group-members">
                    {group.members.map((m, i) => (
                      <div key={i} className="member-chip-row">
                        <span className="member-chip">{m.name}</span>
                        {joined && (m.email || m.phone) && (
                          <span className="member-contact">
                            {m.email && <a href={`mailto:${m.email}`} title={m.email}>✉️</a>}
                            {m.phone && <a href={`tel:${m.phone}`} title={m.phone}>📱</a>}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {!joined && group.memberCount > 0 && (
                    <p className="contact-hint">Join to see contact info</p>
                  )}

                  {/* Share + Chat toolbar */}
                  <div className="group-toolbar">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => shareGroup(group)}
                      title="Copy share link"
                    >
                      {copiedId === group.id ? '✓ Copied!' : '🔗 Share'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleChat(group.id)}
                    >
                      💬 {expandedChat === group.id ? 'Hide Chat' : 'Chat'}
                    </button>
                  </div>

                  {expandedChat === group.id && (
                    <GroupMessageBoard
                      groupId={group.id}
                      myName={joined ? myName : null}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <GroupModal
          mode={modal.mode}
          group={modal.group}
          eventName={event.name}
          onConfirm={handleModalConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
