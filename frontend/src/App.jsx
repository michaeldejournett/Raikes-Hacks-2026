import { useState, useMemo } from 'react'
import { EVENTS } from './data/events'
import Navbar from './components/Navbar'
import SearchFilters from './components/SearchFilters'
import EventCard from './components/EventCard'
import EventDetail from './components/EventDetail'

const DEFAULT_FILTERS = {
  category: '',
  dateFrom: '',
  dateTo: '',
  priceSort: '',
  location: '',
}

let nextGroupId = 1

export default function App() {
  const [searchQuery, setSearchQuery]   = useState('')
  const [filters, setFilters]           = useState(DEFAULT_FILTERS)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [groups, setGroups]             = useState([])

  // ── Filtering ──────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const results = EVENTS.filter((ev) => {
      if (q && !ev.name.toLowerCase().includes(q) && !ev.description.toLowerCase().includes(q)) return false
      if (filters.category && ev.category !== filters.category) return false
      if (filters.location && ev.location !== filters.location) return false
      if (filters.dateFrom && ev.date < filters.dateFrom) return false
      if (filters.dateTo && ev.date > filters.dateTo) return false
      return true
    })
    if (filters.priceSort === 'asc') results.sort((a, b) => a.price - b.price)
    if (filters.priceSort === 'desc') results.sort((a, b) => b.price - a.price)
    return results
  }, [searchQuery, filters])

  // ── Group handlers ─────────────────────────────────────────
  const handleCreateGroup = ({ eventId, name, description, creator, members }) => {
    setGroups((prev) => [
      ...prev,
      { id: nextGroupId++, eventId, name, description, creator, members },
    ])
  }

  const handleJoinGroup = (groupId, memberName) => {
    let joined = false
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        if (g.members.includes(memberName)) return g
        joined = true
        return { ...g, members: [...g.members, memberName] }
      })
    )
    return joined
  }

  // ── Group count per event ──────────────────────────────────
  const groupCountByEvent = useMemo(() => {
    const counts = {}
    for (const g of groups) {
      counts[g.eventId] = (counts[g.eventId] ?? 0) + 1
    }
    return counts
  }, [groups])

  return (
    <>
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onLogoClick={() => setSelectedEvent(null)}
      />

      <main className="page">
        {selectedEvent ? (
          <EventDetail
            event={selectedEvent}
            groups={groups}
            onBack={() => setSelectedEvent(null)}
            onCreateGroup={handleCreateGroup}
            onJoinGroup={handleJoinGroup}
          />
        ) : (
          <div className="page-layout">
            <SearchFilters
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />

            <section>
              <div className="events-header">
                <p className="events-count">
                  <strong>{filteredEvents.length}</strong>{' '}
                  {filteredEvents.length === 1 ? 'event' : 'events'} found
                </p>
              </div>

              <div className="event-grid">
                {filteredEvents.length === 0 ? (
                  <div className="no-results">
                    <div className="no-results-icon">🔍</div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>No events match your search</p>
                    <p style={{ fontSize: '0.85rem' }}>Try adjusting your filters or search terms</p>
                  </div>
                ) : (
                  filteredEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      groupCount={groupCountByEvent[ev.id] ?? 0}
                      onClick={() => setSelectedEvent(ev)}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  )
}
