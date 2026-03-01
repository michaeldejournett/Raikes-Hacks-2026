#!/usr/bin/env bash
# deploy.sh — Deploy all 3 Curia services to Railway
# Each service is deployed from its own subdirectory using its own railway.json.
#
# Services:
#   backend  → backend/   (Express API)
#   api      → api/       (FastAPI scraper)
#   frontend → frontend/  (React static site)
#
# Usage: ./deploy.sh

set -euo pipefail

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

command -v railway &>/dev/null || die "Railway CLI not found. Install: npm i -g @railway/cli"
railway whoami &>/dev/null    || die "Not logged in. Run: railway login"
railway status &>/dev/null    || die "No project linked. Run: railway link"

# All 3 services deploy from the REPO ROOT so scraped/events.json is available.
# Each service uses its own railway.json (set via railwayConfigFile in Railway dashboard).

log "Deploying backend (Express API)..."
railway up --service backend --detach 
log "Deploying api (FastAPI scraper)..."
railway up --service api --detach 
log "Deploying frontend (React)..."
railway up --service frontend --detach 
echo ""
echo "All 3 deploys triggered. Check status:"
echo "  railway service status --service backend"
echo "  railway service status --service api"
echo "  railway service status --service frontend"
echo ""
echo "View logs:"
echo "  railway logs --service backend"
echo "  railway logs --service api"
echo "  railway logs --service frontend"
