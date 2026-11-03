import { AUTO_INCLINE_ENABLED, SIMULATOR_MAX_INCLINE_PERCENT } from '../config';
import { DeviceManager, type DeviceSnapshot } from '../devices/DeviceManager';
import { BluetoothHeartRateSource } from '../heartRate/ble/BluetoothHeartRateSource';
import type { HrPreference } from '../heartRate/HeartRateSource';
import { SimulatorHeartRateSource } from '../heartRate/simulator/SimulatorHeartRateSource';
import { getRouteById } from '../routes/routeCatalog';
import { WebBluetoothTransport } from '../treadmill/bluetooth/WebBluetoothTransport';
import { SimulatorTransport } from '../treadmill/simulator/SimulatorTransport';
import type { ConnectionState, SourceKind } from '../treadmill/types';
import { CastVideoOutput } from '../video/CastVideoOutput';
import { emptyVideoDebug, type VideoDebugSnapshot } from '../video/types';
import type { YouTubeVideoOutput } from '../youtube/YouTubeVideoOutput';
import { WorkoutEngine, type WorkoutSettings } from '../workout/WorkoutEngine';

export type AppSettings = WorkoutSettings & {
  hrPreference: HrPreference;
  videoOutput: 'local' | 'cast';
  castSync: 'normal';
  developerMode: boolean;
  simulatorEnabled: boolean;
  castTestVideoUrl: string;
  pauseYouTubeWhenStopped: boolean;
  maxHeartRate: number | null;
};

export type RuntimeBundle = {
  version: number;
  simulator: SimulatorTransport;
  bluetooth: WebBluetoothTransport;
  heartRateBluetooth: BluetoothHeartRateSource;
  heartRateSimulator: SimulatorHeartRateSource;
  cast: CastVideoOutput;
  engine: WorkoutEngine;
  settings: AppSettings;
  source: SourceKind;
  videoDebug: VideoDebugSnapshot;
  youtube: YouTubeVideoOutput | null;
  devices: DeviceManager;
};

const BUNDLE_VERSION = 3;

function createBundle(): RuntimeBundle {
  const settings: AppSettings = {
    autoIncline: AUTO_INCLINE_ENABLED,
    maxIncline: SIMULATOR_MAX_INCLINE_PERCENT,
    weightKg: 75,
    hrPreference: 'auto',
    videoOutput: 'local',
    castSync: 'normal',
    developerMode: true,
    simulatorEnabled: true,
    castTestVideoUrl: '',
    pauseYouTubeWhenStopped: true,
    maxHeartRate: null,
  };
  const simulator = new SimulatorTransport();
  const engine = new WorkoutEngine({
    getRoute: getRouteById,
    settings: () => settings,
  });
  const heartRateSimulator = new SimulatorHeartRateSource({
    sample: () => {
      const belt = simulator.getSnapshot();
      const workout = engine.getSnapshot();
      return {
        speedKmh: belt.speedKmh,
        inclinePercent: belt.inclinePercent,
        elapsedSeconds: workout.activeSeconds || belt.elapsedSeconds,
      };
    },
  });
  const bundle: RuntimeBundle = {
    version: BUNDLE_VERSION,
    simulator,
    bluetooth: new WebBluetoothTransport(),
    heartRateBluetooth: new BluetoothHeartRateSource(),
    heartRateSimulator,
    cast: new CastVideoOutput(),
    engine,
    settings,
    source: 'simulator',
    videoDebug: emptyVideoDebug(),
    youtube: null,
    devices: new DeviceManager(() => placeholderDevices()),
  };
  bundle.devices = new DeviceManager(() => describeDevices(bundle));
  return bundle;
}

function placeholderDevices(): DeviceSnapshot {
  return {
    treadmill: { name: 'Simulator', transport: 'simulator', connection: 'disconnected' },
    heartRate: { name: 'Not connected', connection: 'disconnected', bpm: null },
    video: { output: 'local', label: 'Phone', state: 'idle' },
  };
}

function describeDevices(bundle: RuntimeBundle): DeviceSnapshot {
  const transport = bundle.source === 'bluetooth' ? bundle.bluetooth : bundle.simulator;
  const externalState = bundle.heartRateBluetooth.getConnectionState();
  const simulatorState = bundle.heartRateSimulator.getConnectionState();
  const preference = bundle.settings.hrPreference;
  const showSimulator =
    simulatorState === 'connected' &&
    (preference === 'simulator' || (preference === 'auto' && externalState !== 'connected'));
  const heart = showSimulator ? bundle.heartRateSimulator : bundle.heartRateBluetooth;
  const heartState: ConnectionState = heart.getConnectionState();
  const parsed = bundle.heartRateBluetooth.getDebug().parsed?.bpm;
  const bpm =
    heartState !== 'connected' ? null : showSimulator ? bundle.heartRateSimulator.getBpm() : parsed && parsed > 0 ? parsed : null;
  const castStatus = bundle.cast.getStatus();
  const casting = castStatus.sessionState === 'connected';
  return {
    treadmill: {
      name: bundle.source === 'bluetooth' ? 'Bluetooth treadmill' : 'Simulator',
      transport: bundle.source,
      connection: transport.getConnectionState(),
    },
    heartRate: {
      name: heartState === 'connected' ? heart.getSourceInfo().name : 'Not connected',
      connection: heartState,
      bpm,
    },
    video: {
      output: casting ? 'cast' : 'local',
      label: casting ? castStatus.deviceName || 'Chromecast' : 'Phone',
      state: casting ? castStatus.outputState : 'local',
    },
  };
}

const holder = globalThis as { __runscape?: RuntimeBundle };
if (!holder.__runscape || holder.__runscape.version !== BUNDLE_VERSION) {
  holder.__runscape = createBundle();
}

export const appRuntime = holder.__runscape;
