import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { api } from './api'
import { getCategoryMeta } from './data/events'
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

function formatShortDate(ymd) {
  if (!ymd) return ''
  const [y, m, d] = String(ymd).split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m - 1] || ''} ${d}, ${y}`
}

// Extract YYYY-MM-DD for consistent comparison (handles ISO timestamps)
function toYmd(v) {
  if (!v) return ''
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

// Event overlaps date range [dateFrom, dateTo] inclusive
function eventInDateRange(ev, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  const evStart = toYmd(ev.date)
  const evEnd = toYmd(ev.endDate || ev.date)
  if (!evStart) return false
  if (dateFrom && evEnd < dateFrom) return false  // event ends before range
  if (dateTo && evStart > dateTo) return false    // event starts after range
  return true
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
  const [aiSearch, setAiSearch]           = useState(true)

  const debounceRef = useRef(null)

  const doSearch = useCallback(async (q, useAi) => {
    if (!q) { setSearchResults(null); setSearchMeta(null); return }
    setSearching(true)
    try {
      const data = await api.searchEvents(q, { noLlm: !useAi })
      setSearchResults(data.results)
      setSearchMeta({
        terms: data.terms,
        llmUsed: data.llmUsed,
        count: data.count,
        dateRange: data.date_range || null,
        timeRange: data.time_range || null,
      })
      // Reflect AI-applied date filter in the sidebar date picker
      if (data.date_range) {
        setFilters(f => ({ ...f, dateFrom: data.date_range.start, dateTo: data.date_range.end }))
      }
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults(null)
      setSearchMeta(null)
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSearchChange = (value, currentAiSearch = aiSearch) => {
    setSearchInput(value)
    clearTimeout(debounceRef.current)
    if (!value.trim()) { setSearchResults(null); setSearchMeta(null); setFilters(DEFAULT_FILTERS); return }
    // AI mode: wait for explicit submit (Enter), regular mode: debounce on type
    if (!currentAiSearch) {
      debounceRef.current = setTimeout(() => doSearch(value.trim(), false), 500)
    }
  }

  const handleSearchSubmit = useCallback(() => {
    clearTimeout(debounceRef.current)
    doSearch(searchInput.trim(), aiSearch)
  }, [searchInput, doSearch, aiSearch])

  const handleAiToggle = (value) => {
    setAiSearch(value)
    // If switching to regular and there's a query, re-run immediately without AI
    if (!value && searchInput.trim()) {
      clearTimeout(debounceRef.current)
      doSearch(searchInput.trim(), false)
    }
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

  const availableCategories = useMemo(() => {
    const seen = new Set()
    const cats = []
    for (const ev of events) {
      if (ev.category && !seen.has(ev.category)) {
        seen.add(ev.category)
        cats.push(getCategoryMeta(ev.category))
      }
    }
    return cats.sort((a, b) => a.label.localeCompare(b.label))
  }, [events])

  const filteredEvents = useMemo(() => {
    const source = searchResults ?? events
    // When showing search results, use searchMeta.dateRange as authoritative (from AI) so we don't rely on filters state
    const dateFrom = searchResults && searchMeta?.dateRange ? searchMeta.dateRange.start : filters.dateFrom
    const dateTo = searchResults && searchMeta?.dateRange ? searchMeta.dateRange.end : filters.dateTo
    const timeFrom = searchResults ? (searchMeta?.timeRange?.start || null) : null
    const timeTo   = searchResults ? (searchMeta?.timeRange?.end   || null) : null

    return source.filter((ev) => {
      if (filters.category.length && !filters.category.includes(ev.category)) return false
      if (!eventInDateRange(ev, dateFrom, dateTo)) return false
      if (timeFrom && ev.time && ev.time < timeFrom) return false
      if (timeTo   && ev.time && ev.time > timeTo)   return false
      return true
    })
  }, [events, searchResults, filters, searchMeta])

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
        aiSearch={aiSearch}
        onAiToggle={handleAiToggle}
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
              categories={availableCategories}
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
                    searching
                      ? (aiSearch ? '✨ AI is thinking…' : 'Searching…')
                      : 'Loading events…'
                  ) : (
                    <>
                      <strong>{filteredEvents.length}</strong>{' '}
                      {filteredEvents.length === 1 ? 'event' : 'events'} found
                    </>
                  )}
                </p>
                {!isLoading && searchMeta && (
                  <details className="search-debug">
                    <summary>
                      {searchMeta.llmUsed ? '✨ AI search' : '🔍 Keyword search'}
                      {searchMeta.dateRange && (
                        <> · {formatShortDate(searchMeta.dateRange.start)} – {formatShortDate(searchMeta.dateRange.end)}</>
                      )}
                      {searchMeta.timeRange && (
                        <> · {searchMeta.timeRange.start ?? '?'}–{searchMeta.timeRange.end ?? '?'}</>
                      )}
                      <span style={{ opacity: 0.6, marginLeft: 4 }}>▾</span>
                    </summary>
                    <div className="search-debug-body">
                      <div><span className="sdl">LLM used</span> {searchMeta.llmUsed ? 'yes' : 'no (fallback)'}</div>
                      <div><span className="sdl">Terms ({searchMeta.terms?.length ?? 0})</span>
                        <span style={{ wordBreak: 'break-word' }}>
                          {searchMeta.terms?.length ? searchMeta.terms.join(', ') : '(none)'}
                        </span>
                      </div>
                      <div><span className="sdl">Date filter</span>
                        {searchMeta.dateRange
                          ? `${searchMeta.dateRange.start} → ${searchMeta.dateRange.end}`
                          : 'none'}
                      </div>
                      <div><span className="sdl">Time filter</span>
                        {searchMeta.timeRange
                          ? `${searchMeta.timeRange.start ?? 'any'} → ${searchMeta.timeRange.end ?? 'any'}`
                          : 'none'}
                      </div>
                    </div>
                  </details>
                )}
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
