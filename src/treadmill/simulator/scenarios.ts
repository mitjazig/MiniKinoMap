export type ScenarioId = 'manual' | 'easy' | 'intervals' | 'hills' | 'random';

export type FaultMode = 'off' | 'occasional';

export const SCENARIOS: { id: ScenarioId; label: string; detail: string }[] = [
  { id: 'manual', label: 'Manual', detail: 'Slider and preset speeds' },
  { id: 'easy', label: 'Easy run', detail: '5 min at 6, 10 min at 8, 5 min at 6' },
  { id: 'intervals', label: 'Intervals', detail: '2 min at 6, 1 min at 12, repeat' },
  { id: 'hills', label: 'Hills', detail: 'Incline sweeps between 0 and 10%' },
  { id: 'random', label: 'Random', detail: 'New speed and incline about every 40 s' },
];

export function scenarioOwnsSpeed(id: ScenarioId): boolean {
  return id === 'easy' || id === 'intervals' || id === 'random';
}

export function scenarioOwnsIncline(id: ScenarioId): boolean {
  return id === 'hills' || id === 'random';
}

/** Prescribed speed, or null when the rider is in control. */
export function prescribedSpeed(id: ScenarioId, elapsedSeconds: number): number | null {
  if (id === 'easy') {
    if (elapsedSeconds < 5 * 60) return 6;
    if (elapsedSeconds < 15 * 60) return 8;
    return 6;
  }
  if (id === 'intervals') {
    return elapsedSeconds % 180 < 120 ? 6 : 12;
  }
  return null;
}

/** Prescribed incline, or null when the rider is in control. Hills is a 4 minute sweep. */
export function prescribedIncline(id: ScenarioId, elapsedSeconds: number): number | null {
  if (id !== 'hills') return null;
  const phase = (elapsedSeconds % 240) / 240;
  return 5 - 5 * Math.cos(phase * Math.PI * 2);
}
