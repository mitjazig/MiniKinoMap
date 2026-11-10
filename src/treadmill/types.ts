export type ConnectionState =
  | 'unsupported'
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type TreadmillData = {
  timestamp: number;
  speedKmh: number;
  inclinePercent?: number;
  distanceMeters: number;
  elapsedSeconds: number;
  heartRateBpm?: number;
  caloriesKcal?: number;
  cadenceSpm?: number;
};

export type TreadmillMachineEvent = 'started' | 'paused' | 'stopped';

export type LogEntry = {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
};

export type PacketTrace = {
  id: number;
  timestamp: number;
  characteristicUuid: string;
  hex: string;
  parsed: Record<string, number | string | boolean | undefined> | null;
  error?: string;
  corrupted?: boolean;
};

export type SourceKind = 'simulator' | 'bluetooth';

export function isLiveConnection(state: ConnectionState): boolean {
  return state === 'connected' || state === 'reconnecting';
}
