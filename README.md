# Raikes-Hacks-2026

Python MVP app to scrape event data from [events.unl.edu](https://events.unl.edu/) and save it as JSON.

## What it does

- Pulls HTML from a UNL events page.
- Extracts event data from JSON-LD if available.
- Falls back to HTML parsing for common event-card structures.
- Writes results to a JSON file.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scraper.py --pretty
```

This creates `events.json` in the project root.

## CLI options

```bash
python scraper.py --url "https://events.unl.edu/" --output "events.json" --pretty
```

- `--url`: listing page URL to scrape.
- `--output`: output file path.
- `--timeout`: request timeout in seconds (default 20).
- `--pretty`: pretty-print JSON.

## Output shape

```json
{
	"scraped_at": "2026-02-28T00:00:00Z",
	"source_url": "https://events.unl.edu/",
	"count": 2,
	"events": [
		{
			"title": "Example Event",
			"url": "https://events.unl.edu/example",
			"start": "2026-03-01T18:00:00-06:00",
			"end": null,
			"location": "Nebraska Union",
			"description": "Event details...",
			"source": "https://events.unl.edu/"
		}
	]
}
```

## Notes

- Website markup can change, so selector updates may occasionally be needed.
- If you want pagination/date-range scraping, this script is a good base to extend.
