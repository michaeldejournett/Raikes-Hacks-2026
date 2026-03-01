const API_BASE = import.meta.env.VITE_API_URL || ''

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Events
  getEvents: () => request('/api/events'),
  getEvent: (id) => request(`/api/events/${id}`),
  searchEvents: (q, { noLlm = false } = {}) =>
    request(`/api/events/search?${new URLSearchParams({ q, ...(noLlm && { no_llm: 'true' }) })}`),

  // Groups
  getMyGroups: () => request('/api/groups/mine'),
  getGroups: (eventId) =>
    request(`/api/groups?${new URLSearchParams({ eventId })}`),
  getGroupById: (groupId) =>
    request(`/api/groups/${groupId}`),
  createGroup: (data) =>
    request('/api/groups', { method: 'POST', body: JSON.stringify(data) }),
  joinGroup: (groupId) =>
    request(`/api/groups/${groupId}/join`, { method: 'POST', body: JSON.stringify({}) }),
  leaveGroup: (groupId) =>
    request(`/api/groups/${groupId}/leave`, { method: 'POST', body: JSON.stringify({}) }),
  deleteGroup: (groupId) =>
    request(`/api/groups/${groupId}`, { method: 'DELETE' }),

  // Messages
  getMessages: (groupId) =>
    request(`/api/groups/${groupId}/messages`),
  postMessage: (groupId, body) =>
    request(`/api/groups/${groupId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  postImage: async (groupId, file, caption = '') => {
    const form = new FormData()
    form.append('image', file)
    if (caption) form.append('body', caption)
    const res = await fetch(`${API_BASE}/api/groups/${groupId}/messages/image`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `API ${res.status}`)
    }
    return res.json()
  },

  // Notifications
  getNotifications: () => request('/api/notifications'),
  markNotificationsRead: (id) =>
    request('/api/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) }),

  // Auth
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
}
