/**
 * ACSM walking / running oxygen-cost estimate.
 * Walking equation below 8 km/h, running equation at and above.
 * Result is kcal per second for the given body weight.
 */
export function caloriesPerSecond(
  speedKmh: number,
  inclinePercent: number,
  weightKg: number,
): number {
  if (speedKmh <= 0.2 || weightKg <= 0) return 0;
  const speedMperMin = (speedKmh * 1000) / 60;
  const grade = Math.max(0, inclinePercent) / 100;
  const vo2 =
    speedKmh >= 8
      ? 0.2 * speedMperMin + 0.9 * speedMperMin * grade + 3.5
      : 0.1 * speedMperMin + 1.8 * speedMperMin * grade + 3.5;
  const kcalPerMin = (vo2 * weightKg) / 200;
  return kcalPerMin / 60;
}
