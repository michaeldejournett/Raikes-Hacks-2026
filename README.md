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
