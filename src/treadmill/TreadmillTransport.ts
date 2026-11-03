import type { ConnectionState, LogEntry, PacketTrace, TreadmillData } from './types';

/**
 * The only treadmill API the workout engine and the product UI depend on.
 * SimulatorTransport and WebBluetoothTransport both implement it.
 * A future KettlerAlphaRun200Transport can implement it without UI changes.
 */
export interface TreadmillTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  start(): Promise<void>;
  /** Optional belt pause. Stop ends the controlled session; pause holds it. */
  pause?(): Promise<void>;
  stop(): Promise<void>;

  setTargetSpeed?(kmh: number): Promise<void>;
  setTargetIncline?(percent: number): Promise<void>;

  subscribe(callback: (data: TreadmillData) => void): () => void;
  subscribeConnection(callback: (state: ConnectionState) => void): () => void;
  subscribeLog(callback: (entry: LogEntry) => void): () => void;
  subscribePacket(callback: (packet: PacketTrace) => void): () => void;

  getConnectionState(): ConnectionState;
}

export class ControlUnsupportedError extends Error {
  constructor(message = 'Control unsupported') {
    super(message);
    this.name = 'ControlUnsupportedError';
  }
}
