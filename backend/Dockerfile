FROM node:20-slim

WORKDIR /app

# better-sqlite3 compiles a native addon — needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
