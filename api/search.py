#!/usr/bin/env python3
"""Search scraped UNL events by keyword, with optional Gemini keyword expansion and date filtering."""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

import requests
from google import genai

EVENTS_FILE = "scraped/events.json"
DEFAULT_TOP_N = 10
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemma-3-12b-it")

FIELD_WEIGHTS = {
    "title":       4,
    "group":       3,
    "description": 2,
    "location":    1,
    "audience":    1,
}

STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "are", "was", "be", "i", "me", "my", "this",
    "that", "it", "do", "want", "find", "looking", "something", "events",
    "event", "any", "some", "what", "show", "get", "can", "will", "like",
    "go", "going", "around", "near", "about", "up", "out", "next", "this",
    "weekend", "today", "tomorrow", "tonight", "week",
}

EXPAND_PROMPT = """Today is {now} ({weekday}).

You are helping search a university event database. Given a query, do two things:

1. KEYWORD EXPANSION: Extract the core topics and expand each general term into specific concrete examples.
   - Include the original term AND its specific instances (e.g. "food" → ["food", "pasta", "pizza", "tacos", "burger", "salad", "BBQ", "sushi"])
   - Include synonyms, related activities, and subcategories (e.g. "music" → ["music", "concert", "jazz", "rock", "band", "choir", "orchestra", "recital"])
   - Include relevant people/roles (e.g. "volunteer" → ["volunteer", "service", "community", "outreach", "nonprofit"])
   - Keep all keywords lowercase, single words or short phrases

2. DATE EXTRACTION: Resolve any relative date references using today's date.
   - "today" → today's date
   - "tomorrow" → tomorrow's date
   - "this weekend" → nearest Saturday and Sunday
   - "next week" → next Monday through Sunday
   - "two weeks from now" → date 14 days from today
   - If no date is mentioned, return null for both date fields

Return ONLY a JSON object with no extra text.

Query: "{query}"
JSON: {{"keywords": ["keyword1", "keyword2", ...], "date_from": "YYYY-MM-DD or null", "date_to": "YYYY-MM-DD or null"}}"""


def load_events(path: str) -> List[Dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)["events"]


def base_terms(query: str) -> List[str]:
    """Split query into meaningful words, stripping stop words."""
    words = re.findall(r"[a-zA-Z0-9]+", query.lower())
    return [w for w in words if w not in STOP_WORDS and len(w) > 1]


def expand_with_gemini(query: str, model: str) -> Tuple[Optional[List[str]], Optional[Tuple[date, date]]]:
    """Call Gemini API to extract/expand keywords and resolve date references.
    Returns (keywords, date_range) — either can be None if unavailable."""
    if not GEMINI_API_KEY:
        return None, None
    try:
        now = datetime.now()
        prompt = EXPAND_PROMPT.format(
            now=now.strftime("%Y-%m-%d %H:%M"),
            weekday=now.strftime("%A"),
            query=query,
        )
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        data = json.loads(response.text.strip())
        keywords = [str(k).lower() for k in (data.get("keywords") or []) if k]

        date_range = None
        df = data.get("date_from")
        dt = data.get("date_to")
        if df and df != "null":
            try:
                start = date.fromisoformat(str(df))
                end = date.fromisoformat(str(dt)) if dt and dt != "null" else start
                date_range = (start, end)
            except ValueError:
                pass

        return keywords, date_range
    except Exception:
        return None, None


def extract_date_range(query: str) -> Optional[Tuple[date, date]]:
    """Parse a date range from natural language in the query."""
    import dateparser.search

    q = query.lower()
    today = date.today()

    if "tonight" in q:
        return (today, today)
    if "tomorrow" in q:
        d = today + timedelta(days=1)
        return (d, d)
    if "this weekend" in q or "weekend" in q:
        days_to_sat = (5 - today.weekday()) % 7 or 7
        sat = today + timedelta(days=days_to_sat)
        return (sat, sat + timedelta(days=1))
    if "next week" in q:
        mon = today + timedelta(days=(7 - today.weekday()))
        return (mon, mon + timedelta(days=6))

    try:
        results = dateparser.search.search_dates(query, languages=["en"])
        if results:
            found = results[0][1].date()
            return (found, found)
    except Exception:
        pass

    return None


def filter_by_date(
    events: List[Dict[str, Any]],
    date_range: Tuple[date, date],
) -> List[Dict[str, Any]]:
    start_d, end_d = date_range
    out = []
    for e in events:
        raw = (e.get("start") or "")[:19]
        if not raw:
            continue
        try:
            if start_d <= datetime.fromisoformat(raw).date() <= end_d:
                out.append(e)
        except ValueError:
            continue
    return out


def score_event(event: Dict[str, Any], terms: List[str]) -> int:
    score = 0
    for field, weight in FIELD_WEIGHTS.items():
        value = event.get(field)
        if not value:
            continue
        text = " ".join(value).lower() if isinstance(value, list) else str(value).lower()
        for term in terms:
            if term in text:
                score += weight
    return score


def search(
    events: List[Dict[str, Any]],
    terms: List[str],
    top_n: int,
) -> List[Tuple[int, Dict[str, Any]]]:
    scored = [(score_event(e, terms), e) for e in events]
    scored = [(s, e) for s, e in scored if s > 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_n]


def main() -> int:
    parser = argparse.ArgumentParser(description="Search UNL events by keyword.")
    parser.add_argument("query", nargs="+", help="Natural-language search query")
    parser.add_argument("--events", default=EVENTS_FILE)
    parser.add_argument("--top", type=int, default=DEFAULT_TOP_N, metavar="N")
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Gemini model for keyword expansion (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip Gemini expansion, use raw keywords only",
    )
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    query = " ".join(args.query)
    terms = base_terms(query)

    llm_date_range = None
    if not args.no_llm:
        print(f"Expanding with Gemini ({args.model}) …", file=sys.stderr)
        llm_keywords, llm_date_range = expand_with_gemini(query, args.model)
        if llm_keywords:
            llm_keywords = [k for k in llm_keywords if k not in STOP_WORDS and len(k) > 1]
            print(f"  LLM keywords : {llm_keywords}", file=sys.stderr)
            if llm_date_range:
                print(f"  LLM dates    : {llm_date_range[0]} → {llm_date_range[1]}", file=sys.stderr)
            seen = set(terms)
            for kw in llm_keywords:
                if kw not in seen:
                    terms.append(kw)
                    seen.add(kw)
        else:
            print("  Gemini unavailable — falling back to raw keywords.", file=sys.stderr)

    if not terms:
        print("No search terms found in query.", file=sys.stderr)
        return 1

    print(f"Terms          : {terms}", file=sys.stderr)

    events = load_events(args.events)
    date_range = llm_date_range or extract_date_range(query)
    if date_range:
        print(f"Date filter    : {date_range[0]} → {date_range[1]}", file=sys.stderr)
        events = filter_by_date(events, date_range)
        print(f"Events in range: {len(events)}", file=sys.stderr)

    results = search(events, terms, args.top)

    if not results:
        print("No matching events found.", file=sys.stderr)
        return 0

    if args.as_json:
        print(json.dumps(
            [{"score": s, "url": e["url"], "title": e["title"], "start": e.get("start")}
             for s, e in results],
            indent=2, ensure_ascii=False,
        ))
    else:
        print(f"\nTop {len(results)} results:", file=sys.stderr)
        for score, event in results:
            start = (event.get("start") or "")[:16].replace("T", " ")
            print(f"  [{score:3d}]  {event['url']}")
            print(f"         {event['title']}  —  {start}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
