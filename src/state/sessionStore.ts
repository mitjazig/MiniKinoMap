import { create } from 'zustand';
import { APP_VERSION } from '../config';
import { DeviceManager } from '../devices/DeviceManager';
import type { HeartRateDebugSnapshot } from '../heartRate/ble/BluetoothHeartRateSource';
import { HR_DISCONNECTED } from '../heartRate/ble/heartRateConstants';
import type { HrPreference } from '../heartRate/HeartRateSource';
import type { HrPresetId } from '../heartRate/simulator/SimulatorHeartRateSource';
import { logger, type DevLogEntry } from '../logging/logger';
import { detectCapabilities, type BrowserCapabilities } from '../platform/capabilities';
import type { Route } from '../routes/routeTypes';
import { workoutRepository } from '../storage/workoutRepository';
import { routeRepository, savedRouteToRoute } from '../storage/routeRepository';
import type { SavedYouTubeRoute } from '../storage/savedRoute';
import { replaceUserRoutes } from '../routes/routeCatalog';
import { mediaOf } from '../routes/mediaOf';
import { getNavigatorBluetooth } from '../treadmill/bluetooth/webBluetoothTypes';
import type { GattReport } from '../treadmill/bluetooth/BleInspector';
import type { ConnectionState, LogEntry, PacketTrace, SourceKind, TreadmillData } from '../treadmill/types';
import type { TreadmillTransport } from '../treadmill/TreadmillTransport';
import { resolveCastUrl } from '../video/castAccess';
import type { VideoDebugSnapshot } from '../video/types';
import { emptyVideoDebug } from '../video/types';
import { YOUTUBE_CAST_MESSAGE } from '../youtube/youtubeErrors';
import { emptyYouTubeDebug, type YouTubeDebugState } from '../youtube/YouTubeVideoOutput';
import { isWorkoutActive } from '../workout/WorkoutStateMachine';
import type { WorkoutRecord, WorkoutSnapshot } from '../workout/types';
import { emptyWorkoutSnapshot } from '../workout/types';
import { appRuntime, type AppSettings } from './runtime';

const SETTINGS_KEY = 'runscape-settings';

export type SessionState = {
  source: SourceKind;
  connectionState: ConnectionState;
  statusDetail: string | null;
  bluetoothAvailable: boolean;
  ftmsDetected: boolean | null;
  controlSupported: boolean;
  gattReport: GattReport | null;
  latest: TreadmillData | null;
  logs: LogEntry[];
  packets: PacketTrace[];
  devLogs: DevLogEntry[];
  workout: WorkoutSnapshot;
  history: WorkoutRecord[];
  historyReady: boolean;
  historyError: string | null;
  actionError: string | null;
  autoIncline: boolean;
  maxIncline: number;
  weightKg: number;
  hrPreference: HrPreference;
  heartRateConnection: ConnectionState;
  heartRateName: string;
  heartRateDebug: HeartRateDebugSnapshot;
  simulatorHrConnection: ConnectionState;
  simulatorHrMode: 'manual' | 'auto';
  simulatorHrTarget: number;
  simulatorHrBpm: number | null;
  videoOutput: 'local' | 'cast';
  castState: 'idle' | 'connecting' | 'connected' | 'disconnected';
  castDeviceName: string;
  castMessage: string | null;
  castMediaLoaded: boolean;
  tvNotice: string | null;
  resumeVideoTime: number;
  videoDebug: VideoDebugSnapshot;
  castSync: 'normal';
  developerMode: boolean;
  simulatorEnabled: boolean;
  castTestVideoUrl: string;
  pauseYouTubeWhenStopped: boolean;
  maxHeartRate: number | null;
  programId: string;
  youtubeDebug: YouTubeDebugState;
  routeRevision: number;
  capabilities: BrowserCapabilities;
  connectSimulator: () => Promise<void>;
  connectBluetooth: () => Promise<void>;
  forgetBluetooth: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  selectRoute: (routeId: string) => void;
  startWorkout: () => Promise<void>;
  pauseWorkout: () => Promise<void>;
  resumeWorkout: () => Promise<void>;
  stopWorkout: () => Promise<void>;
  resetWorkout: () => void;
  setAutoIncline: (enabled: boolean) => void;
  setMaxIncline: (percent: number) => void;
  setWeightKg: (kg: number) => void;
  setHrPreference: (preference: HrPreference) => void;
  connectHeartRate: () => Promise<void>;
  inspectHeartRate: () => Promise<void>;
  reconnectHeartRate: () => Promise<void>;
  connectHeartRateSimulator: () => Promise<void>;
  disconnectHeartRate: () => Promise<void>;
  setSimulatorHrBpm: (bpm: number) => void;
  setSimulatorHrPreset: (id: HrPresetId) => void;
  setSimulatorHrAuto: () => void;
  setVideoOutput: (output: 'local' | 'cast') => Promise<void>;
  castToTv: () => Promise<void>;
  stopCasting: () => Promise<void>;
  loadCastForRoute: (route: Route) => Promise<void>;
  dismissTvNotice: () => void;
  setCastSync: (value: 'normal') => void;
  setDeveloperMode: (enabled: boolean) => void;
  setSimulatorEnabled: (enabled: boolean) => Promise<void>;
  setCastTestVideoUrl: (url: string) => void;
  setPauseYouTubeWhenStopped: (enabled: boolean) => void;
  setMaxHeartRate: (bpm: number | null) => void;
  selectProgram: (programId: string) => void;
  reportYouTubeDebug: (debug: YouTubeDebugState) => void;
  refreshRoutes: () => Promise<void>;
  saveYouTubeRoute: (record: SavedYouTubeRoute) => Promise<void>;
  deleteYouTubeRoute: (id: string) => Promise<void>;
  reportVideoDebug: (sample: VideoDebugSnapshot) => void;
  startFullDemo: () => Promise<boolean>;
  clearLogs: () => void;
  refreshHistory: () => Promise<void>;
  deleteWorkout: (id: string) => Promise<void>;
  dismissError: () => void;
};

let unsubs: Array<() => void> = [];
let engineWired = false;
let sensorsWired = false;

function cap<T>(items: T[], item: T, limit: number): T[] {
  const next = [...items, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function activeTransport(): TreadmillTransport {
  return appRuntime.source === 'bluetooth' ? appRuntime.bluetooth : appRuntime.simulator;
}

function follow(transport: TreadmillTransport) {
  for (const unsubscribe of unsubs) unsubscribe();
  unsubs = [
    transport.subscribe((latest) => useSession.setState({ latest })),
    transport.subscribeConnection((connectionState) => useSession.setState({ connectionState })),
    transport.subscribeLog((entry) => {
      logger.write(entry.level, 'treadmill', entry.message);
      useSession.setState((state) => ({ logs: cap(state.logs, entry, 180) }));
    }),
    transport.subscribePacket((packet) =>
      useSession.setState((state) => ({ packets: cap(state.packets, packet, 40) })),
    ),
  ];
  useSession.setState({ connectionState: transport.getConnectionState() });
}

function wireEngine() {
  if (engineWired) return;
  engineWired = true;
  appRuntime.engine.subscribe((workout) => useSession.setState({ workout }));
}

function wireSensors() {
  if (sensorsWired) return;
  sensorsWired = true;
  logger.subscribe((devLogs) => useSession.setState({ devLogs }));

  const ble = appRuntime.heartRateBluetooth;
  ble.subscribe((data) => {
    if (data.bpm > 0) {
      appRuntime.engine.setExternalHeartRate({ bpm: data.bpm, label: ble.getSourceInfo().name });
    }
    useSession.setState({ heartRateDebug: ble.getDebug(), heartRateName: ble.getSourceInfo().name });
  });
  ble.subscribeConnection((state) => {
    const debug = ble.getDebug();
    if (state !== 'connected') appRuntime.engine.setExternalHeartRate(null);
    appRuntime.engine.setHeartRateNotice(debug.statusDetail === HR_DISCONNECTED ? HR_DISCONNECTED : null);
    useSession.setState({
      heartRateConnection: state,
      heartRateName: ble.getSourceInfo().name,
      heartRateDebug: debug,
    });
  });

  const simulator = appRuntime.heartRateSimulator;
  simulator.subscribe((data) => {
    if (data.bpm > 0) appRuntime.engine.setSimulatorHeartRate({ bpm: data.bpm });
    useSession.setState({
      simulatorHrBpm: data.bpm,
      simulatorHrMode: simulator.getMode(),
      simulatorHrTarget: simulator.getTarget(),
    });
  });
  simulator.subscribeConnection((state) => {
    if (state !== 'connected') appRuntime.engine.setSimulatorHeartRate(null);
    useSession.setState({ simulatorHrConnection: state });
  });

  appRuntime.cast.subscribe((status) => {
    useSession.setState({
      castState: status.sessionState,
      castDeviceName: status.deviceName,
      castMessage: status.message,
    });
  });
  appRuntime.cast.onSessionEnded((reason) => {
    const time = appRuntime.cast.getCurrentTime();
    appRuntime.settings.videoOutput = 'local';
    persistSettings();
    useSession.setState({
      videoOutput: 'local',
      castMediaLoaded: false,
      resumeVideoTime: time,
      tvNotice: reason,
      castState: 'disconnected',
    });
  });
}

function persistSettings() {
  const settings = appRuntime.settings;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      autoIncline: settings.autoIncline,
      maxIncline: settings.maxIncline,
      weightKg: settings.weightKg,
      hrPreference: settings.hrPreference,
      videoOutput: settings.videoOutput,
      castSync: settings.castSync,
      developerMode: settings.developerMode,
      simulatorEnabled: settings.simulatorEnabled,
      castTestVideoUrl: settings.castTestVideoUrl,
      pauseYouTubeWhenStopped: settings.pauseYouTubeWhenStopped,
      maxHeartRate: settings.maxHeartRate,
    }),
  );
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const settings = appRuntime.settings;
    if (typeof parsed.autoIncline === 'boolean') settings.autoIncline = parsed.autoIncline;
    if (typeof parsed.maxIncline === 'number') settings.maxIncline = parsed.maxIncline;
    if (typeof parsed.weightKg === 'number') settings.weightKg = parsed.weightKg;
    if (
      parsed.hrPreference === 'auto' ||
      parsed.hrPreference === 'external' ||
      parsed.hrPreference === 'treadmill' ||
      parsed.hrPreference === 'simulator'
    ) {
      settings.hrPreference = parsed.hrPreference;
    }
    if (parsed.castSync === 'normal') settings.castSync = 'normal';
    if (typeof parsed.developerMode === 'boolean') settings.developerMode = parsed.developerMode;
    if (typeof parsed.simulatorEnabled === 'boolean') settings.simulatorEnabled = parsed.simulatorEnabled;
    if (typeof parsed.castTestVideoUrl === 'string') settings.castTestVideoUrl = parsed.castTestVideoUrl.slice(0, 500);
    if (typeof parsed.pauseYouTubeWhenStopped === 'boolean') {
      settings.pauseYouTubeWhenStopped = parsed.pauseYouTubeWhenStopped;
    }
    if (parsed.maxHeartRate == null) settings.maxHeartRate = null;
    else if (typeof parsed.maxHeartRate === 'number' && parsed.maxHeartRate >= 100 && parsed.maxHeartRate <= 230) {
      settings.maxHeartRate = Math.round(parsed.maxHeartRate);
    }
    settings.videoOutput = 'local';
  } catch {
    logger.warn('storage', 'Saved settings could not be read');
  }
}

function syncBluetoothMeta() {
  useSession.setState({
    connectionState: appRuntime.bluetooth.getConnectionState(),
    gattReport: appRuntime.bluetooth.getGattReport(),
    ftmsDetected: appRuntime.bluetooth.getGattReport() ? appRuntime.bluetooth.isFtmsDetected() : null,
    controlSupported: appRuntime.bluetooth.isControlSupported(),
    statusDetail: appRuntime.bluetooth.getStatusDetail(),
  });
}

function blockedByWorkout(next: SourceKind): boolean {
  return isWorkoutActive(useSession.getState().workout.phase) && useSession.getState().source !== next;
}

function applyHrPreference(preference: HrPreference) {
  appRuntime.settings.hrPreference = preference;
  appRuntime.engine.setHeartRatePreference(preference);
  persistSettings();
  useSession.setState({ hrPreference: preference });
}

export const useSession = create<SessionState>((set, get) => ({
  source: 'simulator',
  connectionState: 'disconnected',
  statusDetail: null,
  bluetoothAvailable: false,
  ftmsDetected: null,
  controlSupported: false,
  gattReport: null,
  latest: null,
  logs: [],
  packets: [],
  devLogs: [],
  workout: emptyWorkoutSnapshot(),
  history: [],
  historyReady: false,
  historyError: null,
  actionError: null,
  autoIncline: appRuntime.settings.autoIncline,
  maxIncline: appRuntime.settings.maxIncline,
  weightKg: appRuntime.settings.weightKg,
  hrPreference: appRuntime.settings.hrPreference,
  heartRateConnection: appRuntime.heartRateBluetooth.getConnectionState(),
  heartRateName: appRuntime.heartRateBluetooth.getSourceInfo().name,
  heartRateDebug: appRuntime.heartRateBluetooth.getDebug(),
  simulatorHrConnection: appRuntime.heartRateSimulator.getConnectionState(),
  simulatorHrMode: appRuntime.heartRateSimulator.getMode(),
  simulatorHrTarget: appRuntime.heartRateSimulator.getTarget(),
  simulatorHrBpm: null,
  videoOutput: 'local',
  castState: 'idle',
  castDeviceName: '',
  castMessage: null,
  castMediaLoaded: false,
  tvNotice: null,
  resumeVideoTime: 0,
  videoDebug: emptyVideoDebug(),
  castSync: 'normal',
  developerMode: appRuntime.settings.developerMode,
  simulatorEnabled: appRuntime.settings.simulatorEnabled,
  castTestVideoUrl: appRuntime.settings.castTestVideoUrl,
  pauseYouTubeWhenStopped: appRuntime.settings.pauseYouTubeWhenStopped,
  maxHeartRate: appRuntime.settings.maxHeartRate,
  programId: 'free',
  youtubeDebug: emptyYouTubeDebug(),
  routeRevision: 0,
  capabilities: detectCapabilities(),

  connectSimulator: async () => {
    if (blockedByWorkout('simulator')) {
      set({ actionError: 'Finish the current run before changing the treadmill source.' });
      return;
    }
    appRuntime.source = 'simulator';
    appRuntime.settings.simulatorEnabled = true;
    appRuntime.engine.use(appRuntime.simulator);
    follow(appRuntime.simulator);
    await appRuntime.simulator.connect();
    persistSettings();
    set({
      source: 'simulator',
      simulatorEnabled: true,
      connectionState: appRuntime.simulator.getConnectionState(),
      actionError: null,
      statusDetail: null,
    });
    logger.info('treadmill', 'Simulator connected');
  },

  connectBluetooth: async () => {
    if (blockedByWorkout('bluetooth')) {
      set({ actionError: 'Finish the current run before changing the treadmill source.' });
      return;
    }
    appRuntime.source = 'bluetooth';
    appRuntime.engine.use(appRuntime.bluetooth);
    follow(appRuntime.bluetooth);
    set({ source: 'bluetooth', actionError: null });
    try {
      await appRuntime.bluetooth.connect();
      logger.info('bluetooth', 'Treadmill connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bluetooth connection failed.';
      logger.error('bluetooth', message);
      set({ actionError: message });
    } finally {
      syncBluetoothMeta();
    }
  },

  forgetBluetooth: async () => {
    if (blockedByWorkout('simulator')) {
      set({ actionError: 'Finish the current run before forgetting the treadmill.' });
      return;
    }
    await appRuntime.bluetooth.forget();
    if (get().source === 'bluetooth') {
      set({
        connectionState: appRuntime.bluetooth.getConnectionState(),
        gattReport: null,
        ftmsDetected: null,
        controlSupported: false,
        statusDetail: null,
      });
    }
  },

  disconnect: async () => {
    await activeTransport().disconnect();
    set({ connectionState: activeTransport().getConnectionState() });
  },

  reconnect: async () => {
    if (get().source === 'simulator') await get().connectSimulator();
    else await get().connectBluetooth();
  },

  selectRoute: (routeId) => {
    const previous = appRuntime.engine.getSnapshot().routeId;
    const result = appRuntime.engine.selectRoute(routeId);
    set({
      actionError: result.ok ? null : (result.error ?? 'Could not select that route.'),
      ...(previous !== routeId ? { resumeVideoTime: 0 } : {}),
    });
  },

  startWorkout: async () => {
    const result = await appRuntime.engine.start();
    if (result.ok) logger.info('workout', 'Workout started');
    set({ actionError: result.ok ? null : (result.error ?? 'Could not start.') });
  },

  pauseWorkout: async () => {
    const result = await appRuntime.engine.pause();
    set({ actionError: result.ok ? null : (result.error ?? 'Could not pause.') });
  },

  resumeWorkout: async () => {
    const result = await appRuntime.engine.resume();
    set({ actionError: result.ok ? null : (result.error ?? 'Could not resume.') });
  },

  stopWorkout: async () => {
    const result = await appRuntime.engine.stop();
    if (!result.ok) {
      set({ actionError: result.error ?? 'Could not stop.' });
      return;
    }
    if (!result.record) {
      set({ actionError: null });
      return;
    }
    try {
      await workoutRepository.save(result.record);
      const history = await workoutRepository.list();
      logger.info('storage', 'Workout saved');
      set({ history, historyError: null, actionError: null });
    } catch {
      logger.error('storage', 'Workout could not be saved');
      set({ actionError: 'The run finished, but it could not be saved on this device.' });
    }
  },

  resetWorkout: () => {
    const result = appRuntime.engine.reset();
    set({ actionError: result.ok ? null : (result.error ?? null) });
  },

  setAutoIncline: (enabled) => {
    appRuntime.settings.autoIncline = enabled;
    persistSettings();
    set({ autoIncline: enabled });
  },

  setMaxIncline: (percent) => {
    const maxIncline = Math.min(12, Math.max(0, percent));
    appRuntime.settings.maxIncline = maxIncline;
    persistSettings();
    set({ maxIncline });
  },

  setWeightKg: (kg) => {
    const weightKg = Math.min(180, Math.max(40, kg));
    appRuntime.settings.weightKg = weightKg;
    persistSettings();
    set({ weightKg });
  },

  setHrPreference: (preference) => applyHrPreference(preference),

  connectHeartRate: async () => {
    set({ actionError: null });
    try {
      await appRuntime.heartRateBluetooth.connect();
      applyHrPreference('auto');
    } catch (error) {
      set({
        actionError: error instanceof Error ? error.message : 'Heart rate connection failed.',
        heartRateDebug: appRuntime.heartRateBluetooth.getDebug(),
      });
    }
  },

  inspectHeartRate: async () => {
    set({ actionError: null });
    try {
      await appRuntime.heartRateBluetooth.inspect();
      applyHrPreference('auto');
    } catch (error) {
      set({
        actionError: error instanceof Error ? error.message : 'Heart rate inspection failed.',
        heartRateDebug: appRuntime.heartRateBluetooth.getDebug(),
      });
    }
  },

  reconnectHeartRate: async () => {
    set({ actionError: null });
    try {
      await appRuntime.heartRateBluetooth.reconnect();
      applyHrPreference(get().hrPreference === 'simulator' ? 'auto' : get().hrPreference);
    } catch (error) {
      set({ actionError: error instanceof Error ? error.message : 'Heart rate reconnect failed.' });
    }
  },

  connectHeartRateSimulator: async () => {
    await appRuntime.heartRateSimulator.connect();
    applyHrPreference('simulator');
    set({
      simulatorHrConnection: appRuntime.heartRateSimulator.getConnectionState(),
      simulatorHrMode: appRuntime.heartRateSimulator.getMode(),
      simulatorHrTarget: appRuntime.heartRateSimulator.getTarget(),
      simulatorHrBpm: appRuntime.heartRateSimulator.getBpm(),
      actionError: null,
    });
    logger.info('heartRate', 'HR simulator connected');
  },

  disconnectHeartRate: async () => {
    await appRuntime.heartRateBluetooth.disconnect();
    await appRuntime.heartRateSimulator.disconnect();
    appRuntime.engine.setExternalHeartRate(null);
    appRuntime.engine.setSimulatorHeartRate(null);
    appRuntime.engine.setHeartRateNotice(null);
    set({ actionError: null, simulatorHrBpm: null });
  },

  setSimulatorHrBpm: (bpm) => {
    appRuntime.heartRateSimulator.setManual(bpm);
    set({ simulatorHrMode: 'manual', simulatorHrTarget: appRuntime.heartRateSimulator.getTarget() });
  },

  setSimulatorHrPreset: (id) => {
    appRuntime.heartRateSimulator.setPreset(id);
    set({ simulatorHrMode: 'manual', simulatorHrTarget: appRuntime.heartRateSimulator.getTarget() });
  },

  setSimulatorHrAuto: () => {
    appRuntime.heartRateSimulator.setAuto();
    set({ simulatorHrMode: 'auto' });
  },

  setVideoOutput: async (output) => {
    if (output === 'cast') await get().castToTv();
    else await get().stopCasting();
  },

  castToTv: async () => {
    set({ castMessage: null, actionError: null });
    try {
      await appRuntime.cast.requestSession();
      appRuntime.settings.videoOutput = 'cast';
      persistSettings();
      set({
        videoOutput: 'cast',
        castState: appRuntime.cast.getStatus().sessionState,
        castDeviceName: appRuntime.cast.getDeviceName(),
        castMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cast failed.';
      appRuntime.settings.videoOutput = 'local';
      set({ castMessage: message, videoOutput: 'local', castMediaLoaded: false });
    }
  },

  stopCasting: async () => {
    const time = appRuntime.cast.getCurrentTime();
    await appRuntime.cast.stop();
    appRuntime.settings.videoOutput = 'local';
    persistSettings();
    set({
      videoOutput: 'local',
      castMediaLoaded: false,
      resumeVideoTime: time,
      castState: 'disconnected',
      tvNotice: null,
      castMessage: null,
    });
  },

  loadCastForRoute: async (route) => {
    if (mediaOf(route).type === 'youtube') {
      set({ castMessage: YOUTUBE_CAST_MESSAGE, castMediaLoaded: false });
      logger.info('youtube', YOUTUBE_CAST_MESSAGE);
      return;
    }
    if (appRuntime.cast.getStatus().sessionState !== 'connected') return;
    const local = mediaOf(route);
    const url = local.type === 'local' ? local.url : route.videoUrl;
    const resolved = resolveCastUrl(url, route.castCompatible, appRuntime.settings.castTestVideoUrl);
    if (!resolved.url) {
      set({ castMessage: resolved.reason, castMediaLoaded: false });
      logger.warn('cast', resolved.reason ?? 'Cast URL rejected');
      return;
    }
    try {
      await appRuntime.cast.load({
        type: 'local',
        url: resolved.url,
        title: route.name,
        castCompatible: true,
        contentType: 'video/mp4',
      });
      set({ castMediaLoaded: true, castMessage: null, videoOutput: 'cast' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The TV could not play this video.';
      set({ castMediaLoaded: false, castMessage: message });
    }
  },

  dismissTvNotice: () => set({ tvNotice: null }),

  setCastSync: (castSync) => {
    appRuntime.settings.castSync = castSync;
    persistSettings();
    set({ castSync });
  },

  setDeveloperMode: (developerMode) => {
    appRuntime.settings.developerMode = developerMode;
    persistSettings();
    set({ developerMode });
  },

  setSimulatorEnabled: async (enabled) => {
    appRuntime.settings.simulatorEnabled = enabled;
    persistSettings();
    set({ simulatorEnabled: enabled });
    if (!enabled && !isWorkoutActive(get().workout.phase) && get().source === 'simulator') {
      await appRuntime.simulator.disconnect();
      set({ connectionState: appRuntime.simulator.getConnectionState() });
      logger.info('treadmill', 'Simulator turned off');
    }
    if (enabled && get().source === 'simulator' && appRuntime.simulator.getConnectionState() !== 'connected') {
      await get().connectSimulator();
    }
  },

  setCastTestVideoUrl: (url) => {
    const castTestVideoUrl = url.slice(0, 500);
    appRuntime.settings.castTestVideoUrl = castTestVideoUrl;
    persistSettings();
    set({ castTestVideoUrl });
  },

  setPauseYouTubeWhenStopped: (pauseYouTubeWhenStopped) => {
    appRuntime.settings.pauseYouTubeWhenStopped = pauseYouTubeWhenStopped;
    persistSettings();
    set({ pauseYouTubeWhenStopped });
  },

  setMaxHeartRate: (bpm) => {
    const maxHeartRate = bpm == null || !Number.isFinite(bpm) ? null : Math.min(230, Math.max(100, Math.round(bpm)));
    appRuntime.settings.maxHeartRate = maxHeartRate;
    persistSettings();
    set({ maxHeartRate });
  },

  selectProgram: (programId) => {
    const result = appRuntime.engine.selectProgram(programId);
    set({
      programId: result.ok ? programId : get().programId,
      actionError: result.ok ? null : (result.error ?? null),
    });
  },

  reportYouTubeDebug: (youtubeDebug) => set({ youtubeDebug }),

  refreshRoutes: async () => {
    try {
      const saved = await routeRepository.list();
      replaceUserRoutes(saved.map(savedRouteToRoute));
      set((state) => ({ routeRevision: state.routeRevision + 1 }));
    } catch {
      logger.error('storage', 'Saved YouTube routes could not be read');
    }
  },

  saveYouTubeRoute: async (record) => {
    await routeRepository.save(record);
    logger.info('storage', 'YouTube route saved');
    await get().refreshRoutes();
  },

  deleteYouTubeRoute: async (id) => {
    await routeRepository.remove(id);
    logger.info('storage', 'YouTube route deleted');
    await get().refreshRoutes();
  },

  reportVideoDebug: (videoDebug) => {
    appRuntime.videoDebug = videoDebug;
    set({ videoDebug });
  },

  startFullDemo: async () => {
    if (isWorkoutActive(get().workout.phase)) {
      set({ actionError: 'Finish the current run before starting a demo.' });
      return false;
    }
    await get().connectSimulator();
    await get().connectHeartRateSimulator();
    appRuntime.heartRateSimulator.setAuto();
    set({ simulatorHrMode: 'auto' });
    const result = appRuntime.engine.selectRoute('lakeside');
    await appRuntime.simulator.setTargetSpeed(6);
    set({ actionError: result.ok ? null : (result.error ?? 'Could not prepare the demo.') });
    if (result.ok) logger.info('app', 'Full demo prepared');
    return result.ok;
  },

  clearLogs: () => {
    logger.clear();
    set({ logs: [], packets: [] });
  },

  refreshHistory: async () => {
    try {
      const history = await workoutRepository.list();
      set({ history, historyReady: true, historyError: null });
    } catch {
      logger.error('storage', 'Saved runs could not be read');
      set({ historyReady: true, historyError: 'Runs saved on this device could not be read.' });
    }
  },

  deleteWorkout: async (id) => {
    await workoutRepository.remove(id);
    await get().refreshHistory();
  },

  dismissError: () => set({ actionError: null }),
}));

export const deviceManager = new DeviceManager(() => {
  const state = useSession.getState();
  const described = appRuntime.devices.snapshot();
  return {
    ...described,
    video: {
      output: state.videoOutput,
      label: state.videoOutput === 'cast' ? state.castDeviceName || 'Chromecast' : 'Phone',
      state: state.videoDebug.state,
    },
  };
});

export async function bootstrap() {
  const holder = globalThis as { __runscapeBoot?: boolean };
  wireEngine();
  wireSensors();
  if (holder.__runscapeBoot) return;
  holder.__runscapeBoot = true;
  loadSettings();
  appRuntime.engine.setHeartRatePreference(appRuntime.settings.hrPreference);
  useSession.setState({
    autoIncline: appRuntime.settings.autoIncline,
    maxIncline: appRuntime.settings.maxIncline,
    weightKg: appRuntime.settings.weightKg,
    hrPreference: appRuntime.settings.hrPreference,
    videoOutput: 'local',
    castSync: appRuntime.settings.castSync,
    developerMode: appRuntime.settings.developerMode,
    simulatorEnabled: appRuntime.settings.simulatorEnabled,
    castTestVideoUrl: appRuntime.settings.castTestVideoUrl,
    pauseYouTubeWhenStopped: appRuntime.settings.pauseYouTubeWhenStopped,
    maxHeartRate: appRuntime.settings.maxHeartRate,
    bluetoothAvailable: getNavigatorBluetooth() != null,
    capabilities: detectCapabilities(),
    source: 'simulator',
  });
  if (!appRuntime.settings.simulatorEnabled) {
    await useSession.getState().refreshHistory();
    await useSession.getState().refreshRoutes();
    return;
  }
  appRuntime.source = 'simulator';
  appRuntime.engine.use(appRuntime.simulator);
  follow(appRuntime.simulator);
  await appRuntime.simulator.connect();
  useSession.setState({ connectionState: appRuntime.simulator.getConnectionState() });
  await useSession.getState().refreshHistory();
  await useSession.getState().refreshRoutes();
  logger.info('app', `RUNSCAPE ${APP_VERSION} ready`);
}

export function buildHeartRateDebugReport(): string {
  const debug = useSession.getState().heartRateDebug;
  return JSON.stringify(
    {
      deviceName: debug.deviceName,
      service: debug.service,
      measurementCharacteristic: debug.measurementCharacteristic,
      lastPacketHex: debug.lastPacketHex,
      parsed: debug.parsed
        ? {
            bpm: debug.parsed.bpm,
            rrIntervalsMs: debug.parsed.rrIntervalsMs,
            contactDetected: debug.parsed.contactDetected,
          }
        : null,
      connectionState: debug.connectionState,
      bodySensorLocation: debug.bodySensorLocation,
      lastUpdate: debug.lastUpdate ? new Date(debug.lastUpdate).toISOString() : null,
    },
    null,
    2,
  );
}

export function buildDebugReport(): string {
  const state = useSession.getState();
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      capabilities: state.capabilities,
      devices: deviceManager.snapshot(),
      treadmill: {
        source: state.source,
        connectionState: state.connectionState,
        statusDetail: state.statusDetail,
        bluetoothAvailable: state.bluetoothAvailable,
        ftmsDetected: state.ftmsDetected,
        controlSupported: state.controlSupported,
        latest: state.latest,
        packets: state.packets.slice(-8),
        gattServices: state.gattReport?.services.map((service) => service.uuid) ?? [],
      },
      heartRate: {
        preference: state.hrPreference,
        displayedBpm: state.workout.liveHeartRateBpm,
        displayedLabel: state.workout.liveHeartRateLabel,
        debug: state.heartRateDebug,
        simulator: {
          connection: state.simulatorHrConnection,
          mode: state.simulatorHrMode,
          bpm: state.simulatorHrBpm,
        },
      },
      video: {
        ...state.videoDebug,
        castState: state.castState,
        castDeviceName: state.castDeviceName,
        castMessage: state.castMessage,
      },
      youtube: state.youtubeDebug,
      workout: state.workout,
      logs: state.devLogs.slice(-80).map((entry) => ({
        time: new Date(entry.timestamp).toISOString(),
        level: entry.level,
        category: entry.category,
        message: entry.message,
      })),
      note: 'No device addresses or credentials are included. Kettler is not assumed to speak FTMS. A watch is used only as a standard Heart Rate sensor.',
    },
    null,
    2,
  );
}
