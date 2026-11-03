/**
 * Integrate belt speed over a time slice.
 * 10 km/h for 360 s is exactly 1000 m.
 */
export function integrateDistanceMeters(speedKmh: number, deltaSeconds: number): number {
  if (!Number.isFinite(speedKmh) || !Number.isFinite(deltaSeconds)) return 0;
  if (deltaSeconds <= 0 || speedKmh <= 0) return 0;
  return (speedKmh / 3.6) * deltaSeconds;
}

/** Time-weighted average. Distance must already be the integral of speed. */
export function averageSpeedKmh(distanceMeters: number, activeSeconds: number): number {
  if (activeSeconds <= 0) return 0;
  return (distanceMeters / activeSeconds) * 3.6;
}
