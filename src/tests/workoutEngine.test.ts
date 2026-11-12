import { describe, expect, it } from 'vitest';
import { ControlRejectedError, type TreadmillTransport } from '../treadmill/TreadmillTransport';
import type { ConnectionState, LogEntry, PacketTrace, TreadmillData } from '../treadmill/types';
import { WorkoutEngine } from '../workout/WorkoutEngine';
import { getRouteById } from '../routes/demoRoutes';

class FakeTransport implements TreadmillTransport {
  private state: ConnectionState = 'disconnected';
  private readonly data = new Set<(sample: TreadmillData) => void>();
  private readonly connections = new Set<(state: ConnectionState) => void>();

  connect(): Promise<void> {
    this.set('connected');
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.set('disconnected');
    return Promise.resolve();
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  pause(): Promise<void> {
    return Promise.resolve();
  }

  setTargetSpeed(): Promise<void> {
    return Promise.resolve();
  }

  setTargetIncline(): Promise<void> {
    return Promise.resolve();
  }

  subscribe(callback: (data: TreadmillData) => void): () => void {
    this.data.add(callback);
    return () => this.data.delete(callback);
  }

  subscribeConnection(callback: (state: ConnectionState) => void): () => void {
    this.connections.add(callback);
    return () => this.connections.delete(callback);
  }

  subscribeLog(_callback: (entry: LogEntry) => void): () => void {
    return () => undefined;
  }

  subscribePacket(_callback: (packet: PacketTrace) => void): () => void {
    return () => undefined;
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  push(sample: TreadmillData) {
    for (const listener of this.data) listener(sample);
  }

  set(state: ConnectionState) {
    this.state = state;
    for (const listener of this.connections) listener(state);
  }
}

function engine() {
  return new WorkoutEngine({
    getRoute: getRouteById,
    settings: () => ({ autoIncline: false, maxIncline: 12, weightKg: 75 }),
  });
}

describe('WorkoutEngine', () => {
  it('integrates 10 km/h for 360 seconds to about 1 km of active time', async () => {
    const belt = new FakeTransport();
    const workout = engine();
    workout.use(belt);
    await belt.connect();
    workout.selectRoute('lakeside');
    await workout.start();
    let timestamp = 0;
    belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    for (let step = 0; step < 1440; step += 1) {
      timestamp += 250;
      belt.push({ timestamp, speedKmh: 10, distanceMeters: 999999, elapsedSeconds: 999999 });
    }
    const snap = workout.getSnapshot();
    expect(snap.distanceMeters).toBeCloseTo(1000, 1);
    expect(snap.activeSeconds).toBeCloseTo(360, 1);
    expect(snap.averageSpeedKmh).toBeCloseTo(10, 1);
  });

  it('does not count paused time', async () => {
    const belt = new FakeTransport();
    const workout = engine();
    workout.use(belt);
    await belt.connect();
    workout.selectRoute('lakeside');
    await workout.start();
    let timestamp = 0;
    belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    for (let step = 0; step < 40; step += 1) {
      timestamp += 250;
      belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    }
    await workout.pause();
    for (let step = 0; step < 40; step += 1) {
      timestamp += 250;
      belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    }
    const paused = workout.getSnapshot();
    expect(paused.phase).toBe('paused');
    expect(paused.activeSeconds).toBeCloseTo(10, 1);
    await workout.resume();
    belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    for (let step = 0; step < 40; step += 1) {
      timestamp += 250;
      belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    }
    const resumed = workout.getSnapshot();
    expect(resumed.activeSeconds).toBeCloseTo(20, 1);
    expect(resumed.distanceMeters).toBeCloseTo((10 / 3.6) * 20, 1);
  });

  it('starts the workout when the belt is already moving', async () => {
    const belt = new FakeTransport();
    const workout = engine();
    workout.use(belt);
    await belt.connect();
    workout.selectRoute('lakeside');
    expect(workout.getSnapshot().phase).toBe('ready');
    belt.push({ timestamp: 0, speedKmh: 4, distanceMeters: 0, elapsedSeconds: 0 });
    expect(workout.getSnapshot().phase).toBe('running');
  });

  it('stays ready when the treadmill rejects Start', async () => {
    const belt = new FakeTransport();
    belt.start = () => Promise.reject(new Error('The treadmill did not confirm Start.'));
    const workout = engine();
    workout.use(belt);
    await belt.connect();
    workout.selectRoute('lakeside');
    const result = await workout.start();
    expect(result.ok).toBe(false);
    expect(workout.getSnapshot().phase).toBe('ready');
  });

  it('keeps sending auto incline after the treadmill refuses one command', async () => {
    const belt = new FakeTransport();
    const sent: number[] = [];
    belt.setTargetIncline = (percent?: number) => {
      sent.push(percent ?? Number.NaN);
      return sent.length === 1 ? Promise.reject(new ControlRejectedError('refused')) : Promise.resolve();
    };
    const workout = new WorkoutEngine({
      getRoute: getRouteById,
      settings: () => ({ autoIncline: true, maxIncline: 12, weightKg: 75 }),
    });
    workout.use(belt);
    await belt.connect();
    workout.selectRoute('pine');
    await workout.start();
    for (let timestamp = 0; timestamp <= 600_000; timestamp += 500) {
      belt.push({ timestamp, speedKmh: 6, distanceMeters: 0, elapsedSeconds: 0 });
      await Promise.resolve();
    }
    expect(sent.length).toBeGreaterThan(1);
    expect(workout.getSnapshot().autoInclineNote).toBeNull();
  });

  it('keeps progress when the connection drops and stays paused after reconnect', async () => {
    const belt = new FakeTransport();
    const workout = engine();
    workout.use(belt);
    await belt.connect();
    workout.selectRoute('pine');
    await workout.start();
    let timestamp = 0;
    belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    timestamp += 1000;
    belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    const kept = workout.getSnapshot().distanceMeters;
    belt.set('disconnected');
    timestamp += 5000;
    belt.push({ timestamp, speedKmh: 10, distanceMeters: 0, elapsedSeconds: 0 });
    const lost = workout.getSnapshot();
    expect(lost.phase).toBe('connectionLost');
    expect(lost.banner).toBe('Treadmill connection lost');
    expect(lost.distanceMeters).toBeCloseTo(kept, 3);
    belt.set('connected');
    expect(workout.getSnapshot().phase).toBe('paused');
    const blocked = await workout.pause();
    expect(blocked.ok).toBe(false);
  });
});
