import { clamp } from '../utils/math';
import { planCastCorrection } from '../video/CastSyncController';
import type { VideoOutput } from '../video/types';

export const PLAYBACK_RATE_MIN = 0.5;
export const PLAYBACK_RATE_MAX = 2;
export const SEEK_DRIFT_SECONDS = 1.25;
const STOPPED_KMH = 0.4;

export type VideoSyncCommand =
  | { type: 'pause' }
  | { type: 'play'; playbackRate: number }
  | { type: 'seek'; timeSeconds: number; playbackRate: number };

export type RouteProgressInput = {
  traveledMeters: number;
  totalDistanceMeters: number;
  videoDurationSeconds: number;
  referenceSpeedKmh: number;
  currentSpeedKmh: number;
  currentVideoTime: number;
};

export function routeProgress(traveledMeters: number, totalDistanceMeters: number): number {
  if (totalDistanceMeters <= 0) return 0;
  return clamp(traveledMeters / totalDistanceMeters, 0, 1);
}

export function targetVideoTime(progress: number, videoDurationSeconds: number): number {
  if (videoDurationSeconds <= 0) return 0;
  return clamp(progress, 0, 1) * videoDurationSeconds;
}

function baseRate(speedKmh: number, referenceSpeedKmh: number): number {
  if (referenceSpeedKmh <= 0) return 1;
  return clamp(speedKmh / referenceSpeedKmh, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX);
}

/**
 * Keep a route video near the distance-based timestamp.
 * Small drift is corrected with playbackRate. Large drift seeks once.
 * A stopped belt pauses the picture.
 */
export function planVideoSync(input: RouteProgressInput): VideoSyncCommand {
  const progress = routeProgress(input.traveledMeters, input.totalDistanceMeters);
  const target = targetVideoTime(progress, input.videoDurationSeconds);
  if (input.currentSpeedKmh < STOPPED_KMH) {
    return { type: 'pause' };
  }
  const drift = target - input.currentVideoTime;
  const rate = baseRate(input.currentSpeedKmh, input.referenceSpeedKmh);
  if (Math.abs(drift) > SEEK_DRIFT_SECONDS) {
    return { type: 'seek', timeSeconds: target, playbackRate: rate };
  }
  const correction = clamp(drift / 2, -0.25, 0.25);
  return {
    type: 'play',
    playbackRate: clamp(rate + correction, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX),
  };
}

/**
 * Apply route sync through a VideoOutput.
 * Local outputs keep the HTML playback-rate policy. Cast outputs seek only on large drift.
 */
export async function syncThroughOutput(
  output: VideoOutput,
  input: Omit<RouteProgressInput, 'currentVideoTime'>,
): Promise<VideoSyncCommand> {
  const currentVideoTime = Number(await output.getCurrentTime());
  if (output.id === 'cast') {
    const target = targetVideoTime(
      routeProgress(input.traveledMeters, input.totalDistanceMeters),
      input.videoDurationSeconds,
    );
    if (input.currentSpeedKmh < STOPPED_KMH) {
      await output.pause();
      return { type: 'pause' };
    }
    const correction = planCastCorrection(currentVideoTime, target, output.capabilities.playbackRate);
    if (correction === 'seek') {
      await output.seek(target);
      await output.play();
      return { type: 'seek', timeSeconds: target, playbackRate: 1 };
    }
    if (correction === 'hold' && output.setPlaybackRate) {
      const playbackRate = clamp(1 + (target - currentVideoTime) / 8, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX);
      await output.setPlaybackRate(playbackRate);
      await output.play();
      return { type: 'play', playbackRate };
    }
    await output.play();
    return { type: 'play', playbackRate: 1 };
  }

  const command = planVideoSync({ ...input, currentVideoTime });
  if (command.type === 'pause') {
    await output.pause();
  } else if (command.type === 'seek') {
    if (output.setPlaybackRate) await output.setPlaybackRate(command.playbackRate);
    await output.seek(command.timeSeconds);
    await output.play();
  } else {
    if (output.setPlaybackRate) await output.setPlaybackRate(command.playbackRate);
    await output.play();
  }
  return command;
}
