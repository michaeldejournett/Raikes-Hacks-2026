import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

export default function GroupMessageBoard({ groupId, userName }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft]       = useState('')
  const [sending, setSending]   = useState(false)
  const [preview, setPreview]   = useState(null)
  const [dragging, setDragging] = useState(false)
  const bottomRef  = useRef(null)
  const fileRef    = useRef(null)
  const dragCount  = useRef(0)

  const load = async () => {
    try {
      const data = await api.getMessages(groupId)
      setMessages(data)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [groupId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async (e) => {
    e.preventDefault()
    if ((!draft.trim() && !preview) || !userName || sending) return
    setSending(true)
    try {
      let updated
      if (preview) {
        updated = await api.postImage(groupId, preview.file, draft.trim())
        setPreview(null)
      } else {
        updated = await api.postMessage(groupId, draft.trim())
      }
      setMessages(updated)
      setDraft('')
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const acceptFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview({ file, url: URL.createObjectURL(file) })
  }

  const handleFileSelect = (e) => {
    acceptFile(e.target.files?.[0])
    e.target.value = ''
  }

  const cancelPreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const handleDragEnter = (e) => {
    e.preventDefault()
    dragCount.current++
    if (dragCount.current === 1) setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    dragCount.current--
    if (dragCount.current === 0) setDragging(false)
  }

  const handleDragOver = (e) => e.preventDefault()

  const handleDrop = (e) => {
    e.preventDefault()
    dragCount.current = 0
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    acceptFile(file)
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        acceptFile(item.getAsFile())
        return
      }
    }
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso + 'Z')
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div
      className="msg-board"
      onDragEnter={userName ? handleDragEnter : undefined}
      onDragLeave={userName ? handleDragLeave : undefined}
      onDragOver={userName ? handleDragOver : undefined}
      onDrop={userName ? handleDrop : undefined}
    >
      {dragging && (
        <div className="msg-drop-overlay">
          <span>Drop image here</span>
        </div>
      )}
      <div className="msg-list">
        {messages.length === 0 ? (
          <p className="msg-empty">No messages yet — say hi!</p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.author === userName
            return (
              <div key={msg.id} className={`msg ${isMe ? 'msg-mine' : ''}`}>
                <div className="msg-header">
                  <span className="msg-author">{msg.author}</span>
                  <span className="msg-time">{formatTime(msg.createdAt)}</span>
                </div>
                {msg.imageUrl && (
                  <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="msg-image-link">
                    <img src={msg.imageUrl} alt="" className="msg-image" loading="lazy" />
                  </a>
                )}
                {msg.body && <p className="msg-body">{msg.body}</p>}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {userName ? (
        <>
          {preview && (
            <div className="msg-preview">
              <img src={preview.url} alt="Preview" className="msg-preview-img" />
              <button type="button" className="msg-preview-cancel" onClick={cancelPreview} aria-label="Remove image">✕</button>
            </div>
          )}
          <form className="msg-input-row" onSubmit={handleSend}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileSelect}
            />
            <button
              type="button"
              className="msg-img-btn"
              onClick={() => fileRef.current?.click()}
              title="Send an image"
              disabled={sending}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <input
              className="form-input msg-input"
              type="text"
              placeholder={preview ? 'Add a caption…' : 'Type a message…'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={handlePaste}
              maxLength={500}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={(!draft.trim() && !preview) || sending}
            >
              {sending ? '…' : 'Send'}
            </button>
          </form>
        </>
      ) : (
        <p className="msg-join-hint">Join this group to send messages</p>
      )}
    </div>
  )
}
