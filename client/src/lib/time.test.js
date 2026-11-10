import { describe, test, expect } from 'vitest';
import { formatDuration, secondsUntil, relativeFromNow } from './time';

describe('formatDuration', () => {
  test.each([
    [0, '00:00'],
    [5, '00:05'],
    [65, '01:05'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [7265, '2:01:05'],
    [-10, '00:00'],
  ])('%i seconds -> %s', (s, out) => {
    expect(formatDuration(s)).toBe(out);
  });
});

describe('secondsUntil', () => {
  test('counts down to a future date and floors at zero', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    expect(secondsUntil('2026-01-01T10:01:30Z', now)).toBe(90);
    expect(secondsUntil('2026-01-01T09:00:00Z', now)).toBe(0);
  });
});

describe('relativeFromNow', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  test('formats short relative windows', () => {
    expect(relativeFromNow('2026-01-01T10:00:30Z', now)).toBe('in <1 min');
    expect(relativeFromNow('2026-01-01T10:25:00Z', now)).toBe('in 25 min');
    expect(relativeFromNow('2026-01-01T12:10:00Z', now)).toBe('in 2 h 10 min');
    expect(relativeFromNow('2026-01-01T09:00:00Z', now)).toBe('expired');
  });
});
