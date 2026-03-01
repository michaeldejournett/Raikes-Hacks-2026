# Problem Report: AI Date Filter for Search

**Date:** 2026-03-01  
**Issue:** "Food in April" and similar date-range queries do not return correct results in the frontend.

---

## Summary

When users search for events with a date constraint (e.g., "food in april"), the AI correctly identifies the date range (2026-04-01 → 2026-04-30), but the frontend either shows no results, wrong dates, or March events instead of April.

---

## Root Causes Identified

### 1. Express Timeout Too Short
- **Problem:** Express calls FastAPI with `AbortSignal.timeout(5000)`. Gemma 27B LLM takes ~8 seconds to respond. Express times out, catches silently, and falls back to raw terms with **no date_range**.
- **Result:** Date filter never reaches the frontend.

### 2. Cold Start: Search Before Events Loaded
- **Problem:** FastAPI lifespan starts the periodic scrape in the background and yields immediately. First search requests hit before the scrape completes. `_events` is empty → pool=0.
- **Log evidence:** Search at 06:43:18 shows `pool=0`, then "Scraping UNL RSS…" and "Enriched 50/866…" happen *after* the search.

### 3. Warm Cache Not Used
- **Problem:** Even when FastAPI loads a warm cache from `scraped/events.json`, the first search can still see pool=0 if the warm cache file is missing or empty in the container.
- **Problem:** Express never uses FastAPI’s result pool. It only uses `terms` and `date_range` to filter its **own SQLite**. Express SQLite is seeded at startup from FastAPI `/events`. If that seed runs before FastAPI has events, SQLite stays empty → no results even when FastAPI later has 587 April events.

### 4. Frontend Filter Reliability
- **Problem:** Frontend filtered by `filters.dateFrom` / `filters.dateTo`. When these didn’t update reliably (React batching, backend not returning `date_range`), March events could appear.

### 5. Date Format / Multi-Day Event Handling
- **Problem:** Events with ISO timestamps (e.g. `2026-04-15T12:00:00`) could break string comparison. Multi-day events spanning into the range (e.g. March 25–April 5) were excluded by start-date-only logic.

---

## Fixes Attempted

### Fix 1: Increase Express Timeout
- **File:** `backend/routes/events.js`
- **Change:** `AbortSignal.timeout(5000)` → `AbortSignal.timeout(15000)`
- **Status:** Implemented. Reduces timeouts; does not address pool=0 or Express not using FastAPI pool.

### Fix 2: Block Startup Until Initial Scrape
- **File:** `api/api.py`
- **Change:** If `_events` is empty after warm cache load, `await _do_scrape()` before yielding in lifespan. Also changed `_periodic_scrape` to sleep first, then scrape (avoids double scrape on startup).
- **Status:** Implemented. Helps cold start; does not help when warm cache loads but Express still filters empty SQLite.

### Fix 3: Use `searchMeta.dateRange` in Frontend
- **File:** `frontend/src/App.jsx`
- **Change:** When showing search results, use `searchMeta.dateRange` as the authoritative date filter instead of `filters`.
- **Status:** Implemented. Makes frontend filter more reliable when `date_range` is returned.

### Fix 4: Normalize Dates and Add Multi-Day Overlap
- **Files:** `frontend/src/App.jsx`, `backend/routes/events.js`
- **Change:** Added `toYmd()` to normalize dates to YYYY-MM-DD; added `eventInDateRange()` / overlap logic for multi-day events.
- **Status:** Implemented. Fixes ISO timestamp comparison and multi-day inclusion.

### Fix 5: Use FastAPI Results in Express
- **File:** `backend/routes/events.js`
- **Change:** Request `top=100` from FastAPI; when `data.results?.length > 0`, use FastAPI results instead of filtering SQLite. Added `getEventByUrl` and `fastApiToEvent()` to map FastAPI format → Express format.
- **Status:** Implemented. Intended to use FastAPI’s pool when available.
- **Issue:** Still not working; Express may still be falling back to SQLite or FastAPI may still return 0 results at the time of the request.

### Fix 6: Instruct AI to Use YYYY-MM-DD
- **File:** `api/search.py`
- **Change:** Updated prompt to require `YYYY-MM-DD` format for date fields.
- **Status:** Implemented. Date format from AI should now be consistent.

### Fix 7: Log FastAPI Failure
- **File:** `backend/routes/events.js`
- **Change:** `catch { }` → `catch (err) { console.warn('FastAPI search unavailable — ...', err?.message) }`
- **Status:** Implemented. Aids debugging.

### Fix 8: Display Date Range in Header
- **File:** `frontend/src/App.jsx`
- **Change:** Show AI date range (e.g. "Apr 1, 2026 – Apr 30, 2026") in the events header.
- **Status:** Implemented. Improves UX; does not fix missing results.

---

## Current Status

**The date filter still does not work correctly.** Users see March events or no results when searching for "food in april."

---

## Recommended Next Steps

1. **Trace full request flow:** Log at each step: FastAPI `_events` count at request time, `date_range` returned, Express `data.results?.length`, Express SQLite row count, and what the frontend receives.
2. **Verify startup order:** Ensure API has events (warm cache or completed scrape) before the backend runs `fetch-events.js` and seeds SQLite.
3. **Confirm FastAPI response shape:** Inspect whether FastAPI returns `results` when pool > 0 and whether Express receives them.
4. **Consider direct FastAPI search from frontend:** For AI search, frontend could call FastAPI `/search` directly and display results, bypassing Express SQLite for that path.
5. **Bake-in scraped data:** In the API Dockerfile, `COPY` a pre-scraped `scraped/events.json` so the container has events at startup without waiting for a scrape.

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/routes/events.js` | Timeout 5s→15s; use FastAPI results when available; overlap date logic; `getEventByUrl`; `fastApiToEvent`; logging |
| `api/api.py` | Block startup until initial scrape when `_events` empty; periodic scrape sleeps first |
| `api/search.py` | Prompt update for YYYY-MM-DD date format |
| `frontend/src/App.jsx` | Use `searchMeta.dateRange` for filtering; `toYmd`, `eventInDateRange`; show date range in header; `formatShortDate` |
