import { describe, expect, it } from 'vitest';
import { averageSpeedKmh, integrateDistanceMeters } from '../utils/distance';

describe('distance', () => {
  it('integrates 10 km/h for 360 seconds to 1 km', () => {
    expect(integrateDistanceMeters(10, 360)).toBeCloseTo(1000, 5);
  });

  it('ignores a stopped belt and negative time', () => {
    expect(integrateDistanceMeters(0, 10)).toBe(0);
    expect(integrateDistanceMeters(10, 0)).toBe(0);
    expect(integrateDistanceMeters(10, -5)).toBe(0);
  });

  it('computes a time-weighted average from distance and active time', () => {
    expect(averageSpeedKmh(1000, 360)).toBeCloseTo(10, 5);
    expect(averageSpeedKmh(0, 0)).toBe(0);
  });
});
