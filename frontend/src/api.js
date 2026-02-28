const API_BASE = import.meta.env.VITE_API_URL || ''

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
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
  getEvents: () => request('/api/events'),
  getEvent: (id) => request(`/api/events/${id}`),
  searchEvents: (q, top = 50) =>
    request(`/api/events/search?${new URLSearchParams({ q, top })}`),
  getGroups: (eventId, viewer) => {
    const params = new URLSearchParams({ eventId })
    if (viewer) params.set('viewer', viewer)
    return request(`/api/groups?${params}`)
  },
  createGroup: (data) =>
    request('/api/groups', { method: 'POST', body: JSON.stringify(data) }),
  joinGroup: (groupId, data) =>
    request(`/api/groups/${groupId}/join`, { method: 'POST', body: JSON.stringify(data) }),
  leaveGroup: (groupId, name) =>
    request(`/api/groups/${groupId}/leave`, { method: 'POST', body: JSON.stringify({ name }) }),
  getGroupById: (groupId, viewer) => {
    const params = viewer ? `?viewer=${encodeURIComponent(viewer)}` : ''
    return request(`/api/groups/${groupId}${params}`)
  },
  getMessages: (groupId) =>
    request(`/api/groups/${groupId}/messages`),
  postMessage: (groupId, author, body) =>
    request(`/api/groups/${groupId}/messages`, { method: 'POST', body: JSON.stringify({ author, body }) }),
}
