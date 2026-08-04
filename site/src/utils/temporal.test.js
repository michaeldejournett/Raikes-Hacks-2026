import { describe, expect, it } from 'vitest';
import {
  eventMatchesTemporal,
  parseDateRange,
  parseTimeRange,
  referenceDateInZone,
  resolveTemporalQuery,
  stripTemporalPhrases,
} from './temporal.js';

const CONTEXT = {
  referenceDate: '2026-08-04',
  timeZone: 'America/Chicago',
};

describe('resolveTemporalQuery', () => {
  it('turns next Tuesday evening into exact Central and UTC boundaries', () => {
    const result = resolveTemporalQuery('next Tuesday evening', CONTEXT);

    expect(result.dateRange).toEqual({ start: '2026-08-11', end: '2026-08-11' });
    expect(result.timeRange).toEqual({ start: '17:00', end: '21:00' });
    expect(result.temporal).toEqual({
      timeZone: 'America/Chicago',
      startLocal: '2026-08-11T17:00:00',
      endLocal: '2026-08-11T21:00:00',
      startUtc: '2026-08-11T22:00:00.000Z',
      endUtc: '2026-08-12T02:00:00.000Z',
      precision: 'time-range',
      endExclusive: true,
      filterMode: 'daily',
    });
  });

  it('uses the event timezone when the reference instant is near UTC midnight', () => {
    const result = resolveTemporalQuery('next Tuesday evening', {
      referenceDate: new Date('2026-08-05T02:30:00.000Z'),
      timeZone: 'America/Chicago',
    });

    expect(referenceDateInZone(new Date('2026-08-05T02:30:00.000Z'))).toBe('2026-08-04');
    expect(result.dateRange).toEqual({ start: '2026-08-11', end: '2026-08-11' });
  });

  it('changes the UTC offset across daylight-saving time', () => {
    const summer = resolveTemporalQuery('August 11 at 5pm', CONTEXT);
    const winter = resolveTemporalQuery('December 1 at 5pm', CONTEXT);

    expect(summer.temporal.startUtc).toBe('2026-08-11T22:00:00.000Z');
    expect(winter.temporal.startUtc).toBe('2026-12-01T23:00:00.000Z');
  });

  it('shifts nonexistent spring-forward times and chooses the later repeated hour', () => {
    const spring = resolveTemporalQuery('March 8 2026 at 2:30am', CONTEXT);
    const fall = resolveTemporalQuery('November 1 2026 at 1:30am', CONTEXT);

    expect(spring.temporal.startLocal).toBe('2026-03-08T03:30:00');
    expect(spring.temporal.endLocal).toBe('2026-03-08T04:30:00');
    expect(spring.temporal.startUtc).toBe('2026-03-08T08:30:00.000Z');
    expect(spring.temporal.endUtc).toBe('2026-03-08T09:30:00.000Z');
    expect(fall.temporal.startUtc).toBe('2026-11-01T07:30:00.000Z');
    expect(fall.temporal.endUtc).toBe('2026-11-01T08:30:00.000Z');
  });

  it('uses LLM phrases only when the literal query has no recognized phrase', () => {
    const result = resolveTemporalQuery('something after classes', {
      ...CONTEXT,
      datePhrase: 'next Tuesday',
      timePhrase: 'evening',
    });

    expect(result.dateRange.start).toBe('2026-08-11');
    expect(result.timeRange).toEqual({ start: '17:00', end: '21:00' });
    expect(result.intent.dateSource).toBe('llm');
    expect(result.intent.timeSource).toBe('llm');
  });
});

describe('calendar language', () => {
  it.each([
    ['today', { start: '2026-08-04', end: '2026-08-04' }],
    ['tomorrow', { start: '2026-08-05', end: '2026-08-05' }],
    ['next week', { start: '2026-08-10', end: '2026-08-16' }],
    ['last week', { start: '2026-07-27', end: '2026-08-02' }],
    ['this weekend', { start: '2026-08-08', end: '2026-08-09' }],
    ['next weekend', { start: '2026-08-15', end: '2026-08-16' }],
    ['in 2 weeks', { start: '2026-08-18', end: '2026-08-18' }],
    ['March 10', { start: '2027-03-10', end: '2027-03-10' }],
    ['in March', { start: '2027-03-01', end: '2027-03-31' }],
    ['last Tuesday', { start: '2026-07-28', end: '2026-07-28' }],
  ])('resolves %s', (query, expected) => {
    expect(parseDateRange(query, CONTEXT)).toEqual(expected);
  });

  it('keeps the current weekend when the reference day is Saturday or Sunday', () => {
    expect(parseDateRange('this weekend', { ...CONTEXT, referenceDate: '2026-08-08' })).toEqual({
      start: '2026-08-08',
      end: '2026-08-09',
    });
    expect(parseDateRange('this weekend', { ...CONTEXT, referenceDate: '2026-08-09' })).toEqual({
      start: '2026-08-08',
      end: '2026-08-09',
    });
  });

  it('does not treat month names embedded in words as dates', () => {
    expect(parseDateRange('a mayhem concert', CONTEXT)).toBeNull();
  });

  it('flags an impossible date instead of silently broadening the search', () => {
    const result = resolveTemporalQuery('music February 30', CONTEXT);
    expect(result.dateRange).toBeNull();
    expect(result.invalid.date).toBe(true);
  });
});

describe('clock language', () => {
  it.each([
    ['tomorrow morning', { start: '06:00', end: '12:00' }],
    ['tonight', { start: '17:00', end: '21:00' }],
    ['after 6pm', { start: '18:00', end: '23:59' }],
    ['before noon', { start: '00:00', end: '12:00' }],
    ['at 3pm', { start: '15:00', end: '16:00' }],
    ['from 6:30pm to 8pm', { start: '18:30', end: '20:00' }],
    ['between 11 and 1pm', { start: '11:00', end: '13:00' }],
  ])('resolves %s', (query, expected) => {
    expect(parseTimeRange(query)).toEqual(expected);
  });
});

describe('stripTemporalPhrases', () => {
  it('leaves only topical content', () => {
    expect(stripTemporalPhrases('jazz next Tuesday evening')).toBe('jazz');
  });
});

describe('eventMatchesTemporal', () => {
  const dateRange = { start: '2026-08-11', end: '2026-08-11' };
  const evening = { start: '17:00', end: '21:00' };

  it('matches an event inside the resolved Tuesday-evening window', () => {
    expect(
      eventMatchesTemporal({ date: '2026-08-11', time: '19:30' }, dateRange, evening)
    ).toBe(true);
  });

  it('uses a half-open end boundary and rejects unknown times', () => {
    expect(
      eventMatchesTemporal({ date: '2026-08-11', time: '21:00' }, dateRange, evening)
    ).toBe(false);
    expect(eventMatchesTemporal({ date: '2026-08-11', time: null }, dateRange, evening)).toBe(
      false
    );
  });

  it('uses date overlap for multi-day events', () => {
    expect(
      eventMatchesTemporal(
        { date: '2026-08-10', endDate: '2026-08-12', time: '18:00' },
        dateRange,
        evening
      )
    ).toBe(true);
  });

  it('matches both sides of an overnight time window', () => {
    const overnight = resolveTemporalQuery('tomorrow from 11pm to 1am', {
      referenceDate: '2026-02-01',
      timeZone: 'America/Chicago',
    });

    expect(overnight.temporal.startLocal).toBe('2026-02-02T23:00:00');
    expect(overnight.temporal.endLocal).toBe('2026-02-03T01:00:00');
    expect(overnight.temporal.filterMode).toBe('absolute');
    expect(
      eventMatchesTemporal(
        { date: '2026-02-02', time: '23:30' },
        overnight.dateRange,
        overnight.timeRange,
        overnight.temporal
      )
    ).toBe(true);
    expect(
      eventMatchesTemporal(
        { date: '2026-02-03', time: '00:30' },
        overnight.dateRange,
        overnight.timeRange,
        overnight.temporal
      )
    ).toBe(true);
  });

  it('applies a day-part independently on every day in a multi-day range', () => {
    const week = resolveTemporalQuery('this week evening', CONTEXT);

    expect(week.temporal.filterMode).toBe('daily');
    expect(
      eventMatchesTemporal(
        { date: '2026-08-05', time: '10:00' },
        week.dateRange,
        week.timeRange
      )
    ).toBe(false);
    expect(
      eventMatchesTemporal(
        { date: '2026-08-05', time: '19:00' },
        week.dateRange,
        week.timeRange
      )
    ).toBe(true);
  });

  it('does not require a clock time for a date-only query', () => {
    const tomorrow = resolveTemporalQuery('tomorrow', CONTEXT);
    expect(
      eventMatchesTemporal(
        { date: '2026-08-05', time: null },
        tomorrow.dateRange,
        tomorrow.timeRange
      )
    ).toBe(true);
  });
});
