# Curia — Architecture

## System Overview

```mermaid
flowchart TB
  subgraph user [Users]
    Browser["Browser"]
  end

  subgraph frontend [Frontend - React + Vite]
    App["App.jsx"]
    EventList["Event List + Filters"]
    EventDetail["Event Detail + Groups"]
    API["api.js (fetch wrapper)"]
  end

  subgraph backend [Backend - Express + SQLite]
    Express["Express Server (port 3001)"]
    EventsRoute["/api/events"]
    GroupsRoute["/api/groups"]
    SQLite["SQLite (gather.db)"]
  end

  subgraph scraper [Scraper - Docker]
    FastAPI["FastAPI (port 8080)"]
    Scraper["scraper.py"]
    Ollama["Ollama LLM"]
    ScrapedJSON["scraped/events.json"]
  end

  subgraph external [External Sources]
    UNL["events.unl.edu"]
    Engage["Campus Labs Engage"]
  end

  Browser --> App
  App --> EventList
  App --> EventDetail
  EventList --> API
  EventDetail --> API
  API -->|"HTTP /api/*"| Express
  Express --> EventsRoute
  Express --> GroupsRoute
  EventsRoute --> SQLite
  GroupsRoute --> SQLite

  Scraper -->|"RSS + HTML"| UNL
  Scraper -->|"JSON API"| Engage
  Scraper --> ScrapedJSON
  FastAPI --> Scraper
  FastAPI -->|"keyword expansion"| Ollama
  ScrapedJSON -->|"seeds on startup"| SQLite
```

## Data Flow

```mermaid
sequenceDiagram
  participant S as Scraper (Docker)
  participant F as scraped/events.json
  participant B as Express Backend
  participant DB as SQLite
  participant FE as React Frontend

  Note over S,F: One-time or periodic scrape
  S->>F: Write 1500+ UNL events

  Note over B,DB: On server startup
  B->>F: Check if file exists
  F-->>B: Return events JSON
  B->>DB: Seed events table (with field mapping)

  Note over FE,DB: Runtime
  FE->>B: GET /api/events
  B->>DB: SELECT * FROM events
  DB-->>B: Event rows
  B-->>FE: JSON response

  FE->>B: POST /api/groups
  B->>DB: INSERT INTO groups
  DB-->>B: New group
  B-->>FE: Created group JSON

  FE->>B: POST /api/groups/:id/join
  B->>DB: INSERT INTO group_members
  B-->>FE: Updated group JSON
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
    text tags
    text url
    text image_url
  }

  groups {
    int id PK
    int event_id FK
    text name
    text description
    text creator
    text created_at
  }

  group_members {
    int id PK
    int group_id FK
    text member_name
    text joined_at
  }

  events ||--o{ groups : "has"
  groups ||--o{ group_members : "has"
```

## Project Structure

```
Raikes-Hacks-2026/
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── App.jsx            # Main app — fetches events, routing
│   │   ├── api.js             # API client (fetch wrapper)
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── SearchFilters.jsx
│   │   │   ├── DateRangePicker.jsx
│   │   │   ├── EventCard.jsx
│   │   │   ├── EventDetail.jsx
│   │   │   └── GroupModal.jsx
│   │   ├── data/events.js     # Category metadata + fallback data
│   │   └── utils/icsGenerator.js
│   └── vite.config.js         # Dev proxy: /api -> localhost:3001
│
├── backend/                   # Express + SQLite
│   ├── index.js               # Server entry point
│   ├── db.js                  # DB connection, table creation, seeding
│   └── routes/
│       ├── events.js          # GET /api/events, GET /api/events/:id
│       └── groups.js          # GET/POST /api/groups, POST /api/groups/:id/join
│
├── api/                       # Python FastAPI scraper
│   ├── api.py                 # FastAPI app — /search, /health, /reload
│   ├── scraper.py             # UNL RSS + Engage scraper
│   ├── search.py              # Keyword search + Ollama LLM expansion
│   └── Dockerfile
│
├── scraped/events.json        # Scraper output — read by Express on startup
├── docker-compose.yml         # Ollama + FastAPI scraper
├── railway.json               # Railway deployment config
└── package.json               # Root scripts (npm start)
```
