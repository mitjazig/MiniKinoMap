import { describe, expect, it } from 'vitest';
import { SimulatorTransport } from '../treadmill/simulator/SimulatorTransport';

describe('SimulatorTransport', () => {
  it('integrates about 1 km at 10 km/h for 360 seconds', async () => {
    const sim = new SimulatorTransport({ noise: 0, manualClock: true });
    await sim.connect();
    await sim.setTargetSpeed(10);
    await sim.start();
    sim.advance(20_000);
    const before = sim.getSnapshot();
    expect(before.speedKmh).toBeCloseTo(10, 2);
    sim.advance(360_000);
    const after = sim.getSnapshot();
    expect(after.elapsedSeconds - before.elapsedSeconds).toBeCloseTo(360, 2);
    expect(after.distanceMeters - before.distanceMeters).toBeCloseTo(1000, 1);
    await sim.disconnect();
  });

  it('does not advance time while the belt is stopped', async () => {
    const sim = new SimulatorTransport({ noise: 0, manualClock: true });
    await sim.connect();
    await sim.setTargetSpeed(8);
    await sim.start();
    sim.advance(15_000);
    const running = sim.getSnapshot().elapsedSeconds;
    await sim.pause();
    sim.advance(10_000);
    expect(sim.getSnapshot().elapsedSeconds).toBeCloseTo(running, 2);
    expect(sim.getConnectionState()).toBe('connected');
  });

  it('simulates a disconnect without throwing', async () => {
    const sim = new SimulatorTransport({ noise: 0, manualClock: true });
    const states: string[] = [];
    sim.subscribeConnection((state) => states.push(state));
    await sim.connect();
    await sim.start();
    sim.advance(5_000);
    const distance = sim.getSnapshot().distanceMeters;
    await sim.simulateDisconnect();
    sim.advance(5_000);
    expect(sim.getConnectionState()).toBe('disconnected');
    expect(sim.getSnapshot().distanceMeters).toBeCloseTo(distance, 3);
    expect(states).toContain('disconnected');
  });
});
