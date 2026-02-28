# Gather Events

An event discovery app built for **RaikesHacks 2026**. Find events near you, filter by category/date/price/location, create groups to attend together, and download calendar files.

> Project by team **"Is There Input Length Validation?"** — Michael, Will, and Rishi.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** PostgreSQL

## Quick Start

From the repo root in PowerShell or Command Prompt:

```
.\start.bat
```

This installs dependencies and starts the dev server. Then open **http://localhost:5173** in your browser.

> **Note:** If you've already run it once, `npm install` will be fast since packages are cached.

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (or a remote connection string)

### 1. Set up the database

Create a PostgreSQL database:

```bash
createdb gather_events
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set your `DATABASE_URL` (the default works if Postgres is running locally with default settings).

### 3. Start the backend

```bash
cd backend
npm install
npm run dev
```

The API runs on `http://localhost:3001`. Tables are created and seeded automatically on first run.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to the backend.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List all events (includes group counts) |
| GET | `/api/events/:id` | Get single event |
| GET | `/api/groups?eventId=` | List groups for an event |
| POST | `/api/groups` | Create a group |
| POST | `/api/groups/:id/join` | Join a group |

## Deploying to Render (Free)

1. Push your repo to GitHub
2. On [render.com](https://render.com), create a **PostgreSQL** database (free tier)
3. Create a **Web Service** pointing to your repo:
   - **Build command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - **Start command:** `cd backend && node index.js`
   - **Environment variables:**
     - `DATABASE_URL` → copy the **Internal Database URL** from your Render Postgres instance
     - `NODE_ENV` → `production`
4. Deploy — the backend serves the frontend and API from a single URL
