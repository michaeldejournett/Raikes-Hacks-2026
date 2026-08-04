import { describe, expect, it } from 'vitest';
import { parseIsoDate } from './api.js';

describe('parseIsoDate', () => {
  it('converts a UTC instant to the prior Central Time calendar date', () => {
    expect(parseIsoDate('2026-02-25T00:30:00Z')).toEqual({
      date: '2026-02-24',
      time: '18:30',
    });
  });

  it('uses the daylight-saving offset during summer', () => {
    expect(parseIsoDate('2026-07-15T00:30:00Z')).toEqual({
      date: '2026-07-14',
      time: '19:30',
    });
  });

  it('handles the spring DST transition without producing a nonexistent time', () => {
    expect(parseIsoDate('2026-03-08T07:30:00Z')).toEqual({
      date: '2026-03-08',
      time: '01:30',
    });
    expect(parseIsoDate('2026-03-08T08:30:00Z')).toEqual({
      date: '2026-03-08',
      time: '03:30',
    });
  });

  it('normalizes explicitly offset timestamps to Central Time', () => {
    expect(parseIsoDate('2026-03-01T12:00:00-06:00')).toEqual({
      date: '2026-03-01',
      time: '12:00',
    });
    expect(parseIsoDate('2026-03-01T12:00:00-07:00')).toEqual({
      date: '2026-03-01',
      time: '13:00',
    });
  });

  it('preserves offset-less scraper timestamps as local wall-clock values', () => {
    expect(parseIsoDate('2026-03-01T12:30:00')).toEqual({
      date: '2026-03-01',
      time: '12:30',
    });
    expect(parseIsoDate('2026-03-01')).toEqual({
      date: '2026-03-01',
      time: null,
    });
  });

  it('returns empty fields for missing or malformed values', () => {
    expect(parseIsoDate(null)).toEqual({ date: null, time: null });
    expect(parseIsoDate('not-a-date')).toEqual({ date: null, time: null });
  });
});
