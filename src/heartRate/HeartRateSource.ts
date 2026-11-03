import type { ConnectionState } from '../treadmill/types';

export type HeartRateOrigin = 'simulator' | 'bluetooth' | 'treadmill' | 'unknown';

export type HeartRateData = {
  timestamp: number;
  bpm: number;
  rrIntervalsMs?: number[];
  contactDetected?: boolean;
  source: HeartRateOrigin;
};

export type HeartRateSourceInfo = {
  id: string;
  name: string;
  type: string;
};

/** Which reading the workout is allowed to show. Sensors are never averaged together. */
export type HrPreference = 'auto' | 'external' | 'treadmill' | 'simulator';

/**
 * A heart-rate provider. WorkoutEngine only sees HeartRateData.
 * Chest straps, watches, treadmill HR, an ANT+ bridge, or a native bridge can implement this later.
 */
export interface HeartRateSource {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(callback: (data: HeartRateData) => void): () => void;
  subscribeConnection(callback: (state: ConnectionState) => void): () => void;
  getConnectionState(): ConnectionState;
  getSourceInfo(): HeartRateSourceInfo;
}
