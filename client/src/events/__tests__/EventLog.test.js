import { describe, expect, it } from 'vitest';
import { matchesEvent } from '../EventLog.js';

describe('matchesEvent', () => {
  const event = {
    year: 1127,
    short: '靖康之变',
    title: '北宋覆亡与南宋建立',
    detail: '金军南下，东京失守。',
    place: '东京',
  };

  it('matches searchable event fields case-insensitively', () => {
    expect(matchesEvent(event, '靖康')).toBe(true);
    expect(matchesEvent(event, '东京')).toBe(true);
    expect(matchesEvent(event, '1127')).toBe(true);
  });

  it('does not match unrelated text and tolerates missing fields', () => {
    expect(matchesEvent({ year: 960 }, '宋')).toBe(false);
    expect(matchesEvent({ year: 960 }, '  960  ')).toBe(true);
  });
});
