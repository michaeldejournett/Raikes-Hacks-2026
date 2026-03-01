FROM python:3.12-slim

WORKDIR /app

COPY api/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY api/search.py api/api.py api/scraper.py ./

# Copy scraped data for warm cache on first boot
COPY scraped/ scraped/

ENV EVENTS_FILE=scraped/events.json
ENV SCRAPE_INTERVAL=3600
ENV SCRAPE_WORKERS=10

EXPOSE 8000

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
