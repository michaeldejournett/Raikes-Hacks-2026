/**
 * Static data layer for Curia on GitHub Pages.
 * Loads pre-scraped UNL events from /curia/events.json and transforms
 * them from the scraper format into the frontend event format.
 */

// Keyword → category mapping for inference
const CATEGORY_SIGNALS = [
  {
    keywords: [
      'technology',
      'coding',
      'programming',
      'software',
      'computer',
      'hackathon',
      'ai ',
      'artificial intelligence',
      'machine learning',
      'data science',
      'engineering',
      'stem',
      'robot',
      'cyber',
      'web',
      'cloud',
      'mobile',
      'app',
    ],
    category: 'technology',
  },
  {
    keywords: [
      'music',
      'concert',
      'jazz',
      'band',
      'orchestra',
      'choir',
      'symphony',
      'opera',
      'recital',
      'performance',
      'live music',
      'rap',
      'hip hop',
      'r&b',
    ],
    category: 'music',
  },
  {
    keywords: [
      'sport',
      'athletic',
      'game',
      'basketball',
      'football',
      'soccer',
      'volleyball',
      'baseball',
      'softball',
      'swim',
      'running',
      'track',
      'golf',
      'tennis',
      'wrestling',
      'husker',
      'rec center',
      'fitness',
    ],
    category: 'sports',
  },
  {
    keywords: [
      'food',
      'dinner',
      'lunch',
      'breakfast',
      'brunch',
      'meal',
      'pizza',
      'cook',
      'culinary',
      'beverage',
      'beer',
      'wine',
      'dining',
      'taste',
      'baking',
      'potluck',
    ],
    category: 'food',
  },
  {
    keywords: [
      'art',
      'gallery',
      'exhibit',
      'museum',
      'theater',
      'theatre',
      'film',
      'movie',
      'cinema',
      'dance',
      'painting',
      'sculpture',
      'photography',
      'comedy',
      'poetry',
      'literary',
      'drama',
      'ross movie',
      'visual arts',
    ],
    category: 'arts',
  },
  {
    keywords: [
      'community',
      'volunteer',
      'service',
      'charity',
      'nonprofit',
      'diversity',
      'inclusion',
      'culture',
      'cultural',
      'multicultural',
      'international',
      'greek',
      'student org',
      'club',
      'sustainability',
      'environment',
      'garden',
    ],
    category: 'community',
  },
  {
    keywords: [
      'health',
      'wellness',
      'yoga',
      'meditation',
      'mental health',
      'fitness',
      'nutrition',
      'medical',
      'nursing',
      'healthcare',
      'mindfulness',
      'gym',
    ],
    category: 'health',
  },
  {
    keywords: [
      'lecture',
      'seminar',
      'workshop',
      'conference',
      'academic',
      'research',
      'education',
      'career',
      'networking',
      'internship',
      'job fair',
      'resume',
      'startup',
      'business',
      'leadership',
      'colloquium',
      'symposium',
      'dissertation',
    ],
    category: 'education',
  },
];

function inferCategory(event) {
  const text = `${event.title} ${event.description ?? ''} ${event.group ?? ''}`.toLowerCase();

  // Ross Movie events are always arts
  if (event.group === 'Ross Movie') return 'arts';

  let bestCategory = null;
  let bestScore = 0;

  for (const { keywords, category } of CATEGORY_SIGNALS) {
    const score = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory ?? 'community';
}

const EVENT_TIME_ZONE = 'America/Chicago';
const EXPLICIT_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const OFFSETLESS_LOCAL_RE =
  /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;

/**
 * Convert a scraper timestamp to Curia's Central Time calendar fields.
 *
 * Timestamps with an explicit offset represent instants and are converted to
 * America/Chicago. Offset-less values are treated as already-local scraper
 * values so their wall-clock date and time do not change with the viewer's
 * browser timezone.
 */
export function parseIsoDate(iso, timeZone = EVENT_TIME_ZONE) {
  if (!iso) return { date: null, time: null };

  const value = String(iso).trim();
  if (!value) return { date: null, time: null };

  if (!EXPLICIT_OFFSET_RE.test(value)) {
    const local = value.match(OFFSETLESS_LOCAL_RE);
    if (!local) return { date: null, time: null };
    return {
      date: local[1],
      time: local[2] && local[3] ? `${local[2]}:${local[3]}` : null,
    };
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return { date: null, time: null };

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, partValue])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

let cachedEvents = null;

export async function loadEvents() {
  if (cachedEvents) return cachedEvents;

  const res = await fetch(`${import.meta.env.BASE_URL}curia/events.json`);
  if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
  const data = await res.json();

  // Scraper format → frontend format
  cachedEvents = data.events.map((ev, idx) => {
    const { date: startDate, time: startTime } = parseIsoDate(ev.start);
    const { date: endDate, time: endTime } = parseIsoDate(ev.end);
    const category = inferCategory(ev);

    // Venue is the full location string from scraper; extract the meaningful name
    // Format: "Building Name-Room Name Room:Room Number" or just "Building Name"
    const venueFull = ev.location ?? '';
    const venue = venueFull.split(' Room:')[0].split('-').slice(0, 2).join(' - ') || venueFull;

    return {
      id: idx,
      name: ev.title,
      description: ev.description ?? '',
      date: startDate,
      time: startTime,
      endDate: endDate,
      endTime: endTime,
      venue: venue || 'UNL Campus',
      location: 'Lincoln, NE',
      category,
      tags: [],
      imageUrl: ev.image_url ?? null,
      url: ev.url ?? null,
      price: null,
      groupCount: 0,
      source: ev.source,
      audience: ev.audience ?? [],
    };
  });

  return cachedEvents;
}
