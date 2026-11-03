import { dataViewToHex } from '../../utils/hex';
import type { TreadmillTransport } from '../TreadmillTransport';
import type { ConnectionState, LogEntry, PacketTrace, TreadmillData } from '../types';
import { FTMS_UUID, uuid16 } from '../bluetooth/ftmsConstants';
import { buildFtmsTreadmillPacket, corruptPacket } from '../bluetooth/ftmsPacketBuilder';
import { ftmsFieldsToRecord, parseFtmsTreadmillData } from '../bluetooth/FtmsTreadmillParser';
import { SimulatorEngine, type SimulatorSnapshot } from './SimulatorEngine';
import type { FaultMode, ScenarioId } from './scenarios';

const TREADMILL_DATA_UUID = uuid16(FTMS_UUID.treadmillData);

export type SimulatorOptions = {
  noise?: number;
  hz?: number;
  /** Tests advance the clock with `advance()` instead of setInterval. */
  manualClock?: boolean;
};

/**
 * Virtual Kettler-style belt for development without hardware.
 * Physics live in SimulatorEngine. Each tick is also encoded as an FTMS
 * Treadmill Data packet and parsed back, so the debug view matches the
 * real Bluetooth path. This is not a Kettler proprietary codec.
 */
export class SimulatorTransport implements TreadmillTransport {
  private readonly engine: SimulatorEngine;
  private readonly hz: number;
  private readonly manualClock: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: ConnectionState = 'disconnected';
  private logId = 1;
  private packetId = 1;
  private readonly dataListeners = new Set<(data: TreadmillData) => void>();
  private readonly connectionListeners = new Set<(state: ConnectionState) => void>();
  private readonly logListeners = new Set<(entry: LogEntry) => void>();
  private readonly packetListeners = new Set<(packet: PacketTrace) => void>();
  private readonly snapshotListeners = new Set<(snapshot: SimulatorSnapshot) => void>();

  constructor(options: SimulatorOptions = {}) {
    this.hz = options.hz ?? 4;
    this.manualClock = options.manualClock ?? false;
    this.engine = new SimulatorEngine({ noise: options.noise ?? 0.035 });
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getSnapshot(): SimulatorSnapshot {
    return this.engine.snapshot();
  }

  subscribe(callback: (data: TreadmillData) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }

  subscribeConnection(callback: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  subscribeLog(callback: (entry: LogEntry) => void): () => void {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  subscribePacket(callback: (packet: PacketTrace) => void): () => void {
    this.packetListeners.add(callback);
    return () => this.packetListeners.delete(callback);
  }

  subscribeSnapshot(callback: (snapshot: SimulatorSnapshot) => void): () => void {
    this.snapshotListeners.add(callback);
    return () => this.snapshotListeners.delete(callback);
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');
    this.log('Simulator connecting');
    this.engine.connect();
    this.startLoop();
    this.setState('connected');
    this.log('Simulator connected');
    this.publishSnapshot();
  }

  async disconnect(): Promise<void> {
    this.stopLoop();
    this.engine.disconnect();
    this.setState('disconnected');
    this.log('Simulator disconnected');
    this.publishSnapshot();
  }

  async simulateDisconnect(): Promise<void> {
    this.log('Simulated disconnect', 'warn');
    await this.disconnect();
  }

  async start(): Promise<void> {
    if (this.state !== 'connected') throw new Error('Simulator is disconnected');
    this.engine.start();
    this.log('Simulator belt started');
    this.publishSnapshot();
  }

  async pause(): Promise<void> {
    this.engine.stop();
    this.log('Simulator paused');
    this.publishSnapshot();
  }

  async stop(): Promise<void> {
    this.engine.stop();
    this.log('Simulator belt stopping');
    this.publishSnapshot();
  }

  async reset(): Promise<void> {
    this.engine.reset();
    this.log('Simulator reset');
    this.publishSnapshot();
  }

  async setTargetSpeed(kmh: number): Promise<void> {
    this.engine.setTargetSpeed(kmh);
    this.publishSnapshot();
  }

  async setTargetIncline(percent: number): Promise<void> {
    const applied = this.engine.setTargetIncline(percent);
    if (!applied) {
      this.log('Incline command ignored — the active scenario controls incline');
    }
    this.publishSnapshot();
  }

  setScenario(id: ScenarioId) {
    this.engine.setScenario(id);
    this.log(`Scenario ${id}`);
    this.publishSnapshot();
  }

  setTimeScale(scale: 1 | 2 | 5) {
    this.engine.setTimeScale(scale);
    this.log(`Simulation speed x${scale}`);
    this.publishSnapshot();
  }

  setManualHeartRate(bpm: number) {
    this.engine.setManualHeartRate(bpm);
    this.publishSnapshot();
  }

  setHeartRateAuto() {
    this.engine.setHeartRateMode('auto');
    this.publishSnapshot();
  }

  setPacketCorruption(mode: FaultMode) {
    this.engine.setPacketCorruption(mode);
    this.log(`Packet corruption ${mode}`);
    this.publishSnapshot();
  }

  setSensorDropout(mode: FaultMode) {
    this.engine.setSensorDropout(mode);
    this.log(`Sensor dropout ${mode}`);
    this.publishSnapshot();
  }

  /**
   * Advance the belt without waiting for the wall clock.
   * `wallMs` is scaled by the current simulation speed inside each tick.
   */
  advance(wallMs: number) {
    const steps = Math.max(0, Math.round(wallMs / (1000 / this.hz)));
    for (let i = 0; i < steps; i += 1) this.tick();
  }

  private startLoop() {
    this.stopLoop();
    if (this.manualClock) return;
    this.timer = setInterval(() => this.tick(), 1000 / this.hz);
  }

  private stopLoop() {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    const snapBefore = this.engine.snapshot();
    if (!snapBefore.connected) return;
    this.engine.step((1 / this.hz) * snapBefore.timeScale);
    const snap = this.engine.snapshot();
    this.publishSnapshot();

    if (snap.sensorDropout === 'occasional' && Math.random() < 0.12) {
      this.engine.markDropout();
      return;
    }

    let packet = buildFtmsTreadmillPacket({
      speedKmh: this.engine.reportedSpeed(),
      distanceMeters: snap.distanceMeters,
      inclinePercent: snap.inclinePercent,
      heartRateBpm: this.engine.reportedHeartRate(),
      elapsedSeconds: snap.elapsedSeconds,
      totalEnergyKcal: snap.caloriesKcal,
      energyPerHourKcal: 0,
      energyPerMinuteKcal: 0,
    });
    let corrupted = false;
    if (snap.packetCorruption === 'occasional' && Math.random() < 0.15) {
      packet = corruptPacket(packet);
      corrupted = true;
      this.engine.markCorrupt();
    }

    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    let parsed: PacketTrace['parsed'] = null;
    let error: string | undefined;
    let fields: ReturnType<typeof parseFtmsTreadmillData> | null = null;
    try {
      fields = parseFtmsTreadmillData(view);
      parsed = ftmsFieldsToRecord(fields);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      if (corrupted) this.log('Dropped a corrupted FTMS packet', 'warn');
    }

    this.emitPacket({
      id: this.packetId,
      timestamp: this.engine.timestamp(),
      characteristicUuid: TREADMILL_DATA_UUID,
      hex: dataViewToHex(view),
      parsed,
      error,
      corrupted,
    });
    this.packetId += 1;

    if (!fields || fields.instantaneousSpeedKmh == null) return;
    const data: TreadmillData = {
      timestamp: this.engine.timestamp(),
      speedKmh: fields.instantaneousSpeedKmh,
      inclinePercent: fields.inclinePercent,
      distanceMeters: fields.totalDistanceMeters ?? snap.distanceMeters,
      elapsedSeconds: fields.elapsedSeconds ?? snap.elapsedSeconds,
      heartRateBpm: fields.heartRateBpm,
      caloriesKcal: fields.totalEnergyKcal,
      cadenceSpm: snap.cadenceSpm,
    };
    for (const listener of this.dataListeners) listener(data);
  }

  private publishSnapshot() {
    const snapshot = this.engine.snapshot();
    for (const listener of this.snapshotListeners) listener(snapshot);
  }

  private setState(state: ConnectionState) {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state);
  }

  private log(message: string, level: LogEntry['level'] = 'info') {
    const entry: LogEntry = { id: this.logId, timestamp: Date.now(), level, message };
    this.logId += 1;
    for (const listener of this.logListeners) listener(entry);
  }

  private emitPacket(packet: PacketTrace) {
    for (const listener of this.packetListeners) listener(packet);
  }
}
