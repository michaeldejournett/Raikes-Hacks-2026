#!/usr/bin/env python3
"""Search scraped UNL events by keyword, with optional Gemini keyword expansion and date filtering."""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, date, time, timezone
from typing import Any, Dict, List, Mapping, Optional, Tuple
from zoneinfo import ZoneInfo

from temporal import (
    DEFAULT_TIMEZONE,
    TemporalResolution,
    TemporalWindow,
    local_reference,
    resolve_temporal,
    strip_temporal_phrases,
)

EVENTS_FILE = "scraped/events.json"
DEFAULT_TOP_N = 10
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemma-3-27b-it")

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
    # time-of-day words — these should become time filters, not keywords
    "morning", "afternoon", "evening", "night", "midnight", "noon",
    "late", "early", "pm", "am", "oclock",
    # weekday names are temporal constraints, never subject keywords
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "sunday",
}

EXTRACTION_PROMPT = """You extract structured intent for a university event search.

Current local datetime: {now}
Event timezone: {timezone}

Extract three fields:

1. keywords: Expand only the non-temporal subject matter into concrete search
   terms.
   - Do not include dates, weekdays, times, relative words, or stop words.
   - Include the original term AND its specific instances (e.g. "food" → ["food", "pasta", "pizza", "tacos", "burger", "salad", "BBQ", "sushi"])
   - Include synonyms, related activities, and subcategories (e.g. "music" → ["music", "concert", "jazz", "rock", "band", "choir", "orchestra", "recital"])
   - Keep all keywords lowercase, single words or short phrases
   - Prefer precision over a very large, noisy list.

2. date_phrase: Copy the smallest date-bearing phrase from the query, such as
   "next Tuesday", "tomorrow", or "in April". Do not resolve it to a date.
   Return null when no date is present.

3. time_phrase: Copy the smallest time-bearing phrase from the query, such as
   "evening", "after 6pm", or "at 3pm". Do not resolve it to a clock value.
   Return null when no time is present.

Query: {query}"""

SEARCH_EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "keywords": {
            "type": "array",
            "items": {"type": "string"},
        },
        "date_phrase": {"type": ["string", "null"]},
        "time_phrase": {"type": ["string", "null"]},
    },
    "required": ["keywords", "date_phrase", "time_phrase"],
}


@dataclass(frozen=True)
class GeminiExtraction:
    keywords: Tuple[str, ...]
    date_phrase: Optional[str]
    time_phrase: Optional[str]
    temporal: Optional[TemporalResolution]


def load_events(path: str) -> List[Dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)["events"]


def base_terms(query: str) -> List[str]:
    """Split non-temporal query text into meaningful subject terms."""
    subject_query = strip_temporal_phrases(query)
    words = re.findall(r"[a-zA-Z0-9]+", subject_query.lower())
    return [w for w in words if w not in STOP_WORDS and len(w) > 1]


def _gemini_client():
    """Create the SDK client lazily so pure resolver tests need no SDK install."""

    from google import genai

    return genai.Client(api_key=GEMINI_API_KEY)


def _response_data(response: Any) -> Mapping[str, Any]:
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        if isinstance(parsed, Mapping):
            return parsed
        if hasattr(parsed, "model_dump"):
            return parsed.model_dump()
        raise ValueError("Gemini parsed response is not an object")

    text = (getattr(response, "text", None) or "").strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(text)
    if not isinstance(data, Mapping):
        raise ValueError("Gemini response must be a JSON object")
    return data


def _optional_phrase(data: Mapping[str, Any], key: str) -> Optional[str]:
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string or null")
    value = value.strip()
    return value or None


def _grounded_phrase(
    data: Mapping[str, Any],
    key: str,
    query: str,
) -> Optional[str]:
    """Accept only phrases copied from the user's query."""

    phrase = _optional_phrase(data, key)
    if phrase and phrase.casefold() not in query.casefold():
        return None
    return phrase


def extract_with_gemini(
    query: str,
    model: str,
    *,
    client: Any = None,
    reference: Optional[datetime] = None,
) -> Optional[GeminiExtraction]:
    """Extract structured search intent; deterministic code resolves time."""

    if client is None and not GEMINI_API_KEY:
        return None
    try:
        now = local_reference(reference)
        prompt = EXTRACTION_PROMPT.format(
            now=now.isoformat(),
            timezone=DEFAULT_TIMEZONE,
            query=query,
        )
        active_client = client or _gemini_client()
        response = active_client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_json_schema": SEARCH_EXTRACTION_SCHEMA,
                "temperature": 0,
            },
        )
        data = _response_data(response)
        raw_keywords = data.get("keywords")
        if not isinstance(raw_keywords, list):
            raise ValueError("keywords must be an array")
        keywords = tuple(
            dict.fromkeys(
                value.strip().lower()
                for value in raw_keywords
                if isinstance(value, str)
                and value.strip()
                and value.strip().lower() not in STOP_WORDS
            )
        )
        date_phrase = _grounded_phrase(data, "date_phrase", query)
        time_phrase = _grounded_phrase(data, "time_phrase", query)
        temporal = resolve_temporal(
            query,
            date_phrase=date_phrase,
            time_phrase=time_phrase,
            reference=now,
        )
        return GeminiExtraction(
            keywords=keywords,
            date_phrase=date_phrase,
            time_phrase=time_phrase,
            temporal=temporal,
        )
    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("extract_with_gemini failed: %s", exc)
        return None


def expand_with_gemini(
    query: str,
    model: str,
    *,
    client: Any = None,
    reference: Optional[datetime] = None,
) -> Tuple[
    Optional[List[str]],
    Optional[Tuple[date, date]],
    Optional[Tuple[Optional[time], Optional[time]]],
]:
    """Backward-compatible three-tuple wrapper around structured extraction."""

    extraction = extract_with_gemini(
        query,
        model,
        client=client,
        reference=reference,
    )
    if extraction is None:
        return None, None, None
    temporal = extraction.temporal
    return (
        list(extraction.keywords),
        temporal.date_range if temporal else None,
        temporal.time_range if temporal else None,
    )


def extract_date_range(
    query: str,
    *,
    reference: Optional[datetime] = None,
) -> Optional[Tuple[date, date]]:
    """Backward-compatible deterministic date-range helper."""

    temporal = resolve_temporal(query, reference=reference)
    return temporal.date_range if temporal else None


def extract_time_range(
    query: str,
    *,
    reference: Optional[datetime] = None,
) -> Optional[Tuple[Optional[time], Optional[time]]]:
    temporal = resolve_temporal(query, reference=reference)
    return temporal.time_range if temporal else None


def _parse_event_datetime(
    raw: Any,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> Optional[datetime]:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    zone = ZoneInfo(timezone_name)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=zone)
    return parsed.astimezone(zone)


def filter_by_temporal_window(
    events: List[Dict[str, Any]],
    window: TemporalWindow,
) -> List[Dict[str, Any]]:
    """Return events whose aware interval overlaps ``window``."""

    window_start = window.start.astimezone(timezone.utc)
    window_end = window.end.astimezone(timezone.utc)
    out = []
    for event in events:
        event_start = _parse_event_datetime(event.get("start"), window.timezone)
        if event_start is None:
            continue
        event_start = event_start.astimezone(timezone.utc)
        event_end = _parse_event_datetime(event.get("end"), window.timezone)
        if event_end is not None:
            event_end = event_end.astimezone(timezone.utc)
        if event_end is None or event_end <= event_start:
            event_end = event_start + timedelta(microseconds=1)
        if event_start < window_end and event_end > window_start:
            out.append(event)
    return out


def filter_by_date(
    events: List[Dict[str, Any]],
    date_range: Tuple[date, date],
    time_range: Optional[Tuple[Optional[time], Optional[time]]] = None,
) -> List[Dict[str, Any]]:
    """Compatibility wrapper using timezone-aware interval filtering."""

    start_d, end_d = date_range
    t_start, t_end = time_range if time_range else (None, None)
    zone = ZoneInfo(DEFAULT_TIMEZONE)
    start = datetime.combine(start_d, t_start or time.min, tzinfo=zone)
    if t_end is None:
        end = datetime.combine(end_d + timedelta(days=1), time.min, tzinfo=zone)
    else:
        end = datetime.combine(end_d, t_end, tzinfo=zone)
        if end <= start:
            end += timedelta(days=1)
    return filter_by_temporal_window(
        events,
        TemporalWindow(start=start, end=end),
    )


def filter_by_time(
    events: List[Dict[str, Any]],
    time_range: Tuple[Optional[time], Optional[time]],
) -> List[Dict[str, Any]]:
    t_start, t_end = time_range
    out = []
    for e in events:
        event_start = _parse_event_datetime(e.get("start"))
        if event_start is None:
            continue
        local_time = event_start.time().replace(tzinfo=None)
        if t_start is not None and local_time < t_start:
            continue
        if t_end is not None and local_time >= t_end:
            continue
        out.append(e)
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

    extraction = None
    if not args.no_llm:
        print(f"Expanding with Gemini ({args.model}) …", file=sys.stderr)
        extraction = extract_with_gemini(query, args.model)
        if extraction:
            llm_keywords = [
                keyword
                for keyword in extraction.keywords
                if keyword not in STOP_WORDS and len(keyword) > 1
            ]
            print(f"  LLM keywords : {llm_keywords}", file=sys.stderr)
            print(f"  LLM date     : {extraction.date_phrase!r}", file=sys.stderr)
            print(f"  LLM time     : {extraction.time_phrase!r}", file=sys.stderr)
            seen = set(terms)
            for kw in llm_keywords:
                if kw not in seen:
                    terms.append(kw)
                    seen.add(kw)
        else:
            print("  Gemini unavailable — falling back to raw keywords.", file=sys.stderr)

    temporal = extraction.temporal if extraction and extraction.temporal else resolve_temporal(query)
    if not terms and temporal is None:
        print("No usable search intent found in query.", file=sys.stderr)
        return 1

    print(f"Terms          : {terms}", file=sys.stderr)

    events = load_events(args.events)
    if temporal:
        print(f"Window start   : {temporal.window.start.isoformat()}", file=sys.stderr)
        print(f"Window end     : {temporal.window.end.isoformat()} (exclusive)", file=sys.stderr)
        events = filter_by_temporal_window(events, temporal.window)
        print(f"Events in range: {len(events)}", file=sys.stderr)

    results = (
        search(events, terms, args.top)
        if terms
        else [(0, event) for event in events[: args.top]]
    )

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
