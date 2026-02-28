import { useState } from 'react'
import { getCategoryMeta } from '../data/events'
import { generateIcs } from '../utils/icsGenerator'
import GroupModal from './GroupModal'

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function EventDetail({ event, groups, onBack, onCreateGroup, onJoinGroup }) {
  const cat = getCategoryMeta(event.category)

  const [modal, setModal] = useState(null) // null | { mode: 'create' } | { mode: 'join', group }
  const [joinedIds, setJoinedIds] = useState(new Set())

  const eventGroups = groups.filter((g) => g.eventId === event.id)

  const handleModalConfirm = ({ yourName, groupName, description }) => {
    if (modal.mode === 'create') {
      onCreateGroup({ eventId: event.id, name: groupName, description, creator: yourName, members: [yourName] })
    } else {
      const updated = onJoinGroup(modal.group.id, yourName)
      if (updated) setJoinedIds((prev) => new Set([...prev, modal.group.id]))
    }
    setModal(null)
  }

  const isSameDay = event.date === event.endDate

  return (
    <div>
      {/* Back button */}
      <button className="detail-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to events
      </button>

      {/* Hero card */}
      <div className="detail-hero">
        <div className="detail-hero-banner" style={{ background: cat.color }} />
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

            <div className="detail-meta-item">
              <span className="detail-meta-icon">🎟️</span>
              <div>
                <div className="detail-meta-label">Admission</div>
                <div
                  className="detail-meta-value"
                  style={{ color: event.price === 0 ? 'var(--success)' : 'var(--text)' }}
                >
                  {event.price === 0 ? 'Free' : `$${event.price}`}
                </div>
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
          </div>
        </div>
      </div>

      {/* Groups section */}
      <div className="groups-section">
        <div className="groups-section-header">
          <h2 className="groups-section-title">
            👥 Going with a group?
            <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 8 }}>
              {eventGroups.length} {eventGroups.length === 1 ? 'group' : 'groups'}
            </span>
          </h2>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'create' })}>
            + Create Group
          </button>
        </div>

        {eventGroups.length === 0 ? (
          <div className="groups-empty">
            <p>No groups yet — be the first to organize one! 🚀</p>
          </div>
        ) : (
          <div className="groups-list">
            {eventGroups.map((group) => {
              const hasJoined = joinedIds.has(group.id)
              return (
                <div key={group.id} className="group-card">
                  <div className="group-card-header">
                    <span className="group-card-name">{group.name}</span>
                    {hasJoined ? (
                      <span className="badge joined-badge">✓ Joined</span>
                    ) : (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setModal({ mode: 'join', group })}
                      >
                        Join
                      </button>
                    )}
                  </div>

                  <div className="group-card-meta">
                    Created by {group.creator} · {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                  </div>

                  {group.description && (
                    <p className="group-card-description">{group.description}</p>
                  )}

                  <div className="group-members">
                    {group.members.map((m, i) => (
                      <span key={i} className="member-chip">{m}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
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
