import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from './api'
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

const DEBOUNCE_MS = 400

export default function App() {
  const [searchInput, setSearchInput]     = useState('')
  const [searchQuery, setSearchQuery]     = useState('')
  const [filters, setFilters]             = useState(DEFAULT_FILTERS)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents]               = useState([])
  const [loading, setLoading]             = useState(true)
  const debounceRef = useRef(null)

  const handleSearchChange = (value) => {
    setSearchInput(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchQuery(value), DEBOUNCE_MS)
  }

  const handleSearchSubmit = () => {
    clearTimeout(debounceRef.current)
    setSearchQuery(searchInput)
  }

  const loadEvents = async () => {
    try {
      const data = await api.getEvents()
      setEvents(data)
    } catch (err) {
      console.error('Failed to load events:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEvents() }, [])

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const results = events.filter((ev) => {
      if (q && !ev.name.toLowerCase().includes(q) && !(ev.description || '').toLowerCase().includes(q)) return false
      if (filters.category && ev.category !== filters.category) return false
      if (filters.location && ev.location !== filters.location) return false
      if (filters.dateFrom && ev.date < filters.dateFrom) return false
      if (filters.dateTo && ev.date > filters.dateTo) return false
      return true
    })
    if (filters.priceSort === 'asc') results.sort((a, b) => a.price - b.price)
    if (filters.priceSort === 'desc') results.sort((a, b) => b.price - a.price)
    return results
  }, [events, searchQuery, filters])

  const handleBack = () => {
    setSelectedEvent(null)
    loadEvents()
  }

  return (
    <>
      <Navbar
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={() => { setSelectedEvent(null); loadEvents() }}
      />

      <main className="page">
        {selectedEvent ? (
          <EventDetail event={selectedEvent} onBack={handleBack} />
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
                  {loading ? (
                    'Loading events…'
                  ) : (
                    <>
                      <strong>{filteredEvents.length}</strong>{' '}
                      {filteredEvents.length === 1 ? 'event' : 'events'} found
                    </>
                  )}
                </p>
              </div>

              <div className="event-grid">
                {!loading && filteredEvents.length === 0 ? (
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
                      groupCount={ev.groupCount ?? 0}
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
