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
