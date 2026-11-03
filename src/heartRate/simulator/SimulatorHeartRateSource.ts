import { clamp } from '../../utils/math';
import type { ConnectionState } from '../../treadmill/types';
import type { HeartRateData, HeartRateSource, HeartRateSourceInfo } from '../HeartRateSource';

export const HR_PRESETS = [
  { id: 'rest', label: 'Rest', bpm: 65 },
  { id: 'warmup', label: 'Warmup', bpm: 100 },
  { id: 'aerobic', label: 'Aerobic', bpm: 135 },
  { id: 'threshold', label: 'Threshold', bpm: 165 },
  { id: 'max', label: 'Max', bpm: 185 },
] as const;

export type HrPresetId = (typeof HR_PRESETS)[number]['id'];

type EffortSample = {
  speedKmh: number;
  inclinePercent: number;
  elapsedSeconds: number;
};

type Options = {
  noise?: number;
  manualClock?: boolean;
  sample?: () => EffortSample;
};

const TAU_MS = 6000;
const STEP_MS = 250;

/**
 * A heart-rate source with no hardware.
 * Manual mode approaches a chosen bpm. Auto mode follows belt speed, incline, and workout time.
 */
export class SimulatorHeartRateSource implements HeartRateSource {
  private state: ConnectionState = 'disconnected';
  private mode: 'manual' | 'auto' = 'manual';
  private target = 72;
  private current = 72;
  private timer: ReturnType<typeof setInterval> | null = null;
  private dataListeners = new Set<(data: HeartRateData) => void>();
  private connectionListeners = new Set<(state: ConnectionState) => void>();

  constructor(private readonly options: Options = {}) {}

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connected');
    if (!this.options.manualClock) {
      this.timer = setInterval(() => this.tick(STEP_MS), STEP_MS);
    }
    this.publish();
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setState('disconnected');
  }

  subscribe(callback: (data: HeartRateData) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }

  subscribeConnection(callback: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.state);
    return () => this.connectionListeners.delete(callback);
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getSourceInfo(): HeartRateSourceInfo {
    return { id: 'hr-simulator', name: 'Heart rate simulator', type: 'simulator' };
  }

  getMode(): 'manual' | 'auto' {
    return this.mode;
  }

  getTarget(): number {
    return this.target;
  }

  getBpm(): number {
    return Math.round(this.current);
  }

  setManual(bpm: number) {
    this.mode = 'manual';
    this.target = clamp(Math.round(bpm), 40, 220);
  }

  setPreset(id: HrPresetId) {
    const preset = HR_PRESETS.find((item) => item.id === id);
    if (preset) this.setManual(preset.bpm);
  }

  setAuto() {
    this.mode = 'auto';
  }

  /** Test clock. Advances the same approach used by the live timer. */
  advance(ms: number) {
    const steps = Math.max(1, Math.round(ms / STEP_MS));
    const step = ms / steps;
    for (let index = 0; index < steps; index += 1) this.tick(step);
  }

  private tick(dtMs: number) {
    if (this.state !== 'connected') return;
    if (this.mode === 'auto') {
      const sample = this.options.sample?.() ?? { speedKmh: 0, inclinePercent: 0, elapsedSeconds: 0 };
      const base = 70 + Math.min(20, Math.max(0, sample.elapsedSeconds) / 120);
      const speedLoad = Math.max(0, sample.speedKmh) * 7.2;
      const inclineLoad = Math.max(0, sample.inclinePercent) * 2.4;
      this.target = clamp(base + speedLoad + inclineLoad, 40, 220);
    }
    const blend = 1 - Math.exp(-dtMs / TAU_MS);
    this.current += (this.target - this.current) * blend;
    const noise = this.options.noise ?? 0.35;
    if (noise > 0) this.current += (Math.random() - 0.5) * noise;
    this.current = clamp(this.current, 40, 220);
    this.publish();
  }

  private publish() {
    const data: HeartRateData = {
      timestamp: Date.now(),
      bpm: Math.round(this.current),
      source: 'simulator',
    };
    for (const listener of this.dataListeners) listener(data);
  }

  private setState(state: ConnectionState) {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state);
  }
}
