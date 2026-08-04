import { describe, expect, it } from 'vitest';
import {
  expandStaticTerms,
  parseLlmIntent,
  searchAi,
  searchKeyword,
} from './search.js';

const CONTEXT = {
  referenceDate: '2026-08-04',
  timeZone: 'America/Chicago',
};
const EVENTS = [
  {
    id: 1,
    name: 'Jazz concert',
    group: 'School of Music',
    description: 'A live performance',
    venue: 'Kimball Hall',
  },
  {
    id: 2,
    name: 'Career fair',
    group: 'Career Services',
    description: 'Meet employers',
    venue: 'Union',
  },
];

describe('parseLlmIntent', () => {
  it('accepts fenced JSON and normalizes the allowed fields', () => {
    const output = `Here is the result:
\`\`\`json
{"keywords":["Music","Concert"],"date_phrase":"next Tuesday","time_phrase":"evening"}
\`\`\``;

    expect(parseLlmIntent(output)).toEqual({
      keywords: ['music', 'concert'],
      datePhrase: 'next tuesday',
      timePhrase: 'evening',
    });
  });

  it('rejects malformed model output', () => {
    expect(parseLlmIntent('date is probably Tuesday')).toBeNull();
    expect(parseLlmIntent('{"keywords": [}')).toBeNull();
  });

  it('parses the first complete JSON object when the model repeats itself', () => {
    expect(
      parseLlmIntent(
        '{"keywords":["music"],"date_phrase":null,"time_phrase":null} {"keywords":["noise"]}'
      )
    ).toEqual({ keywords: ['music'], datePhrase: null, timePhrase: null });
  });
});

describe('search integration', () => {
  it('removes temporal tokens from keyword terms', () => {
    expect(expandStaticTerms('next Tuesday evening')).toEqual([]);
    expect(expandStaticTerms('jazz next Tuesday evening')).toContain('jazz');
  });

  it('keeps all events as candidates for a pure temporal query', () => {
    const result = searchKeyword(EVENTS, 'next Tuesday evening', CONTEXT);

    expect(result.results).toHaveLength(2);
    expect(result.terms).toEqual([]);
    expect(result.date_range).toEqual({ start: '2026-08-11', end: '2026-08-11' });
    expect(result.time_range).toEqual({ start: '17:00', end: '21:00' });
  });

  it('uses an injected LLM intent while resolving its time deterministically', async () => {
    const result = await searchAi(EVENTS, 'find me something after classes', {
      ...CONTEXT,
      llmExtractor: async () => ({
        keywords: ['concert'],
        datePhrase: 'next Tuesday',
        timePhrase: 'evening',
      }),
    });

    expect(result.llmUsed).toBe(true);
    expect(result.results.map(({ id }) => id)).toEqual([1]);
    expect(result.llm_intent).toEqual({
      keywords: ['concert'],
      datePhrase: 'next tuesday',
      timePhrase: 'evening',
    });
    expect(result.temporal.startUtc).toBe('2026-08-11T22:00:00.000Z');
    expect(result.temporal.endUtc).toBe('2026-08-12T02:00:00.000Z');
  });

  it('falls back to deterministic parsing when the LLM fails', async () => {
    const result = await searchAi(EVENTS, 'next Tuesday evening', {
      ...CONTEXT,
      llmExtractor: async () => {
        throw new Error('model unavailable');
      },
    });

    expect(result.llmUsed).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.temporal.startLocal).toBe('2026-08-11T17:00:00');
  });

  it('drops temporal phrases that the LLM incorrectly returns as keywords', async () => {
    const result = await searchAi(EVENTS, 'next Tuesday', {
      ...CONTEXT,
      llmExtractor: async () => ({
        keywords: ['next Tuesday'],
        datePhrase: 'next Tuesday',
        timePhrase: null,
      }),
    });

    expect(result.terms).toEqual([]);
    expect(result.results).toHaveLength(2);
  });

  it('ignores an invalid temporal phrase hallucinated by the LLM', async () => {
    const result = await searchAi(EVENTS, 'jazz', {
      ...CONTEXT,
      llmExtractor: async () => ({
        keywords: ['jazz'],
        datePhrase: 'not provided',
        timePhrase: null,
      }),
    });

    expect(result.temporal_invalid.date).toBe(false);
    expect(result.results.map(({ id }) => id)).toEqual([1]);
  });
});
