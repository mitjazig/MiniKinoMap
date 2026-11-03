import { useEffect, useRef } from 'react';
import type { Route } from '../routes/routeTypes';
import { routeProgress, targetVideoTime } from '../routes/RouteProgressEngine';
import { appRuntime } from '../state/runtime';
import { useSession } from '../state/sessionStore';
import { logger } from '../logging/logger';
import { clamp } from '../utils/math';
import { CastSyncController } from '../video/CastSyncController';

type Props = {
  route: Route;
  traveledMeters: number;
  speedKmh: number;
  running: boolean;
};

/** Keeps a Cast session near the route clock without seeking every frame. */
export function CastRouteSync({ route, traveledMeters, speedKmh, running }: Props) {
  const report = useSession((state) => state.reportVideoDebug);
  const castState = useSession((state) => state.castState);
  const controller = useRef(new CastSyncController());
  const frame = useRef({ route, traveledMeters, speedKmh, running });
  frame.current = { route, traveledMeters, speedKmh, running };

  useEffect(() => {
    if (castState !== 'connected') return;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const currentFrame = frame.current;
      const cast = appRuntime.cast;
      const current = cast.getCurrentTime();
      const target = targetVideoTime(
        routeProgress(currentFrame.traveledMeters, currentFrame.route.totalDistanceMeters),
        currentFrame.route.videoDurationSeconds,
      );
      const drift = target - current;
      const correction = controller.current.decide(current, target, cast.capabilities.playbackRate);
      report({
        output: 'cast',
        state: cast.getState(),
        currentTime: current,
        targetTime: target,
        drift,
        lastCorrection: controller.current.getLastCorrection(),
        castState,
      });
      try {
        if (!currentFrame.running || currentFrame.speedKmh < 0.4) {
          if (cast.getState() !== 'paused') await cast.pause();
          return;
        }
        if (correction === 'seek') {
          logger.warn('video', `Video drift ${drift.toFixed(1)} seconds`);
          await cast.seek(target);
        } else if (correction === 'hold' && cast.capabilities.playbackRate) {
          await cast.setPlaybackRate(clamp(1 + drift / 8, 0.5, 2));
        }
        if (cast.getState() !== 'playing') await cast.play();
      } catch (error) {
        logger.warn('cast', error instanceof Error ? error.message : 'Cast sync failed');
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [castState, report, route.id]);

  return null;
}
