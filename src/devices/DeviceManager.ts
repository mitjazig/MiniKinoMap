import type { ConnectionState } from '../treadmill/types';

export type DeviceSnapshot = {
  treadmill: {
    name: string;
    transport: string;
    connection: ConnectionState;
  };
  heartRate: {
    name: string;
    connection: ConnectionState;
    bpm: number | null;
  };
  video: {
    output: 'local' | 'cast';
    label: string;
    state: string;
  };
};

/**
 * The workout engine does not talk to Bluetooth or Cast.
 * This object is the place those three device kinds are described together.
 */
export class DeviceManager {
  constructor(private readonly read: () => DeviceSnapshot) {}

  snapshot(): DeviceSnapshot {
    return this.read();
  }
}
