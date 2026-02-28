# Curia

This is the RaikesHacks 2026 project for the team "Is There Input Length Validation?" consisting of Michael, Will, and Rishi.

An event discovery app with a **Looking For Group** feature — find UNL events and organize groups to attend together.

## Quick Start

> **Prerequisites:** Node.js 18+ ([download](https://nodejs.org))

```bash
git clone https://github.com/michaeldejournett/Raikes-Hacks-2026.git
cd Raikes-Hacks-2026
npm start
```

That's it. The backend starts on `http://localhost:3001` with a SQLite database (auto-created, no setup needed). Events are seeded automatically on first run.

Then in a second terminal, start the frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` — the frontend proxies API calls to the backend automatically.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express + SQLite (groups API)
- **Scraper:** Python + FastAPI + Ollama (UNL event search — runs via Docker)

## Architecture

The project has two backends:

1. **Express API** (`backend/`) — Serves events and the LFG groups feature (create/join groups). Uses SQLite, zero config.
2. **FastAPI Scraper** (`api/`) — Scrapes real UNL events from events.unl.edu + Campus Labs Engage, with LLM-powered natural-language search via Ollama. Runs in Docker.

## Groups API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List all events (includes group counts) |
| GET | `/api/events/:id` | Get a single event |
| GET | `/api/groups?eventId=` | List groups for an event |
| POST | `/api/groups` | Create a group |
| POST | `/api/groups/:id/join` | Join a group |

## UNL Events Search API (Docker)

The scraper + search API requires Docker:

```bash
docker compose up --build
```

API available at `http://localhost:8080`. See `/docs` for Swagger UI.

| Endpoint | Description |
|----------|-------------|
| `GET /search?q=free+food` | Natural-language event search |
| `GET /health` | Service status |
| `POST /reload` | Trigger immediate re-scrape |

For GPU acceleration, use the overlay compose files:

```bash
# NVIDIA GPU
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up --build

# AMD GPU (ROCm, Linux only)
docker compose -f docker-compose.yml -f docker-compose.amd.yml up --build
```

## Deploying to Render (Free)

1. Push your repo to GitHub
2. On [render.com](https://render.com), create a **Web Service** pointing to your repo:
   - **Build command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - **Start command:** `cd backend && node index.js`
   - **Environment variable:** `NODE_ENV` = `production`
3. Deploy — the backend serves both the API and the built frontend from one URL

## Scraper API Reference

The API is available at **http://localhost:8080** once the containers are up.

### API Endpoints

#### `GET /health`
Returns service status and scrape state.
```json
{
  "status": "ok",
  "events_loaded": 842,
  "last_scraped": "2026-02-28T20:00:00+00:00",
  "scrape_running": false,
  "scrape_interval_seconds": 3600
}
```

#### `GET /events`
Returns all cached events in the standard JSON format.
```bash
curl http://localhost:8080/events
```

```json
{
  "scraped_at": "2026-02-28T20:00:00+00:00",
  "count": 842,
  "events": [
    {
      "title": "Flatland Climbing Competition",
      "url": "https://events.unl.edu/2026/02/28/195255/",
      "start": "2026-02-28T09:00:00-06:00",
      "end": "2026-02-28T16:00:00-06:00",
      "location": "Campus Recreation Center",
      "description": "Connect with climbers from around the Mid-West...",
      "group": "Campus Recreation",
      "image_url": "https://...",
      "audience": ["Recreation", "Sports"],
      "source": "https://events.unl.edu/upcoming/?format=rss&limit=-1"
    }
  ]
}
```

#### `GET /search`
Search events with a natural-language query.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | required | Search query (e.g. `"free food this weekend"`) |
| `top` | int | `10` | Max results (1–100) |
| `model` | string | `llama3.2:1b` | Ollama model for keyword expansion |
| `no_llm` | bool | `false` | Skip Ollama, use raw keywords only |

```bash
curl "http://localhost:8080/search?q=free+food+this+weekend&top=5"
```

```json
{
  "query": "free food this weekend",
  "terms": ["free", "food", "lunch", "snacks"],
  "llm_used": true,
  "date_range": {"start": "2026-03-01", "end": "2026-03-02"},
  "total_searched": 127,
  "count": 3,
  "results": [
    {
      "score": 12,
      "title": "Free Pizza — Engineering Open House",
      "url": "https://events.unl.edu/...",
      "start": "2026-03-01T12:00:00",
      "location": "Scott Engineering Center",
      "group": "College of Engineering",
      "image_url": "https://..."
    }
  ]
}
```

#### `POST /reload`
Trigger an immediate re-scrape without waiting for the next scheduled interval.
```bash
curl -X POST http://localhost:8080/reload
```
Returns `409` if a scrape is already running.

#### `GET /docs`
Interactive Swagger UI — try all endpoints in the browser.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPE_INTERVAL` | `3600` | Seconds between re-scrapes. |
| `SCRAPE_WORKERS` | `10` | Parallel workers for per-event detail enrichment. |
| `OLLAMA_MODEL` | `llama3.2:1b` | Ollama model used for keyword expansion. |
| `OLLAMA_URL` | `http://ollama:11434/api/generate` | Ollama API endpoint. |
| `EVENTS_FILE` | `scraped/events.json` | Path to the cached events JSON inside the container. |

### Running Locally (without Docker)

Requires Python 3.10+ and [Ollama](https://ollama.com) running locally.

```bash
# Install dependencies
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r api/requirements.txt

# Populate the cache with a one-time scrape
python api/scraper.py

# Start the API (Ollama optional — search works without it)
uvicorn api.api:app --reload
```

The API will be at **http://localhost:8000**.
