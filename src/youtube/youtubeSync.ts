import { routeProgress } from '../routes/RouteProgressEngine';
import { clamp } from '../utils/math';

/** YouTube seeks are more expensive than a local file, so the window is wider than MP4 sync. */
export const YOUTUBE_IGNORE_DRIFT_SECONDS = 3;
export const YOUTUBE_SEEK_DRIFT_SECONDS = 8;
export const YOUTUBE_STOP_KMH = 0.3;
export const YOUTUBE_STOP_HOLD_MS = 2000;

export function youtubeTargetTime(input: {
  distanceMeters: number;
  totalDistanceMeters: number;
  videoStartSeconds: number;
  videoEndSeconds: number;
}): number {
  const start = input.videoStartSeconds;
  const end = Math.max(start, input.videoEndSeconds);
  const progress = routeProgress(input.distanceMeters, input.totalDistanceMeters);
  return start + progress * (end - start);
}

export function shouldPauseYouTube(input: {
  enabled: boolean;
  speedKmh: number;
  stoppedForMs: number;
}): boolean {
  if (!input.enabled) return false;
  return input.speedKmh < YOUTUBE_STOP_KMH && input.stoppedForMs >= YOUTUBE_STOP_HOLD_MS;
}

export class StoppedBeltTimer {
  private since: number | null = null;

  milliseconds(speedKmh: number, now: number, threshold = YOUTUBE_STOP_KMH): number {
    if (speedKmh >= threshold) {
      this.since = null;
      return 0;
    }
    if (this.since == null) this.since = now;
    return Math.max(0, now - this.since);
  }
}

export type YouTubePlan =
  | { action: 'pause' }
  | { action: 'hold' }
  | { action: 'play'; playbackRate?: number }
  | { action: 'seek'; timeSeconds: number };

export function nearestPlaybackRate(available: number[], desired: number): number | null {
  const rates = available.filter((rate) => Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return null;
  return rates.reduce((best, rate) => (Math.abs(rate - desired) < Math.abs(best - desired) ? rate : best));
}

/**
 * Scenic mode only plays or pauses. Synced mode seeks on large drift and nudges rate on medium drift
 * when the player actually lists that rate.
 */
export function planYouTubePlayback(input: {
  mode: 'scenic' | 'synced';
  running: boolean;
  speedKmh: number;
  stoppedForMs: number;
  pauseWhenStopped: boolean;
  currentTime: number;
  targetTime: number;
  playbackRateSupported: boolean;
  availableRates: number[];
}): YouTubePlan {
  if (!input.running) return { action: 'pause' };
  if (
    shouldPauseYouTube({
      enabled: input.pauseWhenStopped,
      speedKmh: input.speedKmh,
      stoppedForMs: input.stoppedForMs,
    })
  ) {
    return { action: 'pause' };
  }
  if (input.mode !== 'synced') return { action: 'play' };

  const drift = input.targetTime - input.currentTime;
  const abs = Math.abs(drift);
  if (abs < YOUTUBE_IGNORE_DRIFT_SECONDS) return { action: 'play' };
  if (abs <= YOUTUBE_SEEK_DRIFT_SECONDS) {
    if (!input.playbackRateSupported) return { action: 'hold' };
    const desired = clamp(1 + drift / 16, 0.75, 1.25);
    const rate = nearestPlaybackRate(input.availableRates, desired);
    if (rate == null || Math.abs(rate - 1) < 0.01) return { action: 'hold' };
    return { action: 'play', playbackRate: rate };
  }
  return { action: 'seek', timeSeconds: Math.max(0, input.targetTime) };
}
