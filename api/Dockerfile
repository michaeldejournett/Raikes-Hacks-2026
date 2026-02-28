FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY search.py api.py scraper.py ./

ENV EVENTS_FILE=scraped/events.json
# Point to Ollama on the host. Override with docker run -e OLLAMA_URL=...
ENV OLLAMA_URL=http://host.docker.internal:11434/api/generate
ENV OLLAMA_MODEL=llama3.2:1b
# Re-scrape interval in seconds (default: 1 hour). Set to 0 to disable after first scrape.
ENV SCRAPE_INTERVAL=3600
# Parallel workers for event detail enrichment
ENV SCRAPE_WORKERS=10

# Mount a volume here to persist scraped data across restarts:
#   docker run -v ./scraped:/app/scraped ...
VOLUME /app/scraped

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
