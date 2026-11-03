import { describe, expect, it } from 'vitest';
import { formatPace, paceMinutesPerKm } from '../utils/pace';

describe('pace', () => {
  it('is 60 divided by speed', () => {
    expect(paceMinutesPerKm(10)).toBeCloseTo(6, 5);
    expect(paceMinutesPerKm(8.4)).toBeCloseTo(60 / 8.4, 5);
  });

  it('formats 8.4 km/h as 7:09', () => {
    expect(formatPace(8.4)).toBe('7:09');
    expect(formatPace(10)).toBe('6:00');
  });

  it('shows a placeholder when stopped', () => {
    expect(paceMinutesPerKm(0)).toBeNull();
    expect(formatPace(0)).toBe('--:--');
  });
});
