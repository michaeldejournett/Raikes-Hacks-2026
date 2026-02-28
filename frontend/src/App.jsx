import { useState, useEffect, useMemo, useCallback } from 'react'
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

export default function App() {
  const [searchInput, setSearchInput]     = useState('')
  const [filters, setFilters]             = useState(DEFAULT_FILTERS)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents]               = useState([])
  const [searchResults, setSearchResults] = useState(null)
  const [searchMeta, setSearchMeta]       = useState(null)
  const [loading, setLoading]             = useState(true)
  const [searching, setSearching]         = useState(false)

  const handleSearchChange = (value) => {
    setSearchInput(value)
    if (!value.trim()) {
      setSearchResults(null)
      setSearchMeta(null)
    }
  }

  const handleSearchSubmit = useCallback(async () => {
    const q = searchInput.trim()
    if (!q) {
      setSearchResults(null)
      setSearchMeta(null)
      return
    }
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
  }, [searchInput])

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

  const displayEvents = useMemo(() => {
    let source = searchResults ?? events

    const q = searchInput.trim().toLowerCase()
    if (!searchResults && q) {
      const terms = q.match(/[a-z0-9]+/g)?.filter(w => w.length > 1) || []
      if (terms.length) {
        source = events.filter(ev => {
          const haystack = [ev.name, ev.description, ev.venue, ev.category, ...(ev.tags || [])]
            .map(s => (s || '').toLowerCase())
            .join(' ')
          return terms.some(t => haystack.includes(t))
        })
      }
    }

    const results = source.filter((ev) => {
      if (filters.category && ev.category !== filters.category) return false
      if (filters.location && ev.location !== filters.location) return false
      if (filters.dateFrom && ev.date < filters.dateFrom) return false
      if (filters.dateTo && ev.date > filters.dateTo) return false
      return true
    })
    if (filters.priceSort === 'asc') results.sort((a, b) => a.price - b.price)
    if (filters.priceSort === 'desc') results.sort((a, b) => b.price - a.price)
    return results
  }, [events, searchResults, searchInput, filters])

  const handleBack = () => {
    setSelectedEvent(null)
    loadEvents()
  }

  const isLoading = loading || searching

  return (
    <>
      <Navbar
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={() => { setSelectedEvent(null); setSearchInput(''); setSearchResults(null); setSearchMeta(null); loadEvents() }}
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
                  {isLoading ? (
                    searching ? 'Searching…' : 'Loading events…'
                  ) : (
                    <>
                      <strong>{displayEvents.length}</strong>{' '}
                      {displayEvents.length === 1 ? 'event' : 'events'} found
                      {searchMeta && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.82rem' }}>
                          {searchMeta.llmUsed ? '(AI-powered)' : '(keyword match)'}
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>

              <div className="event-grid">
                {!isLoading && displayEvents.length === 0 ? (
                  <div className="no-results">
                    <div className="no-results-icon">🔍</div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>No events match your search</p>
                    <p style={{ fontSize: '0.85rem' }}>Try adjusting your filters or search terms</p>
                  </div>
                ) : (
                  displayEvents.map((ev) => (
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
