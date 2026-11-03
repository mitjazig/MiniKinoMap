/** Minutes per kilometre. Null when the belt is stopped. */
export function paceMinutesPerKm(speedKmh: number): number | null {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0.05) return null;
  return 60 / speedKmh;
}

export function formatPace(speedKmh: number): string {
  const pace = paceMinutesPerKm(speedKmh);
  if (pace == null || !Number.isFinite(pace)) return '--:--';
  const totalSeconds = Math.round(pace * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
