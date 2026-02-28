import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

export default function GroupMessageBoard({ groupId, myName }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef(null)

  const load = async () => {
    try {
      const data = await api.getMessages(groupId)
      setMessages(data)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  useEffect(() => { load() }, [groupId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!draft.trim() || !myName || sending) return
    setSending(true)
    try {
      const updated = await api.postMessage(groupId, myName, draft.trim())
      setMessages(updated)
      setDraft('')
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso + 'Z')
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="msg-board">
      <div className="msg-list">
        {messages.length === 0 ? (
          <p className="msg-empty">No messages yet — say hi!</p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.author === myName
            return (
              <div key={msg.id} className={`msg ${isMe ? 'msg-mine' : ''}`}>
                <div className="msg-header">
                  <span className="msg-author">{msg.author}</span>
                  <span className="msg-time">{formatTime(msg.createdAt)}</span>
                </div>
                <p className="msg-body">{msg.body}</p>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {myName ? (
        <form className="msg-input-row" onSubmit={handleSend}>
          <input
            className="form-input msg-input"
            type="text"
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!draft.trim() || sending}
          >
            Send
          </button>
        </form>
      ) : (
        <p className="msg-join-hint">Join this group to send messages</p>
      )}
    </div>
  )
}
