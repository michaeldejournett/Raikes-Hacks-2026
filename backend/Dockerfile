FROM node:20-slim

WORKDIR /app

# better-sqlite3 compiles a native addon — needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .

# Copy scraped events for DB seeding on first boot
COPY scraped/ ../scraped/

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "index.js"]
