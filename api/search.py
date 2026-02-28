#!/usr/bin/env python3
"""Search scraped UNL events by keyword, with optional local LLM expansion and date filtering."""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

import requests

EVENTS_FILE = "scraped/events.json"
DEFAULT_TOP_N = 10
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")

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

# Kept very short — tiny models handle simple prompts best
EXPAND_PROMPT = """List keywords to search for events matching this query. Return ONLY a JSON object.
Query: "{query}"
JSON: {{"keywords": ["keyword1", "keyword2", ...]}}"""


def load_events(path: str) -> List[Dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)["events"]


def base_terms(query: str) -> List[str]:
    """Split query into meaningful words, stripping stop words."""
    words = re.findall(r"[a-zA-Z0-9]+", query.lower())
    return [w for w in words if w not in STOP_WORDS and len(w) > 1]


def expand_with_ollama(query: str, model: str) -> Optional[List[str]]:
    """Call Ollama to extract/expand keywords. Returns None if unavailable."""
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": model,
                "prompt": EXPAND_PROMPT.format(query=query),
                "stream": False,
                "format": "json",   # forces valid JSON output
            },
            timeout=20,
        )
        resp.raise_for_status()
        text = resp.json().get("response", "").strip()
        data = json.loads(text)
        keywords = data.get("keywords") or []
        return [str(k).lower() for k in keywords if k]
    except Exception:
        return None


def extract_date_range(query: str) -> Optional[Tuple[date, date]]:
    """Parse a date range from natural language in the query."""
    import dateparser.search

    # Explicit relative shortcuts before dateparser
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
        help=f"Ollama model for keyword expansion (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip Ollama expansion, use raw keywords only",
    )
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    query = " ".join(args.query)
    terms = base_terms(query)

    # LLM keyword expansion via Ollama
    if not args.no_llm:
        print(f"Expanding with Ollama ({args.model}) …", file=sys.stderr)
        llm_keywords = expand_with_ollama(query, args.model)
        if llm_keywords:
            # Filter LLM output through the same stop-word list
            llm_keywords = [k for k in llm_keywords if k not in STOP_WORDS and len(k) > 1]
            print(f"  LLM keywords : {llm_keywords}", file=sys.stderr)
            # Merge, dedup, preserve order
            seen = set(terms)
            for kw in llm_keywords:
                if kw not in seen:
                    terms.append(kw)
                    seen.add(kw)
        else:
            print("  Ollama unavailable — falling back to raw keywords.", file=sys.stderr)

    if not terms:
        print("No search terms found in query.", file=sys.stderr)
        return 1

    print(f"Terms          : {terms}", file=sys.stderr)

    # Date filtering
    events = load_events(args.events)
    date_range = extract_date_range(query)
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
