#!/usr/bin/env node
// Pre-start script: downloads events from EVENTS_API_URL into scraped/events.json
// Run before index.js so the DB seeds from real data instead of fallback events.
// If EVENTS_API_URL is not set or the request fails, exits cleanly (fallback takes over).

import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const url = process.env.EVENTS_API_URL
if (!url) {
  console.log('EVENTS_API_URL not set — skipping event fetch')
  process.exit(0)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dest = path.join(__dirname, '..', 'scraped', 'events.json')

fs.mkdirSync(path.dirname(dest), { recursive: true })

console.log(`Fetching events from ${url} …`)

const client = url.startsWith('https') ? https : http

const req = client.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Events API returned ${res.statusCode} — skipping`)
    process.exit(0)
  }
  const file = fs.createWriteStream(dest)
  res.pipe(file)
  file.on('finish', () => {
    file.close()
    console.log(`Events written to ${dest}`)
    process.exit(0)
  })
})

req.on('error', (err) => {
  console.error(`Could not reach events API: ${err.message} — skipping`)
  process.exit(0)
})

req.setTimeout(15000, () => {
  console.error('Events API timed out — skipping')
  req.destroy()
  process.exit(0)
})
