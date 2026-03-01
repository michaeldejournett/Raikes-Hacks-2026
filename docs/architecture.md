# Curia — Architecture

## System Overview

```mermaid
flowchart TB
  subgraph user [Users]
    Browser["Browser (Google OAuth)"]
  end

  subgraph frontend [Frontend - React + Vite]
    App["App.jsx"]
    EventList["Event List + Filters"]
    EventDetail["Event Detail + Groups"]
    Navbar["Navbar (search + auth)"]
    API["api.js (fetch wrapper)"]
  end

  subgraph backend [Backend - Express + SQLite]
    Express["Express Server (port 3001)"]
    AuthRoute["/api/auth (Google OAuth)"]
    EventsRoute["/api/events (+ AI search)"]
    GroupsRoute["/api/groups (+ messages)"]
    Keywords["keywords.js (generalization)"]
    SQLite["SQLite (gather.db)"]
    Session["express-session"]
  end

  subgraph scraper [Scraper - Docker / Railway]
    FastAPI["FastAPI (port 8080)"]
    Scraper["scraper.py"]
    Ollama["Ollama LLM (optional)"]
    ScrapedJSON["scraped/events.json"]
  end

  subgraph external [External]
    UNL["events.unl.edu"]
    Engage["Campus Labs Engage"]
    Google["Google OAuth"]
  end

  Browser --> App
  App --> EventList & EventDetail & Navbar
  EventList & EventDetail & Navbar --> API
  API -->|"HTTP /api/*"| Express
  Express --> AuthRoute & EventsRoute & GroupsRoute
  AuthRoute --> Session
  AuthRoute -->|"verify identity"| Google
  EventsRoute -->|"keyword expansion"| FastAPI
  EventsRoute --> Keywords
  Keywords --> SQLite
  GroupsRoute --> SQLite
  EventsRoute --> SQLite

  Scraper -->|"RSS + HTML"| UNL
  Scraper -->|"JSON API"| Engage
  Scraper --> ScrapedJSON
  FastAPI --> Scraper
  FastAPI -->|"keyword expansion"| Ollama
  ScrapedJSON -->|"seeds on startup"| SQLite
  FastAPI -->|"periodic refresh"| Express
```

## Data Flow

```mermaid
sequenceDiagram
  participant S as FastAPI Scraper
  participant B as Express Backend
  participant KW as keywords.js
  participant DB as SQLite
  participant FE as React Frontend
  participant G as Google

  Note over S,B: Periodic refresh (default: 1 hour)
  B->>S: GET /events
  S-->>B: 1500+ UNL events JSON
  B->>KW: generalizeText(title + description)
  KW-->>B: Generalized tags (food, science, sports…)
  B->>DB: INSERT new events (deduplicated by URL)

  Note over FE,G: Authentication
  FE->>B: GET /api/auth/google
  B->>G: Redirect to Google sign-in
  G-->>B: OAuth callback with profile
  B->>DB: Upsert user record
  B-->>FE: Redirect + session cookie

  Note over FE,DB: Event browsing
  FE->>B: GET /api/events
  B->>DB: SELECT * FROM events ORDER BY date
  DB-->>B: Event rows
  B-->>FE: JSON with groupCount

  Note over FE,DB: AI search
  FE->>B: GET /api/events/search?q=food near campus
  B->>S: GET /search?q=food near campus (term expansion)
  S-->>B: Expanded terms [food, dining, restaurant, campus]
  B->>DB: SELECT all events
  B-->>FE: Scored + ranked results (all matches, no cap)

  Note over FE,DB: Groups
  FE->>B: POST /api/groups
  B->>DB: INSERT INTO groups
  B-->>FE: Created group

  FE->>B: POST /api/groups/:id/join
  B->>DB: INSERT INTO group_members
  B-->>FE: Updated group

  FE->>B: POST /api/groups/:id/messages
  B->>DB: INSERT INTO group_messages
  B-->>FE: New message
```

## Database Schema

```mermaid
erDiagram
  events {
    int id PK
    text name
    text description
    text date
    text time
    text end_date
    text end_time
    text location
    text venue
    real price
    text category
    text tags "JSON array — includes generalized keywords"
    text url
    text image_url
  }

  users {
    int id PK
    text google_id
    text name
    text email
    text picture
    text created_at
  }

  groups {
    int event_id FK
    text name
    text description
    text creator
    text creator_email
    text creator_phone
    int capacity
    text meetup_details
    text vibe_tags
    int creator_id FK
    text created_at
  }

  group_members {
    int id PK
    int group_id FK
    text member_name
    int user_id FK
    text joined_at
  }

  group_messages {
    int id PK
    int group_id FK
    text author
    text body
    text created_at
  }

  events ||--o{ groups : "has"
  users ||--o{ groups : "creates"
  groups ||--o{ group_members : "has"
  users ||--o{ group_members : "joins"
  groups ||--o{ group_messages : "has"
```

## Project Structure

```
Raikes-Hacks-2026/
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── App.jsx            # Main app — events, search, auth state
│   │   ├── api.js             # API client (fetch wrapper, credentials: include)
│   │   ├── components/
│   │   │   ├── Navbar.jsx         # Search bar + Google sign-in/out
│   │   │   ├── SearchFilters.jsx  # Category / date filters + pagination
│   │   │   ├── EventCard.jsx      # Event tile with image, date in CT
│   │   │   ├── EventDetail.jsx    # Full event view + group management
│   │   │   └── GroupModal.jsx     # Create/view group modal
│   │   └── index.css
│   └── vite.config.js         # Dev proxy: /api -> localhost:3001
│
├── backend/                   # Express + SQLite
│   ├── index.js               # Server entry, middleware, periodic refresh
│   ├── db.js                  # DB init, seeding, insertNewEvents()
│   ├── keywords.js            # Keyword generalization map (pizza→food, etc.)
│   └── routes/
│       ├── auth.js            # Google OAuth (passport-google-oauth20)
│       ├── events.js          # GET /api/events, search (AI scoring)
│       └── groups.js          # CRUD groups, join/leave, messages
│
├── api/                       # Python FastAPI scraper
│   ├── api.py                 # FastAPI app — /search, /events, /health, /reload
│   ├── scraper.py             # UNL RSS + Engage scraper
│   ├── search.py              # Keyword search + optional Ollama expansion
│   └── Dockerfile
│
├── scraped/events.json        # Scraper output — seeds SQLite on startup
├── .env.example               # Required environment variables
├── deploy.sh                  # One-command Railway deployment script
├── docker-compose.yml         # Local: Ollama + FastAPI + backend
└── railway.json               # Railway deployment config
```

## Search Architecture

Search works in two layers:

**Index time** (`keywords.js` + `db.js`): When events are inserted, their title and description are run through a generalization map that adds parent-category tags. An event mentioning "pizza" gets `["food", "dining"]` added to its tags. An event mentioning "biology" gets `["science", "stem"]`.

**Query time** (`routes/events.js` + FastAPI): When a search query comes in, it's sent to FastAPI for term expansion (using Ollama if available, raw tokenization otherwise). The expanded terms are then scored against every event's name (4×), venue (2×), category (2×), description (1×), and tags (1×). All matching events are returned ranked by score — no cap on results.

## Deployment (Railway)

Two Railway services:

| Service | Source | Description |
|---------|--------|-------------|
| `backend` | repo root (`railway.json`) | Express + React static build |
| `api` | `api/` directory | FastAPI scraper |

`deploy.sh` deploys both, detects the API service's public domain, and wires `FASTAPI_URL` / `EVENTS_API_URL` on the backend automatically.

Key production environment variables on the `backend` service:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | (random string) |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://<backend-domain>/api/auth/google/callback` |
| `FRONTEND_URL` | `https://<backend-domain>` |
| `FASTAPI_URL` | `https://<api-domain>` |
| `EVENTS_API_URL` | `https://<api-domain>/events` |
