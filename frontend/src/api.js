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
  getGroups: (eventId) => request(`/api/groups?eventId=${eventId}`),
  createGroup: (data) =>
    request('/api/groups', { method: 'POST', body: JSON.stringify(data) }),
  joinGroup: (groupId, name) =>
    request(`/api/groups/${groupId}/join`, { method: 'POST', body: JSON.stringify({ name }) }),
}
