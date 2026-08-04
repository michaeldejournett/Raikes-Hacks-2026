import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadEvents } from './services/api.js';
import { searchKeyword, searchAi } from './utils/search.js';
import { eventMatchesTemporal } from './utils/temporal.js';
import { getCategoryMeta } from './data/events.js';
import { getAllGroupCounts } from './utils/groups.js';
import CuriaNavbar from './components/CuriaNavbar.jsx';
import SearchFilters from './components/SearchFilters.jsx';
import EventCard from './components/EventCard.jsx';
import EventDetail from './components/EventDetail.jsx';

const DEFAULT_FILTERS = {
  category: [],
  dateFrom: '',
  dateTo: '',
};

function formatShortDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[m - 1] || ''} ${d}, ${y}`;
}

function formatShortTime(value) {
  if (!value) return '';
  const [rawHour, rawMinute] = String(value).split(':').map(Number);
  const suffix = rawHour >= 12 ? 'PM' : 'AM';
  const hour = rawHour % 12 || 12;
  return `${hour}:${String(rawMinute).padStart(2, '0')} ${suffix}`;
}

export default function CuriaApp() {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [aiSearch, setAiSearch] = useState(true);
  const [groupCounts, setGroupCounts] = useState(() => getAllGroupCounts());
  const debounceRef = useRef(null);
  const searchRequestRef = useRef(0);
  const queryDateAppliedRef = useRef(false);

  // Load events from static JSON
  useEffect(() => {
    loadEvents()
      .then((evs) => {
        setEvents(evs);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load events:', err);
        setLoading(false);
      });
  }, []);

  const doSearch = useCallback(
    async (q, useAi) => {
      const requestId = ++searchRequestRef.current;
      if (!q) {
        setSearchResults(null);
        setSearchMeta(null);
        return;
      }
      setSearching(true);
      try {
        const result = useAi ? await searchAi(events, q) : searchKeyword(events, q);
        if (requestId !== searchRequestRef.current) return;

        setSearchResults(result.results);
        setSearchMeta({
          terms: result.terms,
          llmUsed: result.llmUsed,
          count: result.count,
          dateRange: result.date_range || null,
          timeRange: result.time_range || null,
          temporal: result.temporal_window || result.temporal || null,
          temporalIntent: result.temporal_intent || null,
          temporalInvalid: result.temporal_invalid || null,
          llmIntent: result.llm_intent || null,
        });
        if (result.date_range) {
          queryDateAppliedRef.current = true;
          setFilters((f) => ({
            ...f,
            dateFrom: result.date_range.start,
            dateTo: result.temporal?.endLocal?.slice(0, 10) || result.date_range.end,
          }));
        } else if (queryDateAppliedRef.current) {
          queryDateAppliedRef.current = false;
          setFilters((f) => ({ ...f, dateFrom: '', dateTo: '' }));
        }
      } catch (err) {
        if (requestId !== searchRequestRef.current) return;
        console.error('Search failed:', err);
        setSearchResults(null);
        setSearchMeta(null);
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false);
      }
    },
    [events]
  );

  const handleSearchChange = (value, currentAiSearch = aiSearch) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    searchRequestRef.current += 1;
    setSearching(false);
    if (!value.trim()) {
      queryDateAppliedRef.current = false;
      setSearchResults(null);
      setSearchMeta(null);
      setFilters(DEFAULT_FILTERS);
      setSearching(false);
      return;
    }
    if (!currentAiSearch) {
      debounceRef.current = setTimeout(() => doSearch(value.trim(), false), 500);
    }
  };

  const handleSearchSubmit = useCallback(() => {
    clearTimeout(debounceRef.current);
    doSearch(searchInput.trim(), aiSearch);
  }, [searchInput, doSearch, aiSearch]);

  const handleAiToggle = (value) => {
    setAiSearch(value);
    if (!value && searchInput.trim()) {
      clearTimeout(debounceRef.current);
      doSearch(searchInput.trim(), false);
    }
  };

  const availableCategories = useMemo(() => {
    const seen = new Set();
    const cats = [];
    for (const ev of events) {
      if (ev.category && !seen.has(ev.category)) {
        seen.add(ev.category);
        cats.push(getCategoryMeta(ev.category));
      }
    }
    return cats.sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const source = searchResults ?? events;
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateTo;
    const timeRange = searchMeta?.timeRange || null;
    const queryDateTo =
      searchMeta?.temporal?.filterMode === 'absolute'
        ? searchMeta.temporal.endLocal.slice(0, 10)
        : searchMeta?.dateRange?.end;
    const queryDatesUnchanged =
      Boolean(searchMeta?.dateRange) &&
      dateFrom === searchMeta.dateRange.start &&
      dateTo === queryDateTo;
    const absoluteWindow =
      queryDatesUnchanged && searchMeta?.temporal?.filterMode === 'absolute'
        ? searchMeta.temporal
        : null;

    return source.filter((ev) => {
      if (filters.category.length && !filters.category.includes(ev.category)) return false;
      return eventMatchesTemporal(
        ev,
        { start: dateFrom || null, end: dateTo || null },
        timeRange,
        absoluteWindow
      );
    });
  }, [events, searchResults, filters, searchMeta]);

  useEffect(() => {
    setPage(1);
  }, [searchInput, filters, pageSize, searchResults]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const pagedEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize);
  const isLoading = loading || searching;

  const handleLogoClick = () => {
    searchRequestRef.current += 1;
    queryDateAppliedRef.current = false;
    setSelectedEvent(null);
    setSearchInput('');
    setSearchResults(null);
    setSearchMeta(null);
    setSearching(false);
  };

  return (
    <>
      <CuriaNavbar
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={handleLogoClick}
        aiSearch={aiSearch}
        onAiToggle={handleAiToggle}
      />

      <main className="page">
        {selectedEvent ? (
          <EventDetail
            event={selectedEvent}
            onBack={() => {
              setSelectedEvent(null);
              setGroupCounts(getAllGroupCounts());
            }}
          />
        ) : (
          <div className="page-layout">
            <SearchFilters
              filters={filters}
              onChange={(nextFilters) => {
                if (
                  nextFilters.dateFrom !== filters.dateFrom ||
                  nextFilters.dateTo !== filters.dateTo
                ) {
                  queryDateAppliedRef.current = false;
                }
                setFilters(nextFilters);
              }}
              onReset={() => {
                queryDateAppliedRef.current = false;
                setFilters(DEFAULT_FILTERS);
              }}
              categories={availableCategories}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              page={page}
              totalPages={totalPages}
              totalCount={filteredEvents.length}
              onPageChange={setPage}
            />

            <section className="events-section">
              <div className="events-header">
                <p className="events-count">
                  {isLoading ? (
                    searching ? (
                      aiSearch ? (
                        '✨ AI is thinking…'
                      ) : (
                        'Searching…'
                      )
                    ) : (
                      'Loading events…'
                    )
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
                        <>
                          {' '}
                          · {formatShortDate(searchMeta.dateRange.start)} –{' '}
                          {formatShortDate(searchMeta.dateRange.end)}
                        </>
                      )}
                      {searchMeta.timeRange && (
                        <>
                          {' '}
                          · {formatShortTime(searchMeta.timeRange.start)}–
                          {formatShortTime(searchMeta.timeRange.end)} CT
                        </>
                      )}
                      <span style={{ opacity: 0.6, marginLeft: 4 }}>▾</span>
                    </summary>
                    <div className="search-debug-body">
                      <div>
                        <span className="sdl">LLM used</span>
                        {searchMeta.llmUsed ? 'yes' : 'no (deterministic)'}
                      </div>
                      <div>
                        <span className="sdl">Terms ({searchMeta.terms?.length ?? 0})</span>
                        <span style={{ wordBreak: 'break-word' }}>
                          {searchMeta.terms?.length ? searchMeta.terms.join(', ') : '(none)'}
                        </span>
                      </div>
                      <div>
                        <span className="sdl">Date filter</span>
                        {searchMeta.dateRange
                          ? `${searchMeta.dateRange.start} → ${searchMeta.dateRange.end}`
                          : 'none'}
                      </div>
                      <div>
                        <span className="sdl">Time filter</span>
                        {searchMeta.timeRange
                          ? `${searchMeta.timeRange.start} → ${searchMeta.timeRange.end} (Central)`
                          : 'none'}
                      </div>
                      {searchMeta.temporal && (
                        <div>
                          <span className="sdl">Resolved interval</span>
                          <span style={{ wordBreak: 'break-word' }}>
                            {searchMeta.temporal.startLocal} → {searchMeta.temporal.endLocal}
                            <br />
                            {searchMeta.temporal.timeZone}
                          </span>
                        </div>
                      )}
                      {searchMeta.llmIntent && (
                        <div>
                          <span className="sdl">LLM interpretation</span>
                          {[
                            searchMeta.llmIntent.datePhrase,
                            searchMeta.llmIntent.timePhrase,
                          ]
                            .filter(Boolean)
                          .join(' · ') || 'topics only'}
                        </div>
                      )}
                      {(searchMeta.temporalInvalid?.date ||
                        searchMeta.temporalInvalid?.time) && (
                        <div>
                          <span className="sdl">Interpretation error</span>
                          Check the requested date or time
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>

              <div className="event-grid">
                {!isLoading && pagedEvents.length === 0 ? (
                  <div className="no-results">
                    <div className="no-results-icon">🔍</div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                      {searchMeta?.temporalInvalid?.date || searchMeta?.temporalInvalid?.time
                        ? 'Curia could not interpret that date or time'
                        : 'No events match your search'}
                    </p>
                    <p style={{ fontSize: '0.85rem' }}>
                      {searchMeta?.temporalInvalid?.date || searchMeta?.temporalInvalid?.time
                        ? 'Try a phrase like “next Tuesday evening” or “after 6pm”'
                        : 'Try adjusting your filters or search terms'}
                    </p>
                  </div>
                ) : (
                  pagedEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      groupCount={groupCounts[ev.id] ?? 0}
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
  );
}
