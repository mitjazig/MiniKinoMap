import type { WorkoutPhase } from './WorkoutStateMachine';

export type WorkoutRecord = {
  id: string;
  date: string;
  routeId: string;
  routeName: string;
  durationSeconds: number;
  distanceMeters: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm?: number | null;
  heartRateSource?: string | null;
  caloriesKcal: number;
  elevationGainMeters: number;
};

export type WorkoutSnapshot = {
  phase: WorkoutPhase;
  routeId: string | null;
  activeSeconds: number;
  distanceMeters: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  averageHeartRateBpm: number | null;
  caloriesKcal: number;
  elevationGainMeters: number;
  liveSpeedKmh: number;
  liveInclinePercent: number;
  liveHeartRateBpm: number | null;
  liveHeartRateLabel: string | null;
  maxHeartRateBpm: number | null;
  heartRateNotice: string | null;
  liveCadenceSpm: number | null;
  banner: string | null;
  autoInclineNote: string | null;
  programName: string | null;
  programCue: string | null;
};

export function emptyWorkoutSnapshot(): WorkoutSnapshot {
  return {
    phase: 'idle',
    routeId: null,
    activeSeconds: 0,
    distanceMeters: 0,
    averageSpeedKmh: 0,
    maxSpeedKmh: 0,
    averageHeartRateBpm: null,
    caloriesKcal: 0,
    elevationGainMeters: 0,
    liveSpeedKmh: 0,
    liveInclinePercent: 0,
    liveHeartRateBpm: null,
    liveHeartRateLabel: null,
    maxHeartRateBpm: null,
    heartRateNotice: null,
    liveCadenceSpm: null,
    banner: null,
    autoInclineNote: null,
    programName: null,
    programCue: null,
  };
}
