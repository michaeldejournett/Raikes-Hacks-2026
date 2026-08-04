/**
 * Client-side event search for Curia on GitHub Pages.
 *
 * Two-tier approach:
 * 1. Static keyword generalization map (instant, same as backend keywords.js)
 * 2. LLM keyword expansion via @huggingface/transformers (LaMini-Flan-T5-248M)
 *    — same model used by the Character Creator
 *
 * Also handles date/time parsing from natural language queries.
 */

import {
  resolveTemporalQuery,
  stripTemporalPhrases,
} from './temporal.js';

export { parseDateRange, parseTimeRange } from './temporal.js';

// ── Static keyword generalization map (ported from backend/keywords.js) ──────
const GENERALIZATIONS = [
  {
    terms: [
      'pizza',
      'burger',
      'taco',
      'sushi',
      'pasta',
      'barbecue',
      'bbq',
      'sandwich',
      'buffet',
      'potluck',
    ],
    add: ['food', 'dining'],
  },
  { terms: ['coffee', 'cafe', 'espresso', 'latte'], add: ['food', 'beverage', 'cafe'] },
  {
    terms: ['beer', 'brewery', 'brew', 'craft beer', 'ale', 'lager'],
    add: ['food', 'beverage', 'alcohol'],
  },
  {
    terms: ['wine', 'winery', 'tasting', 'vineyard', 'sommelier'],
    add: ['food', 'beverage', 'alcohol'],
  },
  {
    terms: ['bake', 'baking', 'cook', 'cooking', 'chef', 'culinary', 'recipe'],
    add: ['food', 'cooking'],
  },
  {
    terms: ['dinner', 'lunch', 'breakfast', 'brunch', 'meal', 'feast', 'banquet'],
    add: ['food', 'dining'],
  },
  {
    terms: ['biology', 'botany', 'zoology', 'microbiology', 'ecology'],
    add: ['science', 'stem', 'biology'],
  },
  {
    terms: ['chemistry', 'biochemistry', 'organic chemistry', 'chemical'],
    add: ['science', 'stem', 'chemistry'],
  },
  {
    terms: ['physics', 'quantum', 'thermodynamics', 'mechanics'],
    add: ['science', 'stem', 'physics'],
  },
  {
    terms: ['astronomy', 'astrophysics', 'telescope', 'planet', 'space', 'nasa', 'cosmos'],
    add: ['science', 'stem', 'space'],
  },
  {
    terms: ['geology', 'geoscience', 'earth science', 'mineralogy'],
    add: ['science', 'stem', 'geology'],
  },
  {
    terms: ['neuroscience', 'psychology', 'cognition', 'brain'],
    add: ['science', 'stem', 'health'],
  },
  {
    terms: ['genetics', 'dna', 'genome', 'gene', 'molecular'],
    add: ['science', 'stem', 'biology'],
  },
  {
    terms: ['statistics', 'probability', 'calculus', 'algebra', 'math', 'mathematics'],
    add: ['science', 'stem', 'math'],
  },
  {
    terms: [
      'python',
      'javascript',
      'typescript',
      'java',
      'rust',
      'golang',
      'c++',
      'swift',
      'kotlin',
    ],
    add: ['technology', 'coding', 'programming'],
  },
  {
    terms: ['machine learning', 'deep learning', 'neural network', 'nlp'],
    add: ['technology', 'ai', 'stem'],
  },
  {
    terms: ['artificial intelligence', 'ai ', ' ai,', 'llm', 'gpt', 'chatbot'],
    add: ['technology', 'ai', 'stem'],
  },
  {
    terms: ['robotics', 'robot', 'drone', 'automation'],
    add: ['technology', 'engineering', 'stem'],
  },
  {
    terms: ['cybersecurity', 'hacking', 'ctf', 'security', 'pentest'],
    add: ['technology', 'security'],
  },
  {
    terms: ['data science', 'data analytics', 'big data', 'visualization', 'tableau', 'pandas'],
    add: ['technology', 'stem', 'data'],
  },
  {
    terms: ['hackathon', 'hack', 'coding challenge', 'competition'],
    add: ['technology', 'coding'],
  },
  {
    terms: ['web development', 'frontend', 'backend', 'full stack', 'react', 'vue', 'angular'],
    add: ['technology', 'coding', 'web'],
  },
  {
    terms: ['cloud', 'aws', 'azure', 'gcp', 'devops', 'kubernetes', 'docker'],
    add: ['technology', 'cloud', 'engineering'],
  },
  { terms: ['app', 'mobile', 'ios', 'android'], add: ['technology', 'mobile'] },
  {
    terms: ['electrical', 'circuit', 'electronics', 'semiconductor'],
    add: ['engineering', 'stem'],
  },
  { terms: ['mechanical', 'cad', 'solidworks', '3d printing'], add: ['engineering', 'stem'] },
  { terms: ['civil engineering', 'structural', 'construction'], add: ['engineering', 'stem'] },
  { terms: ['basketball', 'nba', 'dribble', 'dunk', 'hoop'], add: ['sports', 'athletics'] },
  { terms: ['soccer', 'futbol', 'penalty', 'goal kick'], add: ['sports', 'athletics'] },
  { terms: ['american football', 'nfl', 'touchdown', 'husker'], add: ['sports', 'athletics'] },
  { terms: ['baseball', 'softball', 'pitcher', 'homerun'], add: ['sports', 'athletics'] },
  { terms: ['volleyball', 'spike', 'serve'], add: ['sports', 'athletics'] },
  { terms: ['swimming', 'swim', 'lap pool', 'aquatic'], add: ['sports', 'fitness', 'athletics'] },
  {
    terms: ['running', 'marathon', '5k', '10k', 'cross country', 'track'],
    add: ['sports', 'fitness', 'athletics'],
  },
  { terms: ['cycling', 'bike', 'bicycle', 'triathlon'], add: ['sports', 'fitness'] },
  { terms: ['tennis', 'racket', 'court'], add: ['sports', 'athletics'] },
  { terms: ['golf', 'putt', 'fairway', 'tee'], add: ['sports', 'athletics'] },
  {
    terms: ['wrestling', 'boxing', 'martial arts', 'judo', 'mma', 'kickboxing'],
    add: ['sports', 'athletics'],
  },
  { terms: ['yoga', 'pilates', 'stretch'], add: ['fitness', 'wellness', 'health'] },
  { terms: ['gym', 'weightlifting', 'strength training', 'crossfit'], add: ['fitness', 'health'] },
  { terms: ['rock climbing', 'bouldering', 'climbing'], add: ['sports', 'fitness', 'outdoor'] },
  {
    terms: ['hiking', 'trail', 'backpacking', 'camping'],
    add: ['sports', 'fitness', 'outdoor', 'nature'],
  },
  {
    terms: ['painting', 'watercolor', 'acrylic', 'oil paint', 'canvas'],
    add: ['art', 'visual arts', 'creative'],
  },
  {
    terms: ['drawing', 'illustration', 'sketch', 'comic'],
    add: ['art', 'visual arts', 'creative'],
  },
  { terms: ['sculpture', 'ceramics', 'pottery', 'clay'], add: ['art', 'visual arts', 'creative'] },
  { terms: ['photography', 'photo', 'camera', 'portrait'], add: ['art', 'creative'] },
  {
    terms: ['film', 'cinema', 'movie', 'screening', 'documentary'],
    add: ['art', 'entertainment', 'film'],
  },
  {
    terms: ['theater', 'theatre', 'play', 'musical', 'broadway', 'improv', 'drama'],
    add: ['art', 'performance', 'entertainment'],
  },
  {
    terms: ['dance', 'ballet', 'hip hop dance', 'salsa', 'ballroom'],
    add: ['art', 'performance', 'dance'],
  },
  {
    terms: ['concert', 'live music', 'gig', 'band', 'show'],
    add: ['music', 'performance', 'entertainment'],
  },
  { terms: ['jazz', 'bebop', 'blues'], add: ['music', 'performance', 'art'] },
  {
    terms: ['opera', 'symphony', 'orchestra', 'classical music', 'choir', 'choral'],
    add: ['music', 'performance', 'art'],
  },
  {
    terms: ['rap', 'hip hop', 'r&b', 'soul music'],
    add: ['music', 'performance', 'entertainment'],
  },
  { terms: ['comedy', 'stand up', 'open mic', 'improv'], add: ['entertainment', 'comedy'] },
  {
    terms: ['gaming', 'esports', 'video game', 'tabletop', 'board game'],
    add: ['entertainment', 'gaming'],
  },
  {
    terms: ['poetry', 'spoken word', 'literary', 'writing'],
    add: ['art', 'creative', 'literature'],
  },
  { terms: ['book club', 'reading', 'author'], add: ['education', 'literature'] },
  {
    terms: ['lecture', 'seminar', 'colloquium', 'talk'],
    add: ['academic', 'education', 'learning'],
  },
  {
    terms: ['workshop', 'training', 'tutorial', 'bootcamp'],
    add: ['education', 'learning', 'skills'],
  },
  { terms: ['conference', 'symposium', 'summit'], add: ['academic', 'professional', 'networking'] },
  {
    terms: ['research', 'study', 'experiment', 'lab', 'thesis', 'dissertation'],
    add: ['academic', 'stem', 'research'],
  },
  { terms: ['internship', 'intern', 'co-op'], add: ['career', 'professional', 'job'] },
  {
    terms: ['networking event', 'career fair', 'job fair', 'recruiter', 'employer'],
    add: ['career', 'professional', 'networking'],
  },
  { terms: ['resume', 'cv', 'job search', 'interview'], add: ['career', 'professional'] },
  {
    terms: ['startup', 'entrepreneur', 'pitch', 'venture', 'founder'],
    add: ['career', 'business', 'entrepreneurship'],
  },
  {
    terms: ['business', 'finance', 'accounting', 'economics', 'marketing'],
    add: ['business', 'professional'],
  },
  { terms: ['leadership', 'management', 'executive'], add: ['professional', 'career'] },
  {
    terms: ['meditation', 'mindfulness', 'breathing', 'guided'],
    add: ['wellness', 'mindfulness', 'health'],
  },
  {
    terms: ['mental health', 'anxiety', 'stress', 'depression', 'therapy', 'counseling'],
    add: ['wellness', 'health', 'mental health'],
  },
  {
    terms: ['nutrition', 'diet', 'healthy eating', 'vegan', 'vegetarian'],
    add: ['health', 'food', 'wellness'],
  },
  { terms: ['first aid', 'cpr', 'medical', 'nursing', 'healthcare'], add: ['health', 'medical'] },
  {
    terms: ['volunteer', 'volunteering', 'community service', 'giving back'],
    add: ['community', 'service', 'volunteer'],
  },
  {
    terms: ['charity', 'nonprofit', 'donation', 'fundraiser', 'fundraising'],
    add: ['community', 'nonprofit'],
  },
  {
    terms: ['sustainability', 'environment', 'climate', 'green', 'eco'],
    add: ['environment', 'community', 'sustainability'],
  },
  {
    terms: ['diversity', 'equity', 'inclusion', 'dei', 'multicultural'],
    add: ['community', 'social', 'diversity'],
  },
  {
    terms: ['garden', 'gardening', 'planting', 'nature', 'park'],
    add: ['community', 'outdoor', 'nature'],
  },
  {
    terms: ['religion', 'faith', 'spiritual', 'church', 'mosque', 'temple', 'prayer'],
    add: ['community', 'spiritual'],
  },
  {
    terms: ['international', 'culture', 'cultural', 'heritage', 'global'],
    add: ['community', 'culture', 'international'],
  },
  { terms: ['greek life', 'fraternity', 'sorority'], add: ['community', 'social', 'student life'] },
  {
    terms: ['student org', 'club', 'student government', 'association'],
    add: ['community', 'student life'],
  },
];

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'it',
  'its',
  'they',
  'them',
  'their',
  'this',
  'that',
  'these',
  'those',
  'what',
  'which',
  'who',
  'when',
  'where',
  'how',
  'find',
  'show',
  'me',
  'events',
  'event',
  'something',
  'looking',
  'for',
  'want',
  'unl',
  'nebraska',
  'lincoln',
  'campus',
  // Common LLM noise words for this model
  'date',
  'time',
  'next',
  'month',
  'year',
  'day',
  'week',
  'location',
  'venue',
  'type',
  'style',
  'language',
  'description',
  'trend',
  'availability',
  'taste',
  'price',
  'menu',
  'dish',
  'specialty',
  'recipe',
  'cuisine',
  'restaurant',
  'other',
  'more',
  'related',
  'keyword',
  'keywords',
  'synonym',
  'synonyms',
  'topic',
  'topics',
  'about',
  'like',
  'such',
  'also',
  'new',
  'any',
  'all',
  'get',
  'use',
  'used',
  // Temporal language is interpreted by temporal.js, never by keyword scoring.
  'today',
  'tonight',
  'tomorrow',
  'yesterday',
  'current',
  'last',
  'weekend',
  'morning',
  'noon',
  'afternoon',
  'evening',
  'night',
  'midnight',
  'early',
  'late',
  'after',
  'before',
  'between',
  'from',
  'until',
  'around',
  'during',
  'am',
  'pm',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
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
]);

// ── Static keyword expansion ──────────────────────────────────────────────────
export function expandStaticTerms(query, additionalTemporalPhrases = []) {
  const lower = stripTemporalPhrases(query, additionalTemporalPhrases).toLowerCase();
  const expanded = new Set();

  // Add base terms (non-stop words)
  for (const word of lower.match(/[a-z][a-z0-9'+-]*/g) ?? []) {
    if (word.length > 2 && !STOP_WORDS.has(word)) expanded.add(word);
  }

  // Run through generalizations
  for (const { terms, add } of GENERALIZATIONS) {
    if (terms.some((t) => lower.includes(t))) {
      for (const kw of add) expanded.add(kw);
    }
  }

  return [...expanded];
}

// ── LLM keyword expansion (lazy-loaded, same pattern as Character Creator) ────
let llmPipeline = null;
let llmLoading = false;

async function getLlmPipeline() {
  if (llmPipeline) return llmPipeline;
  if (llmLoading) {
    // Wait for existing load
    while (llmLoading) await new Promise((r) => setTimeout(r, 200));
    return llmPipeline;
  }

  llmLoading = true;
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.backends.onnx.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
    llmPipeline = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
      quantized: true,
    });
    return llmPipeline;
  } finally {
    llmLoading = false;
  }
}

function normalizeIntentField(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'null' || normalized === 'none') return null;
  return normalized.slice(0, 80);
}

function normalizeIntent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const rawKeywords = Array.isArray(data.keywords) ? data.keywords : [];
  const keywords = [
    ...new Set(
      rawKeywords
        .map((keyword) => String(keyword).trim().toLowerCase())
        .map((keyword) => stripTemporalPhrases(keyword))
        .filter(
          (keyword) =>
            keyword.length > 1 &&
            keyword.length <= 60 &&
            !STOP_WORDS.has(keyword) &&
            !/^\d+$/.test(keyword)
        )
    ),
  ].slice(0, 20);

  return {
    keywords,
    datePhrase: normalizeIntentField(data.date_phrase ?? data.datePhrase),
    timePhrase: normalizeIntentField(data.time_phrase ?? data.timePhrase),
  };
}

/**
 * Parse the local model's output without executing or trusting it.
 * Markdown fences and leading prose are tolerated, but only the first JSON
 * object and the three allowed fields are retained.
 */
export function parseLlmIntent(rawOutput) {
  const raw =
    typeof rawOutput === 'string'
      ? rawOutput
      : rawOutput && typeof rawOutput.generated_text === 'string'
        ? rawOutput.generated_text
        : '';
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let end = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end <= start) return null;
  try {
    return normalizeIntent(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/**
 * Ask the browser LLM to classify temporal language, not calculate dates.
 * Date arithmetic and timezone conversion remain deterministic in temporal.js.
 */
export async function extractSearchIntentWithLlm(query) {
  try {
    const pipe = await getLlmPipeline();
    const prompt = `Extract a university-event search query into JSON.
Never calculate a calendar date. Copy relative date and time phrases so code can resolve them.
Exclude all date/time words from keywords. Add a few useful topic synonyms.
Return exactly: {"keywords":[],"date_phrase":null,"time_phrase":null}

Examples:
"music next Tuesday evening" => {"keywords":["music","concert"],"date_phrase":"next Tuesday","time_phrase":"evening"}
"workshops after 6pm" => {"keywords":["workshop","training"],"date_phrase":null,"time_phrase":"after 6pm"}
"career fair tomorrow morning" => {"keywords":["career","job","networking"],"date_phrase":"tomorrow","time_phrase":"morning"}

Query: "${String(query).replaceAll('"', "'")}"
JSON:`;
    const [result] = await pipe(prompt, {
      max_new_tokens: 140,
      repetition_penalty: 1.3,
      no_repeat_ngram_size: 3,
    });
    return parseLlmIntent(result) ?? { keywords: [], datePhrase: null, timePhrase: null };
  } catch {
    return { keywords: [], datePhrase: null, timePhrase: null };
  }
}

// ── Scoring (ported from api/search.py) ──────────────────────────────────────
const FIELD_WEIGHTS = { name: 4, group: 3, description: 2, location: 1 };

function scoreEvent(event, terms) {
  if (!terms.length) return 0;
  const fields = {
    name: (event.name ?? '').toLowerCase(),
    group: (event.group ?? '').toLowerCase(),
    description: (event.description ?? '').toLowerCase(),
    location: (event.venue ?? '').toLowerCase(),
  };

  let score = 0;
  for (const term of terms) {
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      if (fields[field].includes(term)) score += weight;
    }
  }
  return score;
}

function rankEvents(events, terms, hasTemporalConstraint) {
  if (!terms.length) return hasTemporalConstraint ? [...events] : [];
  return events
    .map((event) => ({ event, score: scoreEvent(event, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ event }) => event);
}

function buildSearchResult(results, terms, llmUsed, temporalResult, llmIntent = null) {
  return {
    results,
    terms,
    llmUsed,
    date_range: temporalResult.dateRange,
    time_range: temporalResult.timeRange,
    temporal: temporalResult.temporal,
    temporal_window: temporalResult.temporal,
    temporal_intent: temporalResult.intent,
    temporal_invalid: temporalResult.invalid,
    llm_intent: llmIntent,
    count: results.length,
  };
}

// ── Public search API ─────────────────────────────────────────────────────────

/**
 * Fast keyword-only search (no LLM). Returns ranked results instantly.
 */
export function searchKeyword(events, query, options = {}) {
  if (!query.trim()) {
    return {
      results: events,
      terms: [],
      llmUsed: false,
      count: events.length,
      date_range: null,
      time_range: null,
      temporal: null,
    };
  }

  const temporalResult = resolveTemporalQuery(query, options);
  const terms = expandStaticTerms(query);
  const hasTemporalConstraint = Boolean(temporalResult.dateRange || temporalResult.timeRange);
  const hasInvalidTemporal = temporalResult.invalid.date || temporalResult.invalid.time;
  const results = hasInvalidTemporal ? [] : rankEvents(events, terms, hasTemporalConstraint);

  return buildSearchResult(results, terms, false, temporalResult);
}

/**
 * AI-assisted search. The model extracts symbolic date/time phrases and topic
 * keywords; deterministic code owns date arithmetic and timezone conversion.
 */
export async function searchAi(events, query, options = {}) {
  if (!query.trim()) {
    return {
      results: events,
      terms: [],
      llmUsed: false,
      count: events.length,
      date_range: null,
      time_range: null,
      temporal: null,
    };
  }

  // Capture one clock value before the asynchronous model call so a search
  // crossing midnight cannot resolve relative dates against two different days.
  const referenceDate = options.referenceDate ?? new Date();
  const llmExtractor = options.llmExtractor ?? extractSearchIntentWithLlm;
  const llmIntent =
    normalizeIntent(await llmExtractor(query).catch(() => null)) ?? {
      keywords: [],
      datePhrase: null,
      timePhrase: null,
    };
  const temporalResult = resolveTemporalQuery(query, {
    ...options,
    referenceDate,
    datePhrase: llmIntent.datePhrase,
    timePhrase: llmIntent.timePhrase,
  });
  const staticTerms = expandStaticTerms(query, [llmIntent.datePhrase, llmIntent.timePhrase]);
  const allTerms = [...new Set([...staticTerms, ...llmIntent.keywords])];
  const llmUsed = Boolean(
    llmIntent.keywords.length || llmIntent.datePhrase || llmIntent.timePhrase
  );
  const hasTemporalConstraint = Boolean(temporalResult.dateRange || temporalResult.timeRange);
  const hasInvalidTemporal = temporalResult.invalid.date || temporalResult.invalid.time;
  const results = hasInvalidTemporal ? [] : rankEvents(events, allTerms, hasTemporalConstraint);

  return buildSearchResult(results, allTerms, llmUsed, temporalResult, llmIntent);
}
