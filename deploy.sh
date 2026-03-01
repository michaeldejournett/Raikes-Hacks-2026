#!/usr/bin/env bash
# deploy.sh — Deploy Curia to Railway
# Usage: ./deploy.sh

set -euo pipefail

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

command -v railway &>/dev/null || die "Railway CLI not found. Install with: npm install -g @railway/cli"
railway whoami &>/dev/null || { log "Not logged in..."; railway login; }

# ── Verify project is linked ──────────────────────────────────────────────────

railway status &>/dev/null || die "No Railway project linked. Run: railway link"

# ── Create services if they don't exist ──────────────────────────────────────

log "Creating services (skipped if already exist)..."
railway add --service backend 2>/dev/null || true
railway add --service api     2>/dev/null || true

# ── Deploy: backend + frontend (root railway.json) ────────────────────────────

log "Deploying backend + frontend..."
railway up --service backend --detach --no-gitignore

# ── Deploy: FastAPI scraper (api/ subdirectory) ───────────────────────────────

log "Deploying api (scraper)..."
(cd api && railway up --service api --detach)

# ── Generate public domains ───────────────────────────────────────────────────

log "Ensuring public domains exist..."
railway domain --service backend 2>/dev/null || true
railway domain --service api     2>/dev/null || true

# ── Wire up environment variables ─────────────────────────────────────────────

log "Setting environment variables..."

# Grab the api service's public domain so the backend can reach it
API_DOMAIN=$(railway domain --service api 2>&1 | grep -oP '[a-z0-9-]+\.up\.railway\.app' | head -1)

if [ -n "$API_DOMAIN" ]; then
  railway variable --service backend set \
    FASTAPI_URL="https://${API_DOMAIN}" \
    EVENTS_API_URL="https://${API_DOMAIN}/events"
  echo "  FASTAPI_URL   = https://${API_DOMAIN}"
  echo "  EVENTS_API_URL= https://${API_DOMAIN}/events"
else
  echo "  Could not detect api domain — set manually:"
  echo "    railway variable --service backend set FASTAPI_URL=https://<api-domain>.up.railway.app"
  echo "    railway variable --service backend set EVENTS_API_URL=https://<api-domain>.up.railway.app/events"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "Deployed! Useful commands:"
echo "  railway logs --service backend"
echo "  railway logs --service api"
echo "  railway open"
