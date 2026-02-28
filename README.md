# Gather Events

An event discovery app with a **Looking For Group** feature — find events near you and organize groups to attend together.

## Quick Start

> **Prerequisites:** Node.js 18+ ([download](https://nodejs.org))

```bash
git clone https://github.com/YOUR_USERNAME/Raikes-Hacks-2026.git
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
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3) — zero config, no install needed

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List all events (includes group counts) |
| GET | `/api/events/:id` | Get a single event |
| GET | `/api/groups?eventId=` | List groups for an event |
| POST | `/api/groups` | Create a group |
| POST | `/api/groups/:id/join` | Join a group |

## Deploying to Render (Free)

1. Push your repo to GitHub
2. On [render.com](https://render.com), create a **Web Service** pointing to your repo:
   - **Build command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - **Start command:** `cd backend && node index.js`
   - **Environment variable:** `NODE_ENV` = `production`
3. Deploy — the backend serves both the API and the built frontend from one URL
This is the RaikesHacks 2026 project for the team "Is There Input Length Validation?" consisting of Michael, Will, and Rishi.

---

## UNL Events Search API

A self-updating event aggregator and natural-language search API for the University of Nebraska–Lincoln. Scrapes [events.unl.edu](https://events.unl.edu) and [Campus Labs Engage](https://unl.campuslabs.com/engage/events), deduplicates, and exposes a search endpoint powered by keyword matching with optional local LLM expansion.

### Features

- Scrapes all upcoming UNL events via RSS + per-event enrichment (image, group, audience)
- Scrapes Campus Labs Engage events and cross-deduplicates with the UNL feed
- Periodic background re-scraping (default: every hour) — no restarts needed to stay fresh
- Natural-language search with date parsing (`"free food this weekend"`, `"events tomorrow"`)
- Optional keyword expansion via a local [Ollama](https://ollama.com) model (runs inside Docker)
- REST API with Swagger UI at `/docs`

### Project Structure

```
├── api/
│   ├── api.py            # FastAPI app — endpoints, periodic scrape loop
│   ├── scraper.py        # Web scraper (events.unl.edu + Campus Labs Engage)
│   ├── search.py         # Keyword search, date filtering, Ollama integration
│   ├── requirements.txt
│   └── Dockerfile
├── scraped/              # Runtime data — gitignored, mounted as a Docker volume
├── docker-compose.yml          # Default: CPU / Mac
├── docker-compose.nvidia.yml   # Overlay: NVIDIA GPU
└── docker-compose.amd.yml      # Overlay: AMD GPU (ROCm, Linux only)
```

### Quick Start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine + Compose (Linux), ~2 GB free disk for the model.

**Mac / CPU-only / Windows:**
```bash
docker compose up --build
```

**Linux or Windows + NVIDIA GPU:**
```bash
# Linux: install nvidia-container-toolkit first
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up --build
```

**Linux + AMD GPU (ROCm):**
```bash
# Requires ROCm drivers — https://rocm.docs.amd.com/projects/install-on-linux/en/latest/
# Add your user to the video and render groups first:
#   sudo usermod -aG video,render $USER
docker compose -f docker-compose.yml -f docker-compose.amd.yml up --build
```

> **First run:** The `llama3.2:1b` model (~1.3 GB) downloads automatically. Subsequent starts are instant — the model is cached in the `ollama_data` Docker volume.

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
