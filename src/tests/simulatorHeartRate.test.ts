import { describe, expect, it } from 'vitest';
import { SimulatorHeartRateSource } from '../heartRate/simulator/SimulatorHeartRateSource';

describe('SimulatorHeartRateSource', () => {
  it('approaches a manual target instead of jumping', async () => {
    const source = new SimulatorHeartRateSource({ noise: 0, manualClock: true });
    await source.connect();
    source.setManual(135);
    source.advance(1000);
    const early = source.getBpm();
    expect(early).toBeGreaterThan(72);
    expect(early).toBeLessThan(135);
    source.advance(20_000);
    expect(source.getBpm()).toBeGreaterThan(125);
    expect(source.getBpm()).toBeLessThanOrEqual(135);
  });

  it('uses the named effort presets', async () => {
    const source = new SimulatorHeartRateSource({ noise: 0, manualClock: true });
    await source.connect();
    source.setPreset('rest');
    expect(source.getTarget()).toBe(65);
    source.setPreset('warmup');
    expect(source.getTarget()).toBe(100);
    source.setPreset('aerobic');
    expect(source.getTarget()).toBe(135);
    source.setPreset('threshold');
    expect(source.getTarget()).toBe(165);
    source.setPreset('max');
    expect(source.getTarget()).toBe(185);
  });

  it('raises auto heart rate with speed and incline', async () => {
    const source = new SimulatorHeartRateSource({
      noise: 0,
      manualClock: true,
      sample: () => ({ speedKmh: 10, inclinePercent: 5, elapsedSeconds: 0 }),
    });
    await source.connect();
    source.setAuto();
    source.advance(60_000);
    expect(source.getTarget()).toBeCloseTo(70 + 72 + 12, 5);
    expect(source.getBpm()).toBeGreaterThan(140);
  });
});
