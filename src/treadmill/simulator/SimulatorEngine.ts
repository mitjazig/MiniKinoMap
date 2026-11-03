import { SIMULATOR_MAX_INCLINE_PERCENT, SIMULATOR_MAX_SPEED_KMH } from '../../config';
import { caloriesPerSecond } from '../../utils/calories';
import { approach, clamp } from '../../utils/math';
import { integrateDistanceMeters } from '../../utils/distance';
import {
  prescribedIncline,
  prescribedSpeed,
  scenarioOwnsIncline,
  type FaultMode,
  type ScenarioId,
} from './scenarios';

const ACCEL_KMH_PER_S = 0.8;
const DECEL_KMH_PER_S = 1.15;
const INCLINE_PERCENT_PER_S = 1.6;
const HR_TAU_SECONDS = 8;

export type SimulatorSnapshot = {
  connected: boolean;
  running: boolean;
  speedKmh: number;
  targetSpeedKmh: number;
  inclinePercent: number;
  targetInclinePercent: number;
  heartRateBpm: number;
  heartRateMode: 'auto' | 'manual';
  manualHeartRateBpm: number;
  cadenceSpm: number;
  distanceMeters: number;
  elapsedSeconds: number;
  caloriesKcal: number;
  scenario: ScenarioId;
  scenarioElapsedSeconds: number;
  timeScale: 1 | 2 | 5;
  packetCorruption: FaultMode;
  sensorDropout: FaultMode;
  scenarioOwnsIncline: boolean;
  scenarioOwnsSpeed: boolean;
  dropoutCount: number;
  corruptCount: number;
};

export type SimulatorEngineOptions = {
  noise?: number;
  now?: () => number;
};

export class SimulatorEngine {
  private connected = false;
  private running = false;
  private targetSpeedKmh = 0;
  private speedKmh = 0;
  private targetInclinePercent = 0;
  private inclinePercent = 0;
  private heartRateBpm = 72;
  private heartRateMode: 'auto' | 'manual' = 'auto';
  private manualHeartRateBpm = 120;
  private cadenceSpm = 0;
  private distanceMeters = 0;
  private elapsedSeconds = 0;
  private caloriesKcal = 0;
  private scenario: ScenarioId = 'manual';
  private scenarioElapsedSeconds = 0;
  private timeScale: 1 | 2 | 5 = 1;
  private packetCorruption: FaultMode = 'off';
  private sensorDropout: FaultMode = 'off';
  private dropoutCount = 0;
  private corruptCount = 0;
  private simNow = 0;
  private randomSpeed = 7;
  private randomIncline = 1;
  private nextRandomAt = 40;
  private readonly noise: number;
  private readonly now: () => number;

  constructor(options: SimulatorEngineOptions = {}) {
    this.noise = options.noise ?? 0.035;
    this.now = options.now ?? (() => Date.now());
    this.simNow = this.now();
  }

  connect() {
    this.connected = true;
    this.simNow = this.now();
  }

  disconnect() {
    this.connected = false;
    this.running = false;
  }

  start() {
    if (!this.connected) return;
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  reset() {
    this.running = false;
    this.targetSpeedKmh = 0;
    this.speedKmh = 0;
    this.targetInclinePercent = 0;
    this.inclinePercent = 0;
    this.heartRateBpm = 72;
    this.cadenceSpm = 0;
    this.distanceMeters = 0;
    this.elapsedSeconds = 0;
    this.caloriesKcal = 0;
    this.scenarioElapsedSeconds = 0;
    this.dropoutCount = 0;
    this.corruptCount = 0;
    this.nextRandomAt = 40;
    this.simNow = this.now();
  }

  setTargetSpeed(kmh: number) {
    this.scenario = 'manual';
    this.targetSpeedKmh = clamp(kmh, 0, SIMULATOR_MAX_SPEED_KMH);
  }

  setTargetIncline(percent: number): boolean {
    if (scenarioOwnsIncline(this.scenario)) return false;
    this.targetInclinePercent = clamp(percent, 0, SIMULATOR_MAX_INCLINE_PERCENT);
    return true;
  }

  setScenario(id: ScenarioId) {
    this.scenario = id;
    this.scenarioElapsedSeconds = 0;
    this.nextRandomAt = 40;
    this.applyScenario(0);
  }

  setTimeScale(scale: 1 | 2 | 5) {
    this.timeScale = scale;
  }

  setHeartRateMode(mode: 'auto' | 'manual') {
    this.heartRateMode = mode;
  }

  setManualHeartRate(bpm: number) {
    this.heartRateMode = 'manual';
    this.manualHeartRateBpm = clamp(Math.round(bpm), 60, 200);
  }

  setPacketCorruption(mode: FaultMode) {
    this.packetCorruption = mode;
  }

  setSensorDropout(mode: FaultMode) {
    this.sensorDropout = mode;
  }

  markCorrupt() {
    this.corruptCount += 1;
  }

  markDropout() {
    this.dropoutCount += 1;
  }

  /** Advance physics by simulated seconds (already scaled). */
  step(simulatedSeconds: number) {
    if (!this.connected || simulatedSeconds <= 0) return;
    this.simNow += simulatedSeconds * 1000;
    if (this.running) {
      this.scenarioElapsedSeconds += simulatedSeconds;
      this.elapsedSeconds += simulatedSeconds;
      this.applyScenario(simulatedSeconds);
    }

    const speedTarget = this.running ? this.targetSpeedKmh : 0;
    const rate = speedTarget >= this.speedKmh ? ACCEL_KMH_PER_S : DECEL_KMH_PER_S;
    this.speedKmh = approach(this.speedKmh, speedTarget, rate * simulatedSeconds);
    if (this.speedKmh < 0.02) this.speedKmh = 0;

    this.inclinePercent = approach(
      this.inclinePercent,
      this.targetInclinePercent,
      INCLINE_PERCENT_PER_S * simulatedSeconds,
    );

    if (this.running && this.speedKmh > 0) {
      this.distanceMeters += integrateDistanceMeters(this.speedKmh, simulatedSeconds);
      this.caloriesKcal += caloriesPerSecond(this.speedKmh, this.inclinePercent, 75) * simulatedSeconds;
    }

    this.updateHeart(simulatedSeconds);
    this.updateCadence();
  }

  timestamp(): number {
    return this.simNow;
  }

  reportedSpeed(): number {
    if (this.noise <= 0 || this.speedKmh <= 0) return this.speedKmh;
    const ripple = Math.sin(this.elapsedSeconds * 3.1) * this.noise;
    return clamp(this.speedKmh + ripple, 0, SIMULATOR_MAX_SPEED_KMH);
  }

  reportedHeartRate(): number {
    const ripple = this.noise > 0 ? Math.sin(this.elapsedSeconds * 2.2) * 1.4 : 0;
    return Math.round(clamp(this.heartRateBpm + ripple, 50, 210));
  }

  snapshot(): SimulatorSnapshot {
    return {
      connected: this.connected,
      running: this.running,
      speedKmh: this.speedKmh,
      targetSpeedKmh: this.targetSpeedKmh,
      inclinePercent: this.inclinePercent,
      targetInclinePercent: this.targetInclinePercent,
      heartRateBpm: this.heartRateBpm,
      heartRateMode: this.heartRateMode,
      manualHeartRateBpm: this.manualHeartRateBpm,
      cadenceSpm: this.cadenceSpm,
      distanceMeters: this.distanceMeters,
      elapsedSeconds: this.elapsedSeconds,
      caloriesKcal: this.caloriesKcal,
      scenario: this.scenario,
      scenarioElapsedSeconds: this.scenarioElapsedSeconds,
      timeScale: this.timeScale,
      packetCorruption: this.packetCorruption,
      sensorDropout: this.sensorDropout,
      scenarioOwnsIncline: scenarioOwnsIncline(this.scenario),
      scenarioOwnsSpeed: this.scenario === 'easy' || this.scenario === 'intervals' || this.scenario === 'random',
      dropoutCount: this.dropoutCount,
      corruptCount: this.corruptCount,
    };
  }

  private applyScenario(dt: number) {
    void dt;
    if (this.scenario === 'random' && this.scenarioElapsedSeconds >= this.nextRandomAt) {
      this.randomSpeed = 5 + Math.random() * 8;
      this.randomIncline = Math.random() * 8;
      this.nextRandomAt = this.scenarioElapsedSeconds + 35 + Math.random() * 20;
    }
    const speed = this.scenario === 'random' ? this.randomSpeed : prescribedSpeed(this.scenario, this.scenarioElapsedSeconds);
    if (speed != null) this.targetSpeedKmh = clamp(speed, 0, SIMULATOR_MAX_SPEED_KMH);
    const incline =
      this.scenario === 'random' ? this.randomIncline : prescribedIncline(this.scenario, this.scenarioElapsedSeconds);
    if (incline != null) {
      this.targetInclinePercent = clamp(incline, 0, SIMULATOR_MAX_INCLINE_PERCENT);
    }
  }

  private updateHeart(dt: number) {
    const intensity = clamp(this.speedKmh / 14 + this.inclinePercent / 28, 0, 1.35);
    const auto = clamp(68 + intensity * 100, 60, 188);
    const target = this.heartRateMode === 'manual' ? this.manualHeartRateBpm : auto;
    const blend = 1 - Math.exp(-dt / HR_TAU_SECONDS);
    this.heartRateBpm += (target - this.heartRateBpm) * blend;
  }

  private updateCadence() {
    if (this.speedKmh < 0.4) {
      this.cadenceSpm = 0;
      return;
    }
    this.cadenceSpm = Math.round(clamp(145 + this.speedKmh * 2.4, 80, 200));
  }
}
