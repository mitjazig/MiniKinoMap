import type { HeartRateOrigin, HrPreference } from './HeartRateSource';

export type HeartRateCandidate = {
  bpm: number;
  label: string;
};

export type DisplayedHeartRate = {
  bpm: number;
  label: string;
  origin: HeartRateOrigin;
};

export type HeartRateSelectionInput = {
  preference: HrPreference;
  external: HeartRateCandidate | null;
  treadmillBpm: number | null;
  simulator: HeartRateCandidate | null;
};

function positive(bpm: number | null | undefined): number | null {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return null;
  return bpm;
}

/**
 * Pick one heart-rate reading.
 * Auto: external BLE, then the treadmill, then the simulator.
 * An explicit preference uses only that source.
 */
export function selectDisplayedHeartRate(input: HeartRateSelectionInput): DisplayedHeartRate | null {
  const externalBpm = positive(input.external?.bpm);
  const treadmillBpm = positive(input.treadmillBpm);
  const simulatorBpm = positive(input.simulator?.bpm);

  const external: DisplayedHeartRate | null =
    input.external && externalBpm != null
      ? { bpm: externalBpm, label: input.external.label || 'Heart rate sensor', origin: 'bluetooth' }
      : null;
  const treadmill: DisplayedHeartRate | null =
    treadmillBpm != null ? { bpm: treadmillBpm, label: 'Treadmill', origin: 'treadmill' } : null;
  const simulator: DisplayedHeartRate | null =
    input.simulator && simulatorBpm != null
      ? { bpm: simulatorBpm, label: input.simulator.label || 'Simulator', origin: 'simulator' }
      : null;

  if (input.preference === 'external') return external;
  if (input.preference === 'treadmill') return treadmill;
  if (input.preference === 'simulator') return simulator;
  return external ?? treadmill ?? simulator;
}
