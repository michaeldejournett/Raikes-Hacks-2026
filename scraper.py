#!/usr/bin/env python3
import argparse
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from datetime import datetime, date
from typing import Iterable, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


DEFAULT_BASE_URL = "https://events.unl.edu/"
DEFAULT_TIMEOUT = 20
USER_AGENT = "Raikes-Hacks-2026-UNL-Scraper/1.0"


@dataclass
class Event:
    title: str
    url: str
    start: Optional[str] = None
    end: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    group: Optional[str] = None
    image_url: Optional[str] = None
    audience: Optional[List[str]] = None
    source: Optional[str] = None


def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def fetch_html(url: str, timeout: int = DEFAULT_TIMEOUT) -> str:
    response = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.text


def _as_list(value):
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def extract_group_from_description(text: str) -> Optional[str]:
    """Parse the calendar/group name embedded at the end of an RSS description.

    UNL RSS descriptions end with the pattern:
        [optional group name]Status: CONFIRMED | [type] |
    The group name (if present) is concatenated directly before "Status:" with
    no separator, so we grab whatever title-case text sits at the tail.
    """
    if not text:
        return None
    idx = text.find("Status:")
    if idx == -1:
        return None
    before = text[:idx].rstrip()
    match = re.search(r"([A-Z][A-Za-z\s&'-]+)$", before)
    if match:
        candidate = match.group(1).strip()
        if 1 < len(candidate) < 100:
            return candidate
    return None


# ---------------------------------------------------------------------------
# RSS scraper — cleanest source, covers all upcoming events in one request
# ---------------------------------------------------------------------------

def scrape_rss(limit: int = -1, timeout: int = DEFAULT_TIMEOUT) -> List[Event]:
    """Fetch all upcoming events via the RSS feed."""
    url = f"https://events.unl.edu/upcoming/?format=rss&limit={limit}"
    response = requests.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    response.raise_for_status()
    return parse_rss_events(response.text, url)


def parse_rss_events(xml_text: str, source_url: str) -> List[Event]:
    events: List[Event] = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return events

    ns = {"content": "http://purl.org/rss/1.0/modules/content/"}
    channel = root.find("channel")
    if channel is None:
        return events

    for item in channel.findall("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")

        title = clean_text(title_el.text) if title_el is not None else None
        if not title:
            continue

        # links come as protocol-relative //events.unl.edu/...
        raw_link = (link_el.text or "").strip() if link_el is not None else ""
        event_url = raw_link if raw_link.startswith("http") else "https:" + raw_link

        start = end = location = description = group = None

        if desc_el is not None and desc_el.text:
            desc_soup = BeautifulSoup(desc_el.text, "html.parser")

            dtstart = desc_soup.find("abbr", class_="dtstart")
            if dtstart:
                start = clean_text(dtstart.get("title"))

            dtend = desc_soup.find("abbr", class_="dtend")
            if dtend:
                end = clean_text(dtend.get("title"))

            # location is in a <small> that follows the time smalls
            smalls = desc_soup.find_all("small")
            # typically: [date string, time string, location string]
            if len(smalls) >= 3:
                location = clean_text(smalls[2].get_text())
            elif len(smalls) == 2:
                location = clean_text(smalls[1].get_text())

            # strip the small metadata tags then grab remaining text as description
            for tag in desc_soup.find_all("small"):
                tag.decompose()
            full_text = desc_soup.get_text()
            group = extract_group_from_description(full_text)
            description = clean_text(full_text)

        events.append(
            Event(
                title=title,
                url=event_url or source_url,
                start=start,
                end=end,
                location=location,
                description=description,
                group=group,
                source=source_url,
            )
        )

    return dedupe_events(events)


# ---------------------------------------------------------------------------
# Date-range scraper — iterates month-by-month HTML pages
# ---------------------------------------------------------------------------

def month_urls(start: date, end: date) -> List[str]:
    """Return monthly view URLs between start and end (inclusive by month)."""
    urls = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        urls.append(f"https://events.unl.edu/{year}/{month:02d}/")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return urls


def scrape_month(url: str, timeout: int = DEFAULT_TIMEOUT) -> List[Event]:
    """Scrape a single monthly listing page."""
    html = fetch_html(url, timeout=timeout)
    soup = BeautifulSoup(html, "html.parser")

    # Try JSON-LD first (richest data)
    events = parse_events_from_jsonld(soup, url)
    if events:
        return events

    # Fall back to the <li><time><a> pattern used on month views
    events = []
    for li in soup.select("li"):
        a = li.select_one("a[href]")
        if not a:
            continue
        href = a.get("href", "")
        # only event detail links like /2026/02/28/190514/
        if not re.search(r"/\d{4}/\d{2}/\d{2}/\d+/", href):
            continue
        title = clean_text(a.get_text())
        if not title:
            continue
        time_el = li.select_one("time")
        start = clean_text(time_el.get("datetime") or time_el.get_text()) if time_el else None
        event_url = "https:" + href if href.startswith("//") else urljoin(url, href)
        events.append(Event(title=title, url=event_url, start=start, source=url))

    return dedupe_events(events)


def scrape_date_range(
    start: date,
    end: date,
    timeout: int = DEFAULT_TIMEOUT,
) -> List[Event]:
    """Scrape all events across a date range by iterating monthly pages."""
    all_events: List[Event] = []
    for url in month_urls(start, end):
        print(f"  Fetching {url} …")
        try:
            all_events.extend(scrape_month(url, timeout=timeout))
        except requests.RequestException as exc:
            print(f"  Warning: could not fetch {url}: {exc}")
    return dedupe_events(all_events)


# ---------------------------------------------------------------------------
# JSON-LD + HTML parsers (kept from original)
# ---------------------------------------------------------------------------

def parse_events_from_jsonld(soup: BeautifulSoup, source_url: str) -> List[Event]:
    events: List[Event] = []

    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        if not tag.string:
            continue
        raw = tag.string.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue

        nodes = _as_list(data)
        expanded_nodes = []
        for node in nodes:
            if isinstance(node, dict) and "@graph" in node:
                expanded_nodes.extend(_as_list(node.get("@graph")))
            else:
                expanded_nodes.append(node)

        for node in expanded_nodes:
            if not isinstance(node, dict):
                continue
            node_type = node.get("@type")
            node_types = {node_type} if isinstance(node_type, str) else set(_as_list(node_type))
            if "Event" not in node_types:
                continue

            name = clean_text(node.get("name"))
            if not name:
                continue

            event_url = node.get("url") or source_url
            if event_url:
                event_url = urljoin(source_url, event_url)

            location = None
            location_data = node.get("location")
            if isinstance(location_data, dict):
                location = clean_text(location_data.get("name") or location_data.get("address"))
            elif isinstance(location_data, str):
                location = clean_text(location_data)

            events.append(
                Event(
                    title=name,
                    url=event_url or source_url,
                    start=clean_text(node.get("startDate")),
                    end=clean_text(node.get("endDate")),
                    location=location,
                    description=clean_text(node.get("description")),
                    source=source_url,
                )
            )

    return dedupe_events(events)


def parse_events_from_html(soup: BeautifulSoup, source_url: str) -> List[Event]:
    events: List[Event] = []

    selectors = [
        "article.event",
        ".event-card",
        ".events-list .event",
        "li.event",
        ".vevent",
    ]

    event_nodes = []
    for selector in selectors:
        event_nodes = soup.select(selector)
        if event_nodes:
            break

    if not event_nodes:
        for link in soup.select("a[href]"):
            href = link.get("href", "")
            if "/event/" in href or "/events/" in href:
                title = clean_text(link.get_text())
                if not title:
                    continue
                events.append(
                    Event(
                        title=title,
                        url=urljoin(source_url, href),
                        source=source_url,
                    )
                )
        return dedupe_events(events)

    for node in event_nodes:
        title_el = node.select_one("h1 a, h2 a, h3 a, .event-title a, .summary a")
        title = clean_text(title_el.get_text()) if title_el else None
        href = title_el.get("href") if title_el else None

        if not title:
            title_plain = node.select_one("h1, h2, h3, .event-title, .summary")
            title = clean_text(title_plain.get_text()) if title_plain else None

        if not title:
            continue

        datetime_el = node.select_one("time")
        start = clean_text(datetime_el.get("datetime")) if datetime_el else None

        location_el = node.select_one(".location, .event-location, .where")
        location = clean_text(location_el.get_text()) if location_el else None

        description_el = node.select_one(".description, .summary, p")
        description = clean_text(description_el.get_text()) if description_el else None

        events.append(
            Event(
                title=title,
                url=urljoin(source_url, href) if href else source_url,
                start=start,
                location=location,
                description=description,
                source=source_url,
            )
        )

    return dedupe_events(events)


def dedupe_events(events: Iterable[Event]) -> List[Event]:
    deduped: List[Event] = []
    seen = set()
    for event in events:
        key = (event.title.lower().strip(), event.url.strip().lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(event)
    return deduped


def scrape_events(url: str, timeout: int = DEFAULT_TIMEOUT) -> List[Event]:
    html = fetch_html(url, timeout=timeout)
    soup = BeautifulSoup(html, "html.parser")
    jsonld_events = parse_events_from_jsonld(soup, url)
    if jsonld_events:
        return jsonld_events
    return parse_events_from_html(soup, url)


# ---------------------------------------------------------------------------
# Campus Labs Engage scraper
# ---------------------------------------------------------------------------

ENGAGE_API = "https://unl.campuslabs.com/engage/api/discovery/event/search"
ENGAGE_IMAGE_BASE = "https://se-images.campuslabs.com/clink/images/"
ENGAGE_EVENT_BASE = "https://unl.campuslabs.com/engage/event/"
ENGAGE_SOURCE_URL = "https://unl.campuslabs.com/engage/events"


def scrape_engage(timeout: int = DEFAULT_TIMEOUT) -> List[Event]:
    """Page through the Campus Labs Engage API and return all upcoming public events."""
    today = date.today().isoformat()
    events: List[Event] = []
    skip = 0
    take = 100
    total: Optional[int] = None

    while total is None or skip < total:
        params = {
            "endsAfter": today,
            "orderByField": "startsOn",
            "orderByDirection": "ascending",
            "status": "Approved",
            "take": take,
            "skip": skip,
        }
        response = requests.get(
            ENGAGE_API,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()

        if total is None:
            total = data.get("@odata.count", 0)

        items = data.get("value") or []
        if not items:
            break

        for item in items:
            desc_html = item.get("description") or ""
            desc = clean_text(BeautifulSoup(desc_html, "html.parser").get_text()) if desc_html else None

            img_path = item.get("imagePath")
            image_url = (ENGAGE_IMAGE_BASE + img_path) if img_path else None

            event_id = item.get("id")
            event_url = f"{ENGAGE_EVENT_BASE}{event_id}" if event_id else ENGAGE_SOURCE_URL

            category_names = [c for c in (item.get("categoryNames") or []) if c]
            audience = category_names if category_names else None

            events.append(Event(
                title=clean_text(item.get("name") or "") or "",
                url=event_url,
                start=item.get("startsOn"),
                end=item.get("endsOn"),
                location=clean_text(item.get("location")),
                description=desc,
                group=clean_text(item.get("organizationName")),
                image_url=image_url,
                audience=audience,
                source=ENGAGE_SOURCE_URL,
            ))

        skip += take
        print(f"  Fetched {min(skip, total)}/{total} Engage events …")

    return dedupe_events(events)


def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", title.lower())


def cross_dedupe(primary: List[Event], secondary: List[Event]) -> List[Event]:
    """Merge two event lists, keeping all primary events and only non-duplicate secondary ones.

    Duplicate = same normalized title AND same calendar date for start time.
    """
    def key(e: Event) -> tuple:
        return (_norm_title(e.title or ""), (e.start or "")[:10])

    seen = {key(e) for e in primary}
    unique = [e for e in secondary if key(e) not in seen]
    return primary + unique


# ---------------------------------------------------------------------------
# Per-event enrichment — fetches each detail page for image, group, audience
# ---------------------------------------------------------------------------

def enrich_event(event: Event, timeout: int = DEFAULT_TIMEOUT) -> Event:
    """Visit an event's detail page and fill in image_url, group, and audience."""
    try:
        page_html = fetch_html(event.url, timeout=timeout)
        soup = BeautifulSoup(page_html, "html.parser")

        # Image from JSON-LD ("image" field)
        if not event.image_url:
            for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
                if not tag.string:
                    continue
                try:
                    data = json.loads(tag.string.strip())
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict) and data.get("@type") == "Event":
                    img_data = data.get("image")
                    img = img_data[0] if isinstance(img_data, list) and img_data else (
                        img_data if isinstance(img_data, str) else None
                    )
                    if img:
                        img = html.unescape(img)
                        event.image_url = "https:" + img if img.startswith("//") else img
                    break

        # Group from "This event originated in [link]" text
        if not event.group:
            for node in soup.find_all(string=re.compile(r"originated in", re.I)):
                parent = node.parent
                if parent:
                    link = parent.find("a")
                    if link:
                        event.group = clean_text(link.get_text())
                        break

        # Audience from links like //events.unl.edu/audience/?audience=Public
        audience_links = soup.find_all("a", href=re.compile(r"audience="))
        if audience_links:
            event.audience = [
                clean_text(a.get_text()) for a in audience_links
                if clean_text(a.get_text())
            ]

    except Exception:
        pass
    return event


def enrich_events(
    events: List[Event],
    timeout: int = DEFAULT_TIMEOUT,
    workers: int = 10,
) -> List[Event]:
    """Parallel-fetch each event detail page to fill in image, group, and audience."""
    total = len(events)
    result: List[Optional[Event]] = [None] * total
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(enrich_event, event, timeout): i
            for i, event in enumerate(events)
        }
        done = 0
        for future in as_completed(futures):
            i = futures[future]
            result[i] = future.result()
            done += 1
            if done % 50 == 0 or done == total:
                print(f"  Enriched {done}/{total} events …")
    return [e for e in result if e is not None]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape events from events.unl.edu and export to JSON."
    )

    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--rss",
        action="store_true",
        help="Fetch all upcoming events via the RSS feed (default when no mode specified).",
    )
    mode.add_argument(
        "--months",
        type=int,
        metavar="N",
        help="Scrape N months starting from today via monthly HTML pages.",
    )
    mode.add_argument(
        "--url",
        default=None,
        help="Scrape a single listing page URL.",
    )

    parser.add_argument(
        "--output",
        default="scraped/events.json",
        help="Output JSON file path (default: scraped/events.json)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    parser.add_argument(
        "--no-enrich",
        action="store_true",
        help="Skip visiting individual event pages (skips image, group, and audience).",
    )
    parser.add_argument(
        "--no-engage",
        action="store_true",
        help="Skip scraping Campus Labs Engage (unl.campuslabs.com/engage/events).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=10,
        metavar="N",
        help="Number of parallel workers for enrichment (default: 10).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        if args.months:
            today = date.today()
            end_month = today.month + args.months - 1
            end_year = today.year + (end_month - 1) // 12
            end_month = (end_month - 1) % 12 + 1
            end = date(end_year, end_month, 1)
            print(f"Scraping {args.months} month(s) of events ({today:%Y-%m} → {end:%Y-%m}) …")
            events = scrape_date_range(today, end, timeout=args.timeout)
            source_url = f"https://events.unl.edu/ (date range)"
        elif args.url:
            events = scrape_events(args.url, timeout=args.timeout)
            source_url = args.url
        else:
            # default: RSS
            print("Fetching all upcoming events via RSS …")
            events = scrape_rss(timeout=args.timeout)
            source_url = "https://events.unl.edu/upcoming/?format=rss&limit=-1"

    except requests.RequestException as exc:
        print(f"Network error: {exc}")
        return 1
    except Exception as exc:
        print(f"Unexpected error: {exc}")
        return 1

    if not args.no_enrich:
        print(f"Enriching {len(events)} events (image, group, audience) with {args.workers} workers …")
        events = enrich_events(events, timeout=args.timeout, workers=args.workers)

    if not args.no_engage:
        try:
            print("Fetching Campus Labs Engage events …")
            engage_events = scrape_engage(timeout=args.timeout)
            before = len(events)
            events = cross_dedupe(events, engage_events)
            dupes = len(engage_events) - (len(events) - before)
            print(f"  Added {len(events) - before} Engage events ({dupes} duplicates removed)")
        except requests.RequestException as exc:
            print(f"  Warning: could not fetch Engage events: {exc}")
        except Exception as exc:
            print(f"  Warning: Engage scrape failed: {exc}")

    payload = {
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "source_url": source_url,
        "count": len(events),
        "events": [asdict(event) for event in events],
    }

    output_dir = os.path.dirname(args.output)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as file:
        if args.pretty:
            json.dump(payload, file, ensure_ascii=False, indent=2)
        else:
            json.dump(payload, file, ensure_ascii=False)

    print(f"Scraped {len(events)} events → {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
