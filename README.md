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

That's it. The backend starts on `http://localhost:3001` with a SQLite database (auto-created, no setup needed). If `scraped/events.json` exists (from the scraper), real UNL events are loaded automatically. Otherwise, sample events are used as a fallback.

Then in a second terminal, start the frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` — the frontend proxies API calls to the backend automatically.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express + SQLite (events + groups API)
- **Scraper:** Python + FastAPI + Ollama (UNL event scraping + LLM search — runs via Docker)

## Architecture

1. **Express API** (`backend/`) — Serves events and the LFG groups feature (create/join groups). Uses SQLite, zero config. On startup, loads real scraped events from `scraped/events.json` if available.
2. **FastAPI Scraper** (`api/`) — Scrapes real UNL events from events.unl.edu + Campus Labs Engage, with LLM-powered natural-language search via Ollama. Runs in Docker. Outputs to `scraped/events.json`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List all events (includes group counts) |
| GET | `/api/events/:id` | Get a single event |
| GET | `/api/groups?eventId=` | List groups for an event |
| POST | `/api/groups` | Create a group |
| POST | `/api/groups/:id/join` | Join a group |

## Running Everything via Docker

`docker compose up --build` starts all three services together:

| Service | Port | Description |
|---------|------|-------------|
| `backend` | `3001` | Express + SQLite (events & groups API) |
| `api` | `8080` | FastAPI scraper + LLM search |
| `ollama` | — | Local LLM inference (internal only) |

```bash
# Mac / CPU-only / Windows
docker compose up --build

# Linux + NVIDIA GPU
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up --build

# Linux + AMD GPU (ROCm)
docker compose -f docker-compose.yml -f docker-compose.amd.yml up --build
```

On first run the `api` service scrapes events.unl.edu and writes to `scraped/events.json`. The `backend` service loads those events into SQLite automatically. The SQLite database persists across restarts via the `backend_db` Docker volume.

## Deploying to Railway (Free)

1. Push your repo to GitHub
2. Sign up at [railway.app](https://railway.app) and create a new project from your GitHub repo
3. Railway auto-detects the `railway.json` config — no manual setup needed
4. Set the environment variable `NODE_ENV` = `production`
5. Deploy — the app is live at the URL Railway provides

The `scraped/events.json` file in your repo is included in the deploy, so real events load automatically.
