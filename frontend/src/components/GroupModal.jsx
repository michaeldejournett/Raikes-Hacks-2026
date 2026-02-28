import { useState } from 'react'

export default function GroupModal({ mode, group, eventName, onConfirm, onClose }) {
  const isCreate = mode === 'create'

  const [yourName, setYourName]         = useState('')
  const [groupName, setGroupName]       = useState('')
  const [description, setDescription]  = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!yourName.trim()) return
    if (isCreate && !groupName.trim()) return

    onConfirm({
      yourName: yourName.trim(),
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

        <form onSubmit={handleSubmit}>
          {isCreate && (
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
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="your-name">Your Name *</label>
            <input
              id="your-name"
              className="form-input"
              type="text"
              placeholder="How should we call you?"
              value={yourName}
              onChange={(e) => setYourName(e.target.value)}
              required
              autoFocus={!isCreate}
            />
          </div>

          {isCreate && (
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
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!yourName.trim() || (isCreate && !groupName.trim())}
            >
              {isCreate ? 'Create Group' : 'Join Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
