import { useState } from 'react'

export default function GroupModal({ mode, group, eventName, userName, error, onConfirm, onClose }) {
  const isCreate = mode === 'create'

  const [groupName, setGroupName]      = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isCreate && !groupName.trim()) return
    onConfirm({
      groupName: isCreate ? groupName.trim() : group.name,
      description: isCreate ? description.trim() : '',
    })
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">
          {isCreate ? '🎉 Create a Group' : `👋 Join "${group?.name}"`}
        </h2>
        <p className="modal-subtitle">
          {isCreate
            ? `Organize a crew to attend "${eventName}"`
            : `Let the group know you're coming to "${eventName}"`}
        </p>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Joining as <strong>{userName}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          {isCreate && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="group-name">Group Name *</label>
                <input
                  id="group-name"
                  className="form-input"
                  type="text"
                  placeholder="e.g. Raikes Table, Friday Squad…"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="group-desc">Description (optional)</label>
                <textarea
                  id="group-desc"
                  className="form-input"
                  placeholder="Tell others what this group is about…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}

          {error && (
            <p style={{ color: 'var(--danger, #e53e3e)', fontSize: '0.88rem', marginBottom: 12 }}>
              {error}
            </p>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isCreate && !groupName.trim()}
            >
              {isCreate ? 'Create Group' : 'Join Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
