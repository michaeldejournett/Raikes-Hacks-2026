import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from './api'
import Navbar from './components/Navbar'
import SearchFilters from './components/SearchFilters'
import EventCard from './components/EventCard'
import EventDetail from './components/EventDetail'

const DEFAULT_FILTERS = {
  category: [],
  dateFrom: '',
  dateTo: '',
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
  const [page, setPage]                   = useState(1)
  const [pageSize, setPageSize]           = useState(20)
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
    return events.filter((ev) => {
      if (q && !ev.name.toLowerCase().includes(q) && !(ev.description || '').toLowerCase().includes(q)) return false
      if (filters.category.length && !filters.category.includes(ev.category)) return false
      if (filters.location && ev.location !== filters.location) return false
      if (filters.dateFrom && ev.date < filters.dateFrom) return false
      if (filters.dateTo && ev.date > filters.dateTo) return false
      return true
    })
  }, [events, searchQuery, filters])

  // Reset to page 1 whenever results or page size change
  useEffect(() => { setPage(1) }, [searchQuery, filters, pageSize])

  const totalPages  = Math.max(1, Math.ceil(filteredEvents.length / pageSize))
  const pagedEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize)

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
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              page={page}
              totalPages={totalPages}
              totalCount={filteredEvents.length}
              onPageChange={setPage}
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
                {!loading && pagedEvents.length === 0 ? (
                  <div className="no-results">
                    <div className="no-results-icon">🔍</div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>No events match your search</p>
                    <p style={{ fontSize: '0.85rem' }}>Try adjusting your filters or search terms</p>
                  </div>
                ) : (
                  pagedEvents.map((ev) => (
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
