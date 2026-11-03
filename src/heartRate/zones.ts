export type HeartRateZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

/** Zones are a share of the user's own max. Nothing is inferred from age. */
export function heartRateZone(bpm: number, maxHeartRate: number | null | undefined): HeartRateZone | null {
  if (maxHeartRate == null || !Number.isFinite(maxHeartRate) || maxHeartRate < 100) return null;
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  const ratio = bpm / maxHeartRate;
  if (ratio < 0.6) return 'Z1';
  if (ratio < 0.7) return 'Z2';
  if (ratio < 0.8) return 'Z3';
  if (ratio < 0.9) return 'Z4';
  return 'Z5';
}
