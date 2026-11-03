import type { RoutePoint } from './routeTypes';

export function slopePercent(from: RoutePoint, to: RoutePoint): number {
  const span = to.distanceMeters - from.distanceMeters;
  if (span <= 0) return from.inclinePercent ?? 0;
  if (from.inclinePercent != null && to.inclinePercent != null && from.elevationMeters == null) {
    return from.inclinePercent;
  }
  const elevA = from.elevationMeters ?? 0;
  const elevB = to.elevationMeters ?? elevA;
  return ((elevB - elevA) / span) * 100;
}

export function inclineAtDistance(profile: RoutePoint[], meters: number): number {
  if (profile.length === 0) return 0;
  if (profile.length === 1) return profile[0]?.inclinePercent ?? 0;
  const last = profile[profile.length - 1];
  const clamped = Math.min(Math.max(meters, profile[0]?.distanceMeters ?? 0), last?.distanceMeters ?? meters);
  for (let index = 1; index < profile.length; index += 1) {
    const start = profile[index - 1];
    const end = profile[index];
    if (!start || !end) continue;
    if (clamped <= end.distanceMeters || index === profile.length - 1) {
      return slopePercent(start, end);
    }
  }
  return 0;
}

export function elevationGainMeters(profile: RoutePoint[], traveledMeters: number): number {
  let gain = 0;
  for (let index = 1; index < profile.length; index += 1) {
    const start = profile[index - 1];
    const end = profile[index];
    if (!start || !end) continue;
    if (traveledMeters <= start.distanceMeters) break;
    const span = end.distanceMeters - start.distanceMeters;
    if (span <= 0) continue;
    const covered = Math.min(span, traveledMeters - start.distanceMeters);
    const elevStart = start.elevationMeters ?? 0;
    const elevEnd = end.elevationMeters ?? elevStart;
    const delta = ((elevEnd - elevStart) * covered) / span;
    if (delta > 0) gain += delta;
  }
  return gain;
}

export function profileWithIncline(points: RoutePoint[]): RoutePoint[] {
  return points.map((point, index) => {
    const next = points[index + 1] ?? point;
    return {
      ...point,
      inclinePercent: Math.round(slopePercent(point, next) * 10) / 10,
    };
  });
}
