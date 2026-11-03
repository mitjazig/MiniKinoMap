import { describe, expect, it } from 'vitest';
import { selectDisplayedHeartRate } from '../heartRate/selectHeartRate';

describe('heart rate priority', () => {
  it('prefers an external sensor over the treadmill', () => {
    const chosen = selectDisplayedHeartRate({
      preference: 'auto',
      external: { bpm: 145, label: 'Garmin' },
      treadmillBpm: 130,
      simulator: { bpm: 120, label: 'Simulator' },
    });
    expect(chosen).toEqual({ bpm: 145, label: 'Garmin', origin: 'bluetooth' });
  });

  it('falls back to the treadmill when the external sensor disappears', () => {
    const chosen = selectDisplayedHeartRate({
      preference: 'auto',
      external: null,
      treadmillBpm: 130,
      simulator: { bpm: 120, label: 'Simulator' },
    });
    expect(chosen).toEqual({ bpm: 130, label: 'Treadmill', origin: 'treadmill' });
  });

  it('uses only the source named by an explicit preference', () => {
    expect(
      selectDisplayedHeartRate({
        preference: 'simulator',
        external: { bpm: 145, label: 'Garmin' },
        treadmillBpm: 130,
        simulator: { bpm: 120, label: 'Simulator' },
      })?.bpm,
    ).toBe(120);
    expect(
      selectDisplayedHeartRate({
        preference: 'treadmill',
        external: { bpm: 145, label: 'Garmin' },
        treadmillBpm: 130,
        simulator: null,
      })?.origin,
    ).toBe('treadmill');
  });

  it('does not treat 0 bpm as a reading', () => {
    expect(
      selectDisplayedHeartRate({
        preference: 'auto',
        external: { bpm: 0, label: 'Garmin' },
        treadmillBpm: 0,
        simulator: null,
      }),
    ).toBeNull();
  });
});
