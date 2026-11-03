import type { Route } from '../routes/routeTypes';
import { elevationGainMeters, inclineAtDistance } from '../routes/elevation';
import type { TreadmillTransport } from '../treadmill/TreadmillTransport';
import { ControlUnsupportedError } from '../treadmill/TreadmillTransport';
import type { ConnectionState, TreadmillData } from '../treadmill/types';
import { caloriesPerSecond } from '../utils/calories';
import { averageSpeedKmh, integrateDistanceMeters } from '../utils/distance';
import { createId, formatDuration } from '../utils/format';
import { getWalkingWorkout, segmentAt, type WalkingWorkout } from './walkingWorkouts';
import { approach, clamp } from '../utils/math';
import type { HrPreference } from '../heartRate/HeartRateSource';
import { selectDisplayedHeartRate } from '../heartRate/selectHeartRate';
import { isWorkoutActive, transition, type WorkoutPhase } from './WorkoutStateMachine';
import type { WorkoutRecord, WorkoutSnapshot } from './types';

export type WorkoutSettings = {
  autoIncline: boolean;
  maxIncline: number;
  weightKg: number;
};

export type WorkoutActionResult = {
  ok: boolean;
  error?: string;
  record?: WorkoutRecord | null;
};

type EngineOptions = {
  getRoute: (id: string) => Route | undefined;
  settings: () => WorkoutSettings;
};

const MAX_SAMPLE_GAP_SECONDS = 5;
const INCLINE_COMMAND_INTERVAL_MS = 2000;
const INCLINE_COMMAND_STEP = 2;

export class WorkoutEngine {
  private phase: WorkoutPhase = 'idle';
  private routeId: string | null = null;
  private transport: TreadmillTransport | null = null;
  private unsubData: (() => void) | null = null;
  private unsubConn: (() => void) | null = null;
  private activeSeconds = 0;
  private distanceMeters = 0;
  private maxSpeedKmh = 0;
  private caloriesKcal = 0;
  private hrSum = 0;
  private hrTime = 0;
  private elevation = 0;
  private lastTs: number | null = null;
  private liveSpeedKmh = 0;
  private liveInclinePercent = 0;
  private treadmillBpm: number | null = null;
  private externalSample: { bpm: number; label: string } | null = null;
  private simulatorSample: { bpm: number } | null = null;
  private hrPreference: HrPreference = 'auto';
  private liveHeartRateBpm: number | null = null;
  private liveHeartRateLabel: string | null = null;
  private maxHeartRateBpm = 0;
  private heartRateNotice: string | null = null;
  private heartRateSourceLabel: string | null = null;
  private liveCadenceSpm: number | null = null;
  private program: WalkingWorkout | null = null;
  private programIndex = -1;
  private programCue: string | null = null;
  private banner: string | null = null;
  private autoInclineNote: string | null = null;
  private autoInclineBlocked = false;
  private commandedIncline = 0;
  private lastSentIncline = Number.NaN;
  private lastInclineSentAt = 0;
  private listeners = new Set<(snapshot: WorkoutSnapshot) => void>();

  constructor(private readonly options: EngineOptions) {}

  use(transport: TreadmillTransport) {
    this.unsubData?.();
    this.unsubConn?.();
    this.transport = transport;
    this.unsubData = transport.subscribe((data) => this.ingest(data));
    this.unsubConn = transport.subscribeConnection((state) => this.onConnection(state));
    this.onConnection(transport.getConnectionState());
  }

  subscribe(listener: (snapshot: WorkoutSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): WorkoutSnapshot {
    return {
      phase: this.phase,
      routeId: this.routeId,
      activeSeconds: this.activeSeconds,
      distanceMeters: this.distanceMeters,
      averageSpeedKmh: averageSpeedKmh(this.distanceMeters, this.activeSeconds),
      maxSpeedKmh: this.maxSpeedKmh,
      averageHeartRateBpm: this.hrTime > 0 ? this.hrSum / this.hrTime : null,
      caloriesKcal: this.caloriesKcal,
      elevationGainMeters: this.elevation,
      liveSpeedKmh: this.liveSpeedKmh,
      liveInclinePercent: this.liveInclinePercent,
      liveHeartRateBpm: this.liveHeartRateBpm,
      liveHeartRateLabel: this.liveHeartRateLabel,
      maxHeartRateBpm: this.maxHeartRateBpm > 0 ? this.maxHeartRateBpm : null,
      heartRateNotice: this.heartRateNotice,
      liveCadenceSpm: this.liveCadenceSpm,
      banner: this.banner,
      autoInclineNote: this.autoInclineNote,
      programName: this.program && this.program.id !== 'free' ? this.program.name : null,
      programCue: this.programCue,
    };
  }

  selectRoute(routeId: string): WorkoutActionResult {
    if (isWorkoutActive(this.phase)) {
      return { ok: false, error: 'A run is already in progress.' };
    }
    if (!this.options.getRoute(routeId)) return { ok: false, error: 'Unknown route.' };
    if (this.phase === 'finished') {
      this.clearStats();
      this.phase = 'idle';
    }
    this.routeId = routeId;
    this.applyContext();
    this.emit();
    return { ok: true };
  }

  selectProgram(programId: string | null): WorkoutActionResult {
    if (isWorkoutActive(this.phase)) {
      return { ok: false, error: 'Choose the walk plan before the run starts.' };
    }
    const program = getWalkingWorkout(programId);
    this.program = program.segments.length > 0 ? program : null;
    this.programIndex = -1;
    this.programCue = this.program ? this.program.name : null;
    this.emit();
    return { ok: true };
  }

  async start(): Promise<WorkoutActionResult> {
    const next = transition(this.phase, { type: 'START' });
    if (next.error) return { ok: false, error: next.error };
    this.phase = next.phase;
    this.banner = null;
    this.lastTs = null;
    this.autoInclineBlocked = false;
    try {
      await this.transport?.start();
    } catch (error) {
      if (this.transport?.getConnectionState() !== 'connected') {
        this.phase = 'ready';
        this.emit();
        return { ok: false, error: error instanceof Error ? error.message : 'Could not start the belt.' };
      }
    }
    this.applyProgramSegment(true);
    this.emit();
    return { ok: true };
  }

  async pause(): Promise<WorkoutActionResult> {
    const next = transition(this.phase, { type: 'PAUSE' });
    if (next.error) return { ok: false, error: next.error };
    this.phase = next.phase;
    this.lastTs = null;
    await this.pauseBelt();
    this.emit();
    return { ok: true };
  }

  async resume(): Promise<WorkoutActionResult> {
    const next = transition(this.phase, { type: 'RESUME' });
    if (next.error) return { ok: false, error: next.error };
    this.phase = next.phase;
    this.banner = null;
    this.lastTs = null;
    try {
      await this.transport?.start();
    } catch (error) {
      this.phase = 'paused';
      this.emit();
      return { ok: false, error: error instanceof Error ? error.message : 'Could not resume the belt.' };
    }
    this.emit();
    return { ok: true };
  }

  async stop(): Promise<WorkoutActionResult> {
    const next = transition(this.phase, { type: 'STOP' });
    if (next.error) return { ok: false, error: next.error, record: null };
    const record = this.toRecord();
    this.phase = next.phase;
    this.banner = null;
    this.lastTs = null;
    try {
      await this.transport?.stop();
    } catch {
      // The run is already finished in the app. The belt command is best-effort.
    }
    this.emit();
    return { ok: true, record };
  }

  setHeartRatePreference(preference: HrPreference) {
    this.hrPreference = preference;
    this.refreshDisplayedHeartRate();
    this.emit();
  }

  /** External BLE (or any future non-treadmill sensor). Null clears it so the next source can show. */
  setExternalHeartRate(sample: { bpm: number; label: string } | null) {
    this.externalSample = sample && sample.bpm > 0 ? sample : null;
    this.refreshDisplayedHeartRate();
    this.emit();
  }

  setSimulatorHeartRate(sample: { bpm: number } | null) {
    this.simulatorSample = sample && sample.bpm > 0 ? sample : null;
    this.refreshDisplayedHeartRate();
    this.emit();
  }

  /** Shown beside the run. Does not change the workout phase. */
  setHeartRateNotice(notice: string | null) {
    if (this.heartRateNotice === notice) return;
    this.heartRateNotice = notice;
    this.emit();
  }

  reset(): WorkoutActionResult {
    const next = transition(this.phase, { type: 'RESET' });
    if (next.error) return { ok: false, error: next.error };
    this.clearStats();
    this.phase = next.phase;
    this.applyContext();
    this.emit();
    return { ok: true };
  }

  private applyContext() {
    if (isWorkoutActive(this.phase) || this.phase === 'finished') return;
    const next = transition(this.phase, {
      type: 'CONTEXT',
      connected: this.isConnected(),
      hasRoute: Boolean(this.routeId),
    });
    this.phase = next.phase;
  }

  private onConnection(state: ConnectionState) {
    if (state === 'disconnected' || state === 'error' || state === 'unsupported') {
      const next = transition(this.phase, { type: 'CONNECTION_LOST' });
      if (next.phase === 'connectionLost' && this.phase !== 'connectionLost') {
        this.banner = 'Treadmill connection lost';
        this.lastTs = null;
      }
      this.phase = next.phase;
    } else if (state === 'connected') {
      const restored = transition(this.phase, { type: 'CONNECTION_RESTORED' });
      this.phase = restored.phase;
      if (this.phase === 'paused') this.banner = null;
      this.applyContext();
    }
    this.emit();
  }

  private ingest(data: TreadmillData) {
    this.liveSpeedKmh = data.speedKmh;
    this.liveInclinePercent = data.inclinePercent ?? this.liveInclinePercent;
    this.treadmillBpm = data.heartRateBpm != null && data.heartRateBpm > 0 ? data.heartRateBpm : null;
    this.liveCadenceSpm = data.cadenceSpm ?? null;

    if (this.phase === 'running' && this.lastTs != null) {
      const dt = (data.timestamp - this.lastTs) / 1000;
      if (dt > 0 && dt <= MAX_SAMPLE_GAP_SECONDS) {
        this.activeSeconds += dt;
        this.distanceMeters += integrateDistanceMeters(data.speedKmh, dt);
        this.maxSpeedKmh = Math.max(this.maxSpeedKmh, data.speedKmh);
        this.refreshDisplayedHeartRate(dt);
        this.caloriesKcal +=
          caloriesPerSecond(data.speedKmh, this.liveInclinePercent, this.options.settings().weightKg) * dt;
        const route = this.currentRoute();
        if (route && !this.program) {
          this.elevation = elevationGainMeters(route.elevationProfile, this.distanceMeters);
          this.maybeAutoIncline(route, data.timestamp);
        } else if (route) {
          this.elevation = elevationGainMeters(route.elevationProfile, this.distanceMeters);
        }
        this.applyProgramSegment(false);
      } else {
        this.refreshDisplayedHeartRate();
      }
    } else {
      this.refreshDisplayedHeartRate();
    }
    if (this.phase === 'running') this.lastTs = data.timestamp;
    else this.lastTs = null;
    this.emit();
  }

  private maybeAutoIncline(route: Route, timestamp: number) {
    if (this.program) return;
    const settings = this.options.settings();
    if (!settings.autoIncline || this.autoInclineBlocked) return;
    if (timestamp - this.lastInclineSentAt < INCLINE_COMMAND_INTERVAL_MS) return;
    const desired = clamp(inclineAtDistance(route.elevationProfile, this.distanceMeters), 0, settings.maxIncline);
    const next = approach(this.commandedIncline, desired, INCLINE_COMMAND_STEP);
    if (Number.isFinite(this.lastSentIncline) && Math.abs(next - this.lastSentIncline) < 0.3) return;
    const transport = this.transport;
    if (!transport?.setTargetIncline) {
      this.autoInclineBlocked = true;
      this.autoInclineNote = 'Control unsupported';
      return;
    }
    this.commandedIncline = next;
    this.lastSentIncline = next;
    this.lastInclineSentAt = timestamp;
    void transport.setTargetIncline(next).catch((error: unknown) => {
      if (error instanceof ControlUnsupportedError) {
        this.autoInclineBlocked = true;
        this.autoInclineNote = 'Control unsupported';
        this.emit();
      }
    });
  }

  private async pauseBelt() {
    const transport = this.transport as (TreadmillTransport & { pause?: () => Promise<void> }) | null;
    try {
      if (transport?.pause) await transport.pause();
      else await transport?.stop();
    } catch {
      // Pausing the timer still stands if the belt refuses the command.
    }
  }

  private toRecord(): WorkoutRecord | null {
    const route = this.currentRoute();
    if (!route) return null;
    return {
      id: createId(),
      date: new Date().toISOString(),
      routeId: route.id,
      routeName: route.name,
      durationSeconds: this.activeSeconds,
      distanceMeters: this.distanceMeters,
      averageSpeedKmh: averageSpeedKmh(this.distanceMeters, this.activeSeconds),
      maxSpeedKmh: this.maxSpeedKmh,
      averageHeartRateBpm: this.hrTime > 0 ? this.hrSum / this.hrTime : null,
      maxHeartRateBpm: this.maxHeartRateBpm > 0 ? this.maxHeartRateBpm : null,
      heartRateSource: this.heartRateSourceLabel,
      caloriesKcal: this.caloriesKcal,
      elevationGainMeters: this.elevation,
    };
  }

  private currentRoute(): Route | undefined {
    return this.routeId ? this.options.getRoute(this.routeId) : undefined;
  }

  private isConnected(): boolean {
    return this.transport?.getConnectionState() === 'connected';
  }

  private clearStats() {
    this.activeSeconds = 0;
    this.distanceMeters = 0;
    this.maxSpeedKmh = 0;
    this.caloriesKcal = 0;
    this.hrSum = 0;
    this.hrTime = 0;
    this.maxHeartRateBpm = 0;
    this.heartRateSourceLabel = null;
    this.elevation = 0;
    this.lastTs = null;
    this.banner = null;
    this.autoInclineNote = null;
    this.autoInclineBlocked = false;
    this.commandedIncline = 0;
    this.lastSentIncline = Number.NaN;
    this.lastInclineSentAt = 0;
  }

  private refreshDisplayedHeartRate(dt = 0) {
    const chosen = selectDisplayedHeartRate({
      preference: this.hrPreference,
      external: this.externalSample,
      treadmillBpm: this.treadmillBpm,
      simulator: this.simulatorSample ? { bpm: this.simulatorSample.bpm, label: 'Simulator' } : null,
    });
    this.liveHeartRateBpm = chosen?.bpm ?? null;
    this.liveHeartRateLabel = chosen?.label ?? null;
    if (chosen) this.heartRateSourceLabel = chosen.label;
    if (dt > 0 && this.phase === 'running' && chosen) {
      this.hrSum += chosen.bpm * dt;
      this.hrTime += dt;
      this.maxHeartRateBpm = Math.max(this.maxHeartRateBpm, chosen.bpm);
    }
  }

  private applyProgramSegment(force: boolean) {
    if (!this.program || this.phase !== 'running') return;
    const place = segmentAt(this.program.segments, this.activeSeconds);
    if (!place) {
      this.programCue = `${this.program.name} complete`;
      return;
    }
    if (!force && place.index === this.programIndex) return;
    this.programIndex = place.index;
    this.programCue = `${this.program.name} · ${place.segment.speedKmh.toFixed(1)} km/h · ${place.segment.inclinePercent}% · ${formatDuration(place.remainingSeconds)} left`;
    const transport = this.transport;
    if (!transport?.setTargetSpeed && !transport?.setTargetIncline) {
      this.autoInclineNote = 'Control unsupported';
      return;
    }
    void transport.setTargetSpeed?.(place.segment.speedKmh).catch(() => {
      this.autoInclineNote = 'Control unsupported';
      this.emit();
    });
    void transport.setTargetIncline?.(place.segment.inclinePercent).catch((error: unknown) => {
      if (error instanceof ControlUnsupportedError) {
        this.autoInclineNote = 'Control unsupported';
        this.emit();
      }
    });
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
