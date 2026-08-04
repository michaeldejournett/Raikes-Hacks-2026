export const DEFAULT_TIME_ZONE = 'America/Chicago';

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/i,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/i,
  /\b(?:today|tonight|tomorrow|yesterday)\b/i,
  /\b(?:this|current|next|last)\s+(?:day|week|weekend|month|year)\b/i,
  /\b(?:this|next|last)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  /\bin\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:day|week|month)s?\b/i,
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:day|week|month)s?\s+from\s+now\b/i,
  /\b(?:this\s+)?weekend\b/i,
  /\b(?:soon|upcoming)\b/i,
  /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  /\b(?:in|during)?\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?\b/i,
];

const CLOCK_TOKEN =
  String.raw`(?:noon|midnight|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)`;
const TIME_PATTERNS = [
  new RegExp(String.raw`\b(?:between|from)\s+${CLOCK_TOKEN}\s+(?:and|to|-)\s+${CLOCK_TOKEN}\b`, 'i'),
  new RegExp(String.raw`\b(?:after|before|at|around|by|until)\s+${CLOCK_TOKEN}\b`, 'i'),
  /\b(?:early\s+morning|late\s+(?:evening|night)|morning|noon|afternoon|evening|tonight|night|midnight)\b/i,
  new RegExp(String.raw`\b${CLOCK_TOKEN}\b`, 'i'),
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function ymdFromParts(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseYmd(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function ymdFromUtcDate(date) {
  return ymdFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function calendarDate(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) throw new TypeError(`Invalid calendar date: ${ymd}`);
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

function addDays(ymd, amount) {
  const date = calendarDate(ymd);
  date.setUTCDate(date.getUTCDate() + amount);
  return ymdFromUtcDate(date);
}

function addMonths(ymd, amount) {
  const { year, month } = parseYmd(ymd);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function dayOfWeek(ymd) {
  return calendarDate(ymd).getUTCDay();
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function numberFromText(value) {
  const normalized = String(value).toLowerCase();
  return NUMBER_WORDS[normalized] ?? Number.parseInt(normalized, 10);
}

function zonedDateParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid reference date: ${value}`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, Number(partValue)])
  );
}

export function referenceDateInZone(referenceDate = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  if (typeof referenceDate === 'string' && parseYmd(referenceDate)) return referenceDate;
  const parts = zonedDateParts(referenceDate, timeZone);
  return ymdFromParts(parts.year, parts.month, parts.day);
}

export function zonedLocalToUtc(dateValue, timeValue, timeZone = DEFAULT_TIME_ZONE) {
  const date = parseYmd(dateValue);
  const time = String(timeValue).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!date || !time) throw new TypeError(`Invalid local date/time: ${dateValue} ${timeValue}`);

  const hour = Number(time[1]);
  const minute = Number(time[2]);
  const second = Number(time[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError(`Invalid local time: ${timeValue}`);
  }

  const targetWallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second);
  let candidate = targetWallClock;

  // Convert the candidate back into the requested zone and correct the wall-clock
  // difference. Repeating handles offset changes near daylight-saving boundaries.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedDateParts(new Date(candidate), timeZone);
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const adjustment = targetWallClock - actualWallClock;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const matchesTarget = (instant) => {
    const actual = zonedDateParts(new Date(instant), timeZone);
    return (
      actual.year === date.year &&
      actual.month === date.month &&
      actual.day === date.day &&
      actual.hour === hour &&
      actual.minute === minute &&
      actual.second === second
    );
  };
  const possibleInstants = [
    candidate - 2 * 60 * 60 * 1000,
    candidate - 60 * 60 * 1000,
    candidate,
    candidate + 60 * 60 * 1000,
    candidate + 2 * 60 * 60 * 1000,
  ].filter(matchesTarget);

  // During the repeated fall-back hour, choose the later occurrence. During a
  // spring-forward gap there is no exact occurrence, so the iterative candidate
  // intentionally shifts forward to the first representable wall time.
  return new Date(possibleInstants.length ? Math.max(...possibleInstants) : candidate);
}

function zonedLocalString(instant, timeZone) {
  const parts = zonedDateParts(instant, timeZone);
  return `${ymdFromParts(parts.year, parts.month, parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute
  )}:${pad(parts.second)}`;
}

function localWallClockValue(dateValue, timeValue) {
  const date = parseYmd(dateValue);
  const time = String(timeValue).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Number(time[1]),
    Number(time[2]),
    Number(time[3] ?? 0)
  );
}

export function extractDatePhrase(query) {
  const value = String(query ?? '');
  for (const pattern of DATE_PATTERNS) {
    const match = value.match(pattern);
    if (match) return match[0].trim().toLowerCase();
  }
  return null;
}

export function extractTimePhrase(query) {
  const value = String(query ?? '');
  for (const pattern of TIME_PATTERNS) {
    const match = value.match(pattern);
    if (match) return match[0].trim().toLowerCase();
  }
  return null;
}

function monthRange(year, month) {
  return {
    start: ymdFromParts(year, month, 1),
    end: ymdFromParts(year, month, lastDayOfMonth(year, month)),
  };
}

export function parseDateRange(
  query,
  { referenceDate = new Date(), timeZone = DEFAULT_TIME_ZONE } = {}
) {
  const lower = String(query ?? '').toLowerCase().trim();
  if (!lower) return null;

  const today = referenceDateInZone(referenceDate, timeZone);
  const todayParts = parseYmd(today);
  const todayDow = dayOfWeek(today);

  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && parseYmd(iso[1])) return { start: iso[1], end: iso[1] };

  const namedDay = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/
  );
  if (namedDay) {
    const month = MONTHS.indexOf(namedDay[1]) + 1;
    const day = Number(namedDay[2]);
    let year = namedDay[3] ? Number(namedDay[3]) : todayParts.year;
    let candidate = ymdFromParts(year, month, day);
    if (!parseYmd(candidate)) return null;
    if (!namedDay[3] && candidate < today) {
      year += 1;
      candidate = ymdFromParts(year, month, day);
    }
    if (parseYmd(candidate)) return { start: candidate, end: candidate };
  }

  if (/\b(today|tonight)\b/.test(lower)) return { start: today, end: today };
  if (/\btomorrow\b/.test(lower)) {
    const value = addDays(today, 1);
    return { start: value, end: value };
  }
  if (/\byesterday\b/.test(lower)) {
    const value = addDays(today, -1);
    return { start: value, end: value };
  }

  const relativeAmount = lower.match(
    /\b(?:in\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|week|month)s?(?:\s+from\s+now)?\b/
  );
  if (relativeAmount && (lower.includes('in ') || lower.includes('from now'))) {
    const amount = numberFromText(relativeAmount[1]);
    const unit = relativeAmount[2];
    if (unit === 'day') {
      const value = addDays(today, amount);
      return { start: value, end: value };
    }
    if (unit === 'week') {
      const value = addDays(today, amount * 7);
      return { start: value, end: value };
    }
    const target = addMonths(today, amount);
    return monthRange(target.year, target.month);
  }

  if (/\b(soon|upcoming)\b/.test(lower)) {
    return { start: today, end: addDays(today, 7) };
  }

  const weekday = lower.match(
    /\b(?:(this|next|last)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );
  if (weekday) {
    const modifier = weekday[1] ?? null;
    const targetDow = WEEKDAYS.indexOf(weekday[2]);
    let difference = (targetDow - todayDow + 7) % 7;
    if (modifier === 'next') difference = difference || 7;
    if (modifier === 'last') {
      difference = targetDow - todayDow;
      if (difference >= 0) difference -= 7;
    }
    const value = addDays(today, difference);
    return { start: value, end: value };
  }

  const unit = lower.match(/\b(this|current|next|last)\s+(day|week|weekend|month|year)\b/);
  if (unit) {
    const [, modifier, name] = unit;
    const direction = { this: 0, current: 0, next: 1, last: -1 }[modifier];

    if (name === 'day') {
      const value = addDays(today, direction);
      return { start: value, end: value };
    }
    if (name === 'week') {
      if (direction === 0) return { start: today, end: addDays(today, (7 - todayDow) % 7) };
      const mondayOffset =
        direction > 0
          ? todayDow === 0
            ? 1
            : 8 - todayDow
          : (todayDow === 0 ? -6 : 1 - todayDow) - 7;
      const start = addDays(today, mondayOffset);
      return { start, end: addDays(start, 6) };
    }
    if (name === 'weekend') {
      const daysToSaturday =
        todayDow === 6 ? 0 : todayDow === 0 ? -1 : (6 - todayDow + 7) % 7;
      const start = addDays(today, daysToSaturday + direction * 7);
      const end = addDays(start, 1);
      return { start, end };
    }
    if (name === 'month') {
      const target = addMonths(today, direction);
      return monthRange(target.year, target.month);
    }
    const year = todayParts.year + direction;
    return {
      start: direction === 0 ? today : `${year}-01-01`,
      end: `${year}-12-31`,
    };
  }

  if (/\bweekend\b/.test(lower)) {
    const daysToSaturday =
      todayDow === 6 ? 0 : todayDow === 0 ? -1 : (6 - todayDow + 7) % 7;
    const start = addDays(today, daysToSaturday);
    return { start, end: addDays(start, 1) };
  }

  const namedMonth = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/
  );
  if (namedMonth) {
    const month = MONTHS.indexOf(namedMonth[1]) + 1;
    let year = namedMonth[2] ? Number(namedMonth[2]) : todayParts.year;
    if (!namedMonth[2] && month < todayParts.month) year += 1;
    return monthRange(year, month);
  }

  return null;
}

function clockToMinutes(value, inheritedMeridiem = null) {
  const normalized = String(value).toLowerCase().replace(/\./g, '').trim();
  if (normalized === 'noon') return 12 * 60;
  if (normalized === 'midnight') return 0;

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3] ?? inheritedMeridiem;
  if (minute > 59 || hour > 23) return null;
  if (meridiem) {
    if (hour > 12 || hour === 0) return null;
    if (meridiem === 'am') hour %= 12;
    if (meridiem === 'pm') hour = (hour % 12) + 12;
  }
  return hour * 60 + minute;
}

function meridiemFrom(value) {
  return String(value).toLowerCase().replace(/\./g, '').match(/\b(am|pm)\b/)?.[1] ?? null;
}

function minutesToClock(value) {
  const bounded = Math.max(0, Math.min(value, 23 * 60 + 59));
  return `${pad(Math.floor(bounded / 60))}:${pad(bounded % 60)}`;
}

export function parseTimeRange(query) {
  const lower = String(query ?? '').toLowerCase().replace(/\./g, '').trim();
  if (!lower) return null;

  const range = lower.match(
    new RegExp(
      String.raw`\b(?:between|from)\s+(${CLOCK_TOKEN})\s+(?:and|to|-)\s+(${CLOCK_TOKEN})\b`,
      'i'
    )
  );
  if (range) {
    const startText = range[1];
    const endText = range[2];
    const startHour = Number(startText.match(/\d{1,2}/)?.[0]);
    const endHour = Number(endText.match(/\d{1,2}/)?.[0]);
    const endMeridiem = meridiemFrom(endText);
    const inheritedStartMeridiem =
      !meridiemFrom(startText) && endMeridiem && startHour > endHour
        ? endMeridiem === 'pm'
          ? 'am'
          : 'pm'
        : endMeridiem;
    const start = clockToMinutes(startText, inheritedStartMeridiem);
    const end = clockToMinutes(endText, meridiemFrom(startText));
    if (start !== null && end !== null) {
      return { start: minutesToClock(start), end: minutesToClock(end) };
    }
  }

  const bounded = lower.match(
    new RegExp(String.raw`\b(after|before|by|until|at|around)\s+(${CLOCK_TOKEN})\b`, 'i')
  );
  if (bounded) {
    const minutes = clockToMinutes(bounded[2]);
    if (minutes !== null) {
      if (bounded[1] === 'after') {
        return { start: minutesToClock(minutes), end: '23:59' };
      }
      if (['before', 'by', 'until'].includes(bounded[1])) {
        return { start: '00:00', end: minutesToClock(minutes) };
      }
      return {
        start: minutesToClock(minutes),
        end: minutesToClock(Math.min(minutes + 60, 23 * 60 + 59)),
      };
    }
  }

  if (/\bearly\s+morning\b/.test(lower)) return { start: '05:00', end: '09:00' };
  if (/\bmorning\b/.test(lower)) return { start: '06:00', end: '12:00' };
  if (/\bnoon\b/.test(lower)) return { start: '11:00', end: '13:00' };
  if (/\bafternoon\b/.test(lower)) return { start: '12:00', end: '17:00' };
  if (/\blate\s+evening\b/.test(lower)) return { start: '19:00', end: '22:00' };
  if (/\bevening\b|\btonight\b/.test(lower)) return { start: '17:00', end: '21:00' };
  if (/\blate\s+night\b/.test(lower)) return { start: '21:00', end: '23:59' };
  if (/\bnight\b/.test(lower)) return { start: '19:00', end: '23:59' };
  if (/\bmidnight\b/.test(lower)) return { start: '00:00', end: '01:00' };

  const exact = lower.match(new RegExp(String.raw`\b(${CLOCK_TOKEN})\b`, 'i'));
  if (exact && (meridiemFrom(exact[1]) || exact[1].includes(':'))) {
    const minutes = clockToMinutes(exact[1]);
    if (minutes !== null) {
      return {
        start: minutesToClock(minutes),
        end: minutesToClock(Math.min(minutes + 60, 23 * 60 + 59)),
      };
    }
  }

  return null;
}

export function resolveTemporalQuery(
  query,
  {
    referenceDate = new Date(),
    timeZone = DEFAULT_TIME_ZONE,
    datePhrase = null,
    timePhrase = null,
  } = {}
) {
  const queryDatePhrase = extractDatePhrase(query);
  const queryTimePhrase = extractTimePhrase(query);
  const resolvedDatePhrase = queryDatePhrase ?? datePhrase;
  const resolvedTimePhrase = queryTimePhrase ?? timePhrase;
  const dateRange = parseDateRange(resolvedDatePhrase, { referenceDate, timeZone });
  const timeRange = parseTimeRange(resolvedTimePhrase);

  let temporal = null;
  if (dateRange) {
    const startTime = timeRange?.start ?? '00:00';
    const endTime = timeRange?.end ?? '23:59';
    let endDate = dateRange.end;
    if (dateRange.start === dateRange.end && endTime < startTime) endDate = addDays(endDate, 1);

    const startUtc = zonedLocalToUtc(dateRange.start, `${startTime}:00`, timeZone);
    let endUtc = zonedLocalToUtc(endDate, `${endTime}:00`, timeZone);
    if (timeRange && endUtc <= startUtc) {
      const requestedDuration =
        localWallClockValue(endDate, `${endTime}:00`) -
        localWallClockValue(dateRange.start, `${startTime}:00`);
      endUtc = new Date(startUtc.getTime() + Math.max(requestedDuration, 60 * 1000));
    }
    temporal = {
      timeZone,
      startLocal: zonedLocalString(startUtc, timeZone),
      endLocal: zonedLocalString(endUtc, timeZone),
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      precision: timeRange ? 'time-range' : 'date-range',
      endExclusive: Boolean(timeRange),
    };
    const normalizedClockChanged =
      Boolean(timeRange) &&
      (temporal.startLocal.slice(11, 16) !== startTime ||
        temporal.endLocal.slice(11, 16) !== endTime);
    const crossesMidnight =
      Boolean(timeRange) &&
      dateRange.start === dateRange.end &&
      temporal.startLocal.slice(0, 10) !== temporal.endLocal.slice(0, 10);
    temporal.filterMode = normalizedClockChanged || crossesMidnight ? 'absolute' : 'daily';
  }

  return {
    dateRange,
    timeRange,
    temporal,
    invalid: {
      date: Boolean(queryDatePhrase && !dateRange),
      time: Boolean(queryTimePhrase && !timeRange),
    },
    intent: {
      datePhrase: resolvedDatePhrase,
      timePhrase: resolvedTimePhrase,
      dateSource: queryDatePhrase ? 'query' : datePhrase ? 'llm' : null,
      timeSource: queryTimePhrase ? 'query' : timePhrase ? 'llm' : null,
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripTemporalPhrases(query, additionalPhrases = []) {
  let value = String(query ?? '');
  const phrases = [
    ...additionalPhrases,
    extractDatePhrase(value),
    extractTimePhrase(value),
  ].filter(Boolean);
  for (const phrase of [...new Set(phrases)].sort((a, b) => b.length - a.length)) {
    value = value.replace(new RegExp(escapeRegExp(phrase), 'gi'), ' ');
  }
  return value.replace(/\s+/g, ' ').trim();
}

function toYmd(value) {
  if (!value) return '';
  const normalized = String(value);
  return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
}

/**
 * Apply Curia's date-overlap and half-open clock-window policy to one normalized
 * frontend event. Unknown event times do not satisfy a requested time window.
 */
export function eventMatchesTemporal(
  event,
  dateRange = null,
  timeRange = null,
  temporalWindow = null
) {
  if (temporalWindow?.startLocal && temporalWindow?.endLocal) {
    const eventDate = toYmd(event.date);
    if (!eventDate || !event.time) return false;
    const eventStart = `${eventDate}T${event.time}:00`;
    const eventEndDate = toYmd(event.endDate || event.date);
    const eventEnd = event.endTime
      ? `${eventEndDate}T${event.endTime}:00`
      : event.endDate
        ? `${eventEndDate}T23:59:59`
        : null;
    if (eventEnd) {
      return eventStart < temporalWindow.endLocal && eventEnd > temporalWindow.startLocal;
    }
    return eventStart >= temporalWindow.startLocal && eventStart < temporalWindow.endLocal;
  }

  const dateFrom = dateRange?.start || null;
  const dateTo = dateRange?.end || null;
  if (dateFrom || dateTo) {
    const eventStart = toYmd(event.date);
    const eventEnd = toYmd(event.endDate || event.date);
    if (!eventStart) return false;
    if (dateFrom && eventEnd < dateFrom) return false;
    if (dateTo && eventStart > dateTo) return false;
  }

  if (timeRange?.start || timeRange?.end) {
    if (!event.time) return false;
    if (timeRange.start && event.time < timeRange.start) return false;
    if (timeRange.end && event.time >= timeRange.end) return false;
  }

  return true;
}
