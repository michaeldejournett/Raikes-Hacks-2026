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

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "Deployed! Useful commands:"
echo "  railway logs --service backend"
echo "  railway logs --service api"
echo "  railway open"
