"""Deterministic natural-language temporal resolution for Curia searches.

All calendar arithmetic is performed in Curia's event timezone. Resolved
windows are half-open intervals: ``start <= event < end``.
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo


DEFAULT_TIMEZONE = "America/Chicago"
WEEKDAYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
MONTHS = (
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
)

_WEEKDAY_RE = "|".join(WEEKDAYS)
_MONTH_RE = "|".join(MONTHS)
_CLOCK_TOKEN = (
    r"(?:noon|midnight|"
    r"(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:a\.?m\.?|p\.?m\.?))?|"
    r"\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?))"
)

_DATE_PATTERNS = (
    re.compile(
        r"\b\d{4}-\d{2}-\d{2}"
        r"(?:\s+(?:to|through)\s+\d{4}-\d{2}-\d{2})?\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:today|tonight|tomorrow|yesterday)\b", re.IGNORECASE),
    re.compile(
        r"\b(?:this|current|next|last)\s+(?:day|week|weekend|month|year)\b",
        re.IGNORECASE,
    ),
    re.compile(
        rf"\b(?:(?:this|next|coming)\s+)?(?:{_WEEKDAY_RE})\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bin\s+\d+\s+(?:day|week|month)s?\b", re.IGNORECASE),
    re.compile(
        rf"\b(?:{_MONTH_RE})"
        r"(?:\s+\d{1,2}(?:st|nd|rd|th)?)?"
        r"(?:,?\s+\d{4})?\b",
        re.IGNORECASE,
    ),
)

_TIME_PATTERNS = (
    re.compile(
        rf"\b(?:from\s+|between\s+)?{_CLOCK_TOKEN}"
        rf"\s*(?:to|through|and|-)\s*{_CLOCK_TOKEN}\b",
        re.IGNORECASE,
    ),
    re.compile(rf"\b(?:after|before|at)\s+{_CLOCK_TOKEN}\b", re.IGNORECASE),
    re.compile(
        r"\b(?:early\s+morning|morning|noon|afternoon|evening|tonight|"
        r"late\s+night|night)\b",
        re.IGNORECASE,
    ),
)


@dataclass(frozen=True)
class TemporalWindow:
    """A timezone-aware, half-open search interval."""

    start: datetime
    end: datetime
    timezone: str = DEFAULT_TIMEZONE

    def __post_init__(self) -> None:
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("TemporalWindow boundaries must be timezone-aware")
        if self.end.astimezone(timezone.utc) <= self.start.astimezone(timezone.utc):
            raise ValueError("TemporalWindow end must be after start")

    def as_dict(self) -> dict[str, object]:
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "timezone": self.timezone,
            "end_exclusive": True,
        }


@dataclass(frozen=True)
class TemporalResolution:
    """Resolved interval plus the legacy date/time filters."""

    window: TemporalWindow
    date_range: Tuple[date, date]
    time_range: Optional[Tuple[Optional[time], Optional[time]]]
    date_phrase: Optional[str]
    time_phrase: Optional[str]


def local_reference(
    reference: Optional[datetime] = None,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> datetime:
    """Return ``reference`` as an aware datetime in ``timezone_name``."""

    zone = ZoneInfo(timezone_name)
    if reference is None:
        return datetime.now(zone)
    if reference.tzinfo is None:
        return reference.replace(tzinfo=zone)
    return reference.astimezone(zone)


def _localize_wall_time(wall_time: datetime, zone: ZoneInfo) -> datetime:
    """Resolve a naive wall time using Curia's daylight-saving policy.

    Repeated fall-back times use the later occurrence. A nonexistent
    spring-forward time is shifted forward by the transition gap while
    preserving its minutes and seconds.
    """

    if wall_time.tzinfo is not None:
        raise ValueError("wall_time must be naive")

    candidates = [
        wall_time.replace(tzinfo=zone, fold=fold)
        for fold in (0, 1)
    ]
    valid_candidates = [
        candidate
        for candidate in candidates
        if (
            candidate.astimezone(timezone.utc)
            .astimezone(zone)
            .replace(tzinfo=None)
            == wall_time
        )
    ]
    if valid_candidates:
        return max(
            valid_candidates,
            key=lambda candidate: candidate.astimezone(timezone.utc),
        )

    round_trips = [
        candidate.astimezone(timezone.utc).astimezone(zone)
        for candidate in candidates
    ]
    shifted_forward = [
        candidate
        for candidate in round_trips
        if candidate.replace(tzinfo=None) > wall_time
    ]
    if shifted_forward:
        return min(
            shifted_forward,
            key=lambda candidate: candidate.replace(tzinfo=None),
        )

    raise ValueError(f"Could not resolve local wall time {wall_time!s} in {zone.key}")


def detect_date_phrase(query: str) -> Optional[str]:
    for pattern in _DATE_PATTERNS:
        match = pattern.search(query)
        if match:
            return match.group(0).strip()
    return None


def detect_time_phrase(query: str) -> Optional[str]:
    for pattern in _TIME_PATTERNS:
        match = pattern.search(query)
        if match:
            return match.group(0).strip()
    return None


def strip_temporal_phrases(
    query: str,
    *,
    date_phrase: Optional[str] = None,
    time_phrase: Optional[str] = None,
) -> str:
    """Remove temporal language before keyword scoring."""

    clean = query
    phrases = {
        phrase
        for phrase in (
            date_phrase,
            time_phrase,
            detect_date_phrase(query),
            detect_time_phrase(query),
        )
        if phrase
    }
    for phrase in sorted(phrases, key=len, reverse=True):
        clean = re.sub(re.escape(phrase), " ", clean, flags=re.IGNORECASE)

    # Remove standalone temporal tokens that may remain around an extracted
    # phrase, such as "next" or a weekday returned separately by an LLM.
    clean = re.sub(
        rf"\b(?:next|this|current|coming|last|today|tonight|tomorrow|"
        rf"yesterday|{_WEEKDAY_RE}|morning|noon|afternoon|evening|night|"
        rf"midnight|a\.?m\.?|p\.?m\.?)\b",
        " ",
        clean,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", clean).strip()


def _month_range(year: int, month: int) -> Tuple[date, date]:
    return (
        date(year, month, 1),
        date(year, month, calendar.monthrange(year, month)[1]),
    )


def _resolve_date_range(phrase: str, reference: datetime) -> Optional[Tuple[date, date]]:
    lower = phrase.lower().strip()
    today = reference.date()

    iso_match = re.fullmatch(
        r"(\d{4}-\d{2}-\d{2})(?:\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2}))?",
        lower,
    )
    if iso_match:
        start = date.fromisoformat(iso_match.group(1))
        end = date.fromisoformat(iso_match.group(2)) if iso_match.group(2) else start
        return (start, end) if end >= start else None

    if lower in {"today", "tonight", "this day", "current day"}:
        return today, today
    if lower in {"tomorrow", "next day"}:
        target = today + timedelta(days=1)
        return target, target
    if lower in {"yesterday", "last day"}:
        target = today - timedelta(days=1)
        return target, target

    if lower in {"this week", "current week"}:
        return today, today + timedelta(days=6 - today.weekday())
    if lower == "next week":
        monday = today + timedelta(days=7 - today.weekday())
        return monday, monday + timedelta(days=6)
    if lower == "last week":
        monday = today - timedelta(days=today.weekday() + 7)
        return monday, monday + timedelta(days=6)

    if lower in {"this weekend", "current weekend"}:
        if today.weekday() == 5:
            saturday = today
        elif today.weekday() == 6:
            saturday = today - timedelta(days=1)
        else:
            saturday = today + timedelta(days=5 - today.weekday())
        return saturday, saturday + timedelta(days=1)
    if lower == "next weekend":
        if today.weekday() == 5:
            this_saturday = today
        elif today.weekday() == 6:
            this_saturday = today - timedelta(days=1)
        else:
            this_saturday = today + timedelta(days=5 - today.weekday())
        saturday = this_saturday + timedelta(days=7)
        return saturday, saturday + timedelta(days=1)
    if lower == "last weekend":
        saturday = today - timedelta(days=(today.weekday() - 5) % 7 or 7)
        return saturday, saturday + timedelta(days=1)

    if lower in {"this month", "current month"}:
        _, end = _month_range(today.year, today.month)
        return today, end
    if lower in {"next month", "last month"}:
        delta = 1 if lower == "next month" else -1
        raw_month = today.month - 1 + delta
        year = today.year + raw_month // 12
        month = raw_month % 12 + 1
        return _month_range(year, month)

    if lower in {"this year", "current year"}:
        return today, date(today.year, 12, 31)
    if lower == "next year":
        return date(today.year + 1, 1, 1), date(today.year + 1, 12, 31)
    if lower == "last year":
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)

    in_match = re.fullmatch(r"in\s+(\d+)\s+(day|week|month)s?", lower)
    if in_match:
        amount = int(in_match.group(1))
        unit = in_match.group(2)
        if unit == "day":
            target = today + timedelta(days=amount)
            return target, target
        if unit == "week":
            target = today + timedelta(weeks=amount)
            return target, target
        raw_month = today.month - 1 + amount
        year = today.year + raw_month // 12
        month = raw_month % 12 + 1
        return _month_range(year, month)

    weekday_match = re.fullmatch(
        rf"(?:(this|next|coming)\s+)?({_WEEKDAY_RE})",
        lower,
    )
    if weekday_match:
        modifier, weekday_name = weekday_match.groups()
        target_weekday = WEEKDAYS.index(weekday_name)
        difference = (target_weekday - today.weekday()) % 7
        if modifier == "next" and difference == 0:
            difference = 7
        target = today + timedelta(days=difference)
        return target, target

    normalized = re.sub(r"(\d)(?:st|nd|rd|th)\b", r"\1", lower)
    month_match = re.fullmatch(
        rf"({_MONTH_RE})(?:\s+(\d{{1,2}}))?(?:,?\s+(\d{{4}}))?",
        normalized,
    )
    if month_match:
        month_name, day_text, year_text = month_match.groups()
        month = MONTHS.index(month_name) + 1
        day_value = int(day_text) if day_text else None
        year = int(year_text) if year_text else today.year
        if not year_text:
            candidate_day = day_value or 1
            if (month, candidate_day) < (today.month, today.day):
                year += 1
        if day_value is not None:
            try:
                target = date(year, month, day_value)
            except ValueError:
                return None
            return target, target
        return _month_range(year, month)

    return None


def _parse_clock(value: str) -> Optional[time]:
    clean = value.lower().strip().replace(".", "")
    if clean == "noon":
        return time(12, 0)
    if clean == "midnight":
        return time(0, 0)

    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", clean)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = match.group(3)
    if minute > 59:
        return None
    if meridiem:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if meridiem == "pm" else 0)
    elif hour > 23:
        return None
    return time(hour, minute)


def _resolve_time_range(
    phrase: str,
) -> Optional[Tuple[Optional[time], Optional[time]]]:
    lower = phrase.lower().strip()
    day_parts = {
        "early morning": (time(5, 0), time(9, 0)),
        "morning": (time(6, 0), time(12, 0)),
        "noon": (time(11, 0), time(13, 0)),
        "afternoon": (time(12, 0), time(17, 0)),
        "evening": (time(17, 0), time(21, 0)),
        "tonight": (time(17, 0), time(21, 0)),
        "late night": (time(21, 0), None),
        "night": (time(21, 0), None),
    }
    if lower in day_parts:
        return day_parts[lower]

    bounded_match = re.fullmatch(
        rf"(?:from\s+|between\s+)?({_CLOCK_TOKEN})"
        rf"\s*(?:to|through|and|-)\s*({_CLOCK_TOKEN})",
        lower,
        flags=re.IGNORECASE,
    )
    if bounded_match:
        start = _parse_clock(bounded_match.group(1))
        end = _parse_clock(bounded_match.group(2))
        if start is None or end is None or end == start:
            return None
        return start, end

    comparison_match = re.fullmatch(
        rf"(after|before|at)\s+({_CLOCK_TOKEN})",
        lower,
        flags=re.IGNORECASE,
    )
    if comparison_match:
        operator, raw_clock = comparison_match.groups()
        clock = _parse_clock(raw_clock)
        if clock is None:
            return None
        if operator == "after":
            return clock, None
        if operator == "before":
            return None, clock
        start_minutes = clock.hour * 60 + clock.minute
        end_minutes = start_minutes + 60
        if end_minutes >= 24 * 60:
            return clock, None
        return clock, time(end_minutes // 60, end_minutes % 60)

    return None


def resolve_temporal(
    query: str,
    *,
    date_phrase: Optional[str] = None,
    time_phrase: Optional[str] = None,
    reference: Optional[datetime] = None,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> Optional[TemporalResolution]:
    """Resolve temporal phrases in ``query`` into one explicit interval."""

    local_now = local_reference(reference, timezone_name)
    detected_date_phrase = detect_date_phrase(query)
    detected_time_phrase = detect_time_phrase(query)

    resolved_date_phrase = None
    date_range = None
    for candidate in (date_phrase, detected_date_phrase):
        if not candidate or candidate == resolved_date_phrase:
            continue
        candidate_range = _resolve_date_range(candidate, local_now)
        if candidate_range is not None:
            resolved_date_phrase = candidate
            date_range = candidate_range
            break

    resolved_time_phrase = None
    time_range = None
    time_candidates = [time_phrase, detected_time_phrase]
    # "tonight" carries both date and time meaning.
    if resolved_date_phrase and resolved_date_phrase.lower() == "tonight":
        time_candidates.append("tonight")
    for candidate in time_candidates:
        if not candidate or candidate == resolved_time_phrase:
            continue
        candidate_range = _resolve_time_range(candidate)
        if candidate_range is not None:
            resolved_time_phrase = candidate
            time_range = candidate_range
            break

    if date_range is None and time_range is None:
        return None
    if date_range is None:
        date_range = (local_now.date(), local_now.date())

    start_date, end_date = date_range
    zone = ZoneInfo(timezone_name)
    if time_range is None:
        start_wall = datetime.combine(start_date, time.min)
        end_wall = datetime.combine(end_date + timedelta(days=1), time.min)
    else:
        time_start, time_end = time_range
        start_wall = datetime.combine(start_date, time_start or time.min)
        if time_end is None:
            end_wall = datetime.combine(end_date + timedelta(days=1), time.min)
        else:
            end_wall = datetime.combine(end_date, time_end)
            if end_wall <= start_wall:
                end_wall += timedelta(days=1)

    requested_duration = end_wall - start_wall
    start = _localize_wall_time(start_wall, zone)
    end = _localize_wall_time(end_wall, zone)
    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    if end_utc <= start_utc:
        end = (
            start_utc + max(requested_duration, timedelta(minutes=1))
        ).astimezone(zone)

    return TemporalResolution(
        window=TemporalWindow(start=start, end=end, timezone=timezone_name),
        date_range=date_range,
        time_range=time_range,
        date_phrase=resolved_date_phrase,
        time_phrase=resolved_time_phrase,
    )


def resolve_temporal_window(
    query: str,
    *,
    date_phrase: Optional[str] = None,
    time_phrase: Optional[str] = None,
    reference: Optional[datetime] = None,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> Optional[TemporalWindow]:
    resolution = resolve_temporal(
        query,
        date_phrase=date_phrase,
        time_phrase=time_phrase,
        reference=reference,
        timezone_name=timezone_name,
    )
    return resolution.window if resolution else None
