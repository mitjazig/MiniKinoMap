import { useEffect, useRef, useState } from 'react';
import type { Route } from '../routes/routeTypes';
import { mediaOf } from '../routes/mediaOf';
import { appRuntime } from '../state/runtime';
import { logger } from '../logging/logger';
import { StoppedBeltTimer, planYouTubePlayback, youtubeTargetTime } from '../youtube/youtubeSync';
import { isYouTubeVideoId } from '../youtube/parseYouTubeUrl';
import type { YouTubeDebugState } from '../youtube/YouTubeVideoOutput';
import { YouTubeVideoOutput } from '../youtube/YouTubeVideoOutput';

type Props = {
  route: Route;
  traveledMeters: number;
  speedKmh: number;
  running: boolean;
  pauseWhenStopped: boolean;
  onDebug: (debug: YouTubeDebugState) => void;
};

/**
 * The iframe is YouTube's. Metrics and buttons stay outside this component.
 */
export function YouTubeRoutePlayer({
  route,
  traveledMeters,
  speedKmh,
  running,
  pauseWhenStopped,
  onDebug,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<YouTubeVideoOutput | null>(null);
  const frame = useRef({ route, traveledMeters, speedKmh, running, pauseWhenStopped });
  const stopped = useRef(new StoppedBeltTimer());
  const onDebugRef = useRef(onDebug);
  const [playerError, setPlayerError] = useState<string | null>(null);
  frame.current = { route, traveledMeters, speedKmh, running, pauseWhenStopped };
  onDebugRef.current = onDebug;

  const media = mediaOf(route);
  const videoId = media.type === 'youtube' ? media.videoId : '';

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isYouTubeVideoId(videoId)) {
      setPlayerError(isYouTubeVideoId(videoId) ? null : 'Invalid video');
      return;
    }
    const output = new YouTubeVideoOutput(host);
    outputRef.current = output;
    appRuntime.youtube = output;
    let cancelled = false;
    void output.load({ type: 'youtube', videoId, title: route.name }).catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : 'Video unavailable';
      setPlayerError(message);
      logger.error('youtube', message);
    });
    return () => {
      cancelled = true;
      outputRef.current = null;
      if (appRuntime.youtube === output) appRuntime.youtube = null;
      void output.destroy();
    };
  }, [videoId, route.name]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const output = outputRef.current;
      const current = frame.current;
      if (!output) return;
      const mode = current.route.playbackMode === 'synced' ? 'synced' : 'scenic';
      const synced =
        mode === 'synced' &&
        current.route.totalDistanceMeters > 0 &&
        current.route.videoStartSeconds != null &&
        current.route.videoEndSeconds != null;
      const target = synced
        ? youtubeTargetTime({
            distanceMeters: current.traveledMeters,
            totalDistanceMeters: current.route.totalDistanceMeters,
            videoStartSeconds: current.route.videoStartSeconds ?? 0,
            videoEndSeconds: current.route.videoEndSeconds ?? 0,
          })
        : output.getCurrentTime();
      const now = Date.now();
      const stoppedForMs = stopped.current.milliseconds(current.running ? current.speedKmh : 0, now);
      const plan = planYouTubePlayback({
        mode: synced ? 'synced' : 'scenic',
        running: current.running,
        speedKmh: current.speedKmh,
        stoppedForMs,
        pauseWhenStopped: current.pauseWhenStopped,
        currentTime: output.getCurrentTime(),
        targetTime: target,
        playbackRateSupported: output.capabilities.playbackRate,
        availableRates: output.getDebug().availablePlaybackRates,
      });
      const state = output.getState();
      void applyPlan(output, plan, state);
      const debug = output.getDebug();
      const currentTime = debug.currentTime;
      onDebugRef.current({
        ...debug,
        routeSync: synced,
        targetTime: synced ? target : currentTime,
        driftSeconds: synced ? target - currentTime : 0,
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [videoId]);

  return (
    <div className="w-full bg-ink">
      <div className="w-full" style={{ aspectRatio: '16 / 9' }}>
        <div ref={hostRef} className="h-full w-full" />
      </div>
      {playerError ? <p className="px-4 py-3 text-sm leading-6 text-ember">{playerError}</p> : null}
    </div>
  );
}

async function applyPlan(
  output: YouTubeVideoOutput,
  plan: ReturnType<typeof planYouTubePlayback>,
  state: ReturnType<YouTubeVideoOutput['getState']>,
) {
  try {
    if (plan.action === 'pause') {
      if (state !== 'paused' && state !== 'idle' && state !== 'error') await output.pause();
      return;
    }
    if (plan.action === 'seek') {
      await output.seek(plan.timeSeconds);
      if (state !== 'playing') await output.play();
      return;
    }
    if (plan.action === 'play' && plan.playbackRate != null) {
      await output.setPlaybackRate(plan.playbackRate);
    }
    if (plan.action === 'play' && state !== 'playing' && state !== 'loading') await output.play();
  } catch (error) {
    logger.warn('youtube', error instanceof Error ? error.message : 'YouTube sync failed');
  }
}
