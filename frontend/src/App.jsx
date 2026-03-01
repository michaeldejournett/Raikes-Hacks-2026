import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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

export default function App() {
  const [searchInput, setSearchInput]     = useState('')
  const [filters, setFilters]             = useState(DEFAULT_FILTERS)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents]               = useState([])
  const [searchResults, setSearchResults] = useState(null)
  const [searchMeta, setSearchMeta]       = useState(null)
  const [loading, setLoading]             = useState(true)
  const [searching, setSearching]         = useState(false)
  const [page, setPage]                   = useState(1)
  const [pageSize, setPageSize]           = useState(20)
  const [user, setUser]                   = useState(null)

  const debounceRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (!q) { setSearchResults(null); setSearchMeta(null); return }
    setSearching(true)
    try {
      const data = await api.searchEvents(q)
      setSearchResults(data.results)
      setSearchMeta({ terms: data.terms, llmUsed: data.llmUsed, count: data.count })
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults(null)
      setSearchMeta(null)
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSearchChange = (value) => {
    setSearchInput(value)
    clearTimeout(debounceRef.current)
    if (!value.trim()) { setSearchResults(null); setSearchMeta(null); return }
    debounceRef.current = setTimeout(() => doSearch(value.trim()), 500)
  }

  const handleSearchSubmit = useCallback(() => {
    clearTimeout(debounceRef.current)
    doSearch(searchInput.trim())
  }, [searchInput, doSearch])

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

  useEffect(() => {
    loadEvents().then(() => {
      const params = new URLSearchParams(window.location.search)
      const eventId = params.get('event')
      if (eventId) {
        api.getEvent(Number(eventId)).then(ev => {
          if (ev) setSelectedEvent(ev)
        }).catch(() => {})
        window.history.replaceState({}, '', window.location.pathname)
      }
    })
    api.getMe().then(setUser).catch(() => setUser(null))
  }, [])

  const filteredEvents = useMemo(() => {
    const source = searchResults ?? events

    return source.filter((ev) => {
      if (filters.category.length && !filters.category.includes(ev.category)) return false
      if (filters.dateFrom && ev.date < filters.dateFrom) return false
      if (filters.dateTo && ev.date > filters.dateTo) return false
      return true
    })
  }, [events, searchResults, filters])

  useEffect(() => { setPage(1) }, [searchInput, filters, pageSize, searchResults])

  const totalPages  = Math.max(1, Math.ceil(filteredEvents.length / pageSize))
  const pagedEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize)

  const handleBack = () => {
    setSelectedEvent(null)
    loadEvents()
  }

  const handleNavigateToEvent = async (eventId) => {
    try {
      const ev = await api.getEvent(Number(eventId))
      if (ev) setSelectedEvent(ev)
    } catch {}
  }

  const isLoading = loading || searching

  return (
    <>
      <Navbar
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={() => { setSelectedEvent(null); setSearchInput(''); setSearchResults(null); setSearchMeta(null); loadEvents() }}
        user={user}
        onUserChange={setUser}
        onNavigateToEvent={handleNavigateToEvent}
      />

      <main className="page">
        {selectedEvent ? (
          <EventDetail event={selectedEvent} onBack={handleBack} user={user} />
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
                  {isLoading ? (
                    searching ? 'Searching…' : 'Loading events…'
                  ) : (
                    <>
                      <strong>{filteredEvents.length}</strong>{' '}
                      {filteredEvents.length === 1 ? 'event' : 'events'} found
                      {searchMeta && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.82rem' }}>
                          (AI search)
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>

              <div className="event-grid">
                {!isLoading && pagedEvents.length === 0 ? (
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

              {filteredEvents.length > 0 && (
                <div className="bottom-pagination">
                  <button
                    className="btn btn-outline"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ‹ Prev
                  </button>
                  <span className="bottom-pagination-info">
                    {page} / {totalPages}
                  </span>
                  <button
                    className="btn btn-outline"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next ›
                  </button>
                </div>
              )}

            </section>
          </div>
        )}
      </main>
    </>
  )
}
