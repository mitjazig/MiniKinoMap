import { useEffect, useRef, useState } from 'react';
import { planVideoSync, routeProgress, targetVideoTime } from '../routes/RouteProgressEngine';
import type { Route } from '../routes/routeTypes';
import { formatDistanceKm } from '../utils/format';
import { LocalVideoOutput } from '../video/LocalVideoOutput';
import type { VideoDebugSnapshot } from '../video/types';

type Props = {
  route: Route;
  traveledMeters: number;
  speedKmh: number;
  hold: boolean;
  initialTime?: number;
  onSyncSample?: (sample: VideoDebugSnapshot) => void;
};

type Palette = { sky: string; hill: string; near: string; road: string };

const palettes: Record<string, Palette> = {
  lakeside: { sky: '#163044', hill: '#1d4a55', near: '#214238', road: '#cbb892' },
  pine: { sky: '#1b2838', hill: '#234036', near: '#1a3328', road: '#8d7356' },
  quarry: { sky: '#2a313c', hill: '#4a433a', near: '#3c342c', road: '#b7a48a' },
};

type Frame = {
  route: Route;
  traveledMeters: number;
  speedKmh: number;
  hold: boolean;
};

export function RouteVideoPlayer({ route, traveledMeters, speedKmh, hold, initialTime = 0, onSyncSample }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef<Frame>({ route, traveledMeters, speedKmh, hold });
  const seeking = useRef(false);
  const lastReport = useRef(0);
  const onSyncRef = useRef(onSyncSample);
  const [videoReady, setVideoReady] = useState(false);
  frame.current = { route, traveledMeters, speedKmh, hold };
  onSyncRef.current = onSyncSample;

  useEffect(() => {
    setVideoReady(false);
  }, [route.id]);

  useEffect(() => {
    const video = videoRef.current;
    const time = initialTime;
    if (!video || time <= 0.2) return;
    const seek = () => {
      if (Math.abs(video.currentTime - time) > 0.3) video.currentTime = time;
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [initialTime, route.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const output = new LocalVideoOutput(video);
    const onSeeked = () => {
      seeking.current = false;
    };
    video.addEventListener('seeked', onSeeked);
    let raf = 0;
    let lastCommand = 'none';
    const tick = () => {
      const current = frame.current;
      const element = videoRef.current;
      if (element && element.readyState >= 2 && !seeking.current) {
        const command = planVideoSync({
          traveledMeters: current.traveledMeters,
          totalDistanceMeters: current.route.totalDistanceMeters,
          videoDurationSeconds: current.route.videoDurationSeconds,
          referenceSpeedKmh: current.route.referenceSpeedKmh,
          currentSpeedKmh: current.hold ? 0 : current.speedKmh,
          currentVideoTime: element.currentTime,
        });
        lastCommand = command.type;
        if (command.type === 'pause') {
          if (!element.paused) void output.pause();
        } else if (command.type === 'seek') {
          seeking.current = true;
          void output.setPlaybackRate(command.playbackRate);
          if (Math.abs(element.currentTime - command.timeSeconds) > 0.05) {
            void output.seek(command.timeSeconds);
          } else {
            seeking.current = false;
          }
          if (element.paused) void output.play().catch(() => undefined);
        } else {
          if (Math.abs(element.playbackRate - command.playbackRate) > 0.03) {
            void output.setPlaybackRate(command.playbackRate);
          }
          if (element.paused) void output.play().catch(() => undefined);
        }
      }
      const now = performance.now();
      if (onSyncRef.current && element && now - lastReport.current > 500) {
        lastReport.current = now;
        const target = targetVideoTime(
          routeProgress(current.traveledMeters, current.route.totalDistanceMeters),
          current.route.videoDurationSeconds,
        );
        const currentTime = element.currentTime || 0;
        onSyncRef.current({
          output: 'local',
          state: output.getState(),
          currentTime,
          targetTime: target,
          drift: target - currentTime,
          lastCorrection: lastCommand,
          castState: 'idle',
        });
      }
      drawScene(canvasRef.current, current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('seeked', onSeeked);
      void output.destroy();
    };
  }, []);

  const progress = routeProgress(traveledMeters, route.totalDistanceMeters);

  return (
    <div className="route-video relative h-full min-h-[42vh] overflow-hidden bg-ink">
      <video
        ref={videoRef}
        key={route.id}
        className={videoReady ? 'h-full w-full object-cover' : 'hidden'}
        src={route.videoUrl}
        muted
        playsInline
        preload="metadata"
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoReady(false)}
      />
      <canvas
        ref={canvasRef}
        className={videoReady ? 'hidden' : 'h-full w-full'}
        aria-hidden={videoReady}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink/80 to-transparent px-4 py-3">
        <div>
          <p className="font-metric text-4xl leading-none">{route.name}</p>
          <p className="text-sm text-mist">
            {formatDistanceKm(Math.min(traveledMeters, route.totalDistanceMeters))} /{' '}
            {formatDistanceKm(route.totalDistanceMeters)} km
          </p>
        </div>
        {videoReady ? null : (
          <p className="max-w-40 text-right text-xs leading-5 text-mist">Synced preview. Add an MP4 to replace it.</p>
        )}
      </div>
      {progress >= 1 ? (
        <p className="absolute left-4 top-4 rounded-sm bg-ink/70 px-2 py-1 text-sm text-paper">End of route</p>
      ) : null}
    </div>
  );
}

function drawScene(canvas: HTMLCanvasElement | null, frameState: Frame) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  const width = parent?.clientWidth ?? 360;
  const height = parent?.clientHeight ?? 240;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  const palette = palettes[frameState.route.id] ?? palettes.lakeside;
  const progress = routeProgress(frameState.traveledMeters, frameState.route.totalDistanceMeters);
  context.fillStyle = palette.sky;
  context.fillRect(0, 0, width, height);
  const shift = progress * width * 2;
  drawRidge(context, width, height * 0.42, 70, palette.hill, shift * 0.3);
  drawRidge(context, width, height * 0.58, 90, palette.near, shift * 0.7);
  context.fillStyle = palette.road;
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(width * 0.38, height * 0.62);
  context.lineTo(width * 0.62, height * 0.62);
  context.lineTo(width, height);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(243,239,228,0.45)';
  context.setLineDash([18, 16]);
  context.lineDashOffset = -shift;
  context.beginPath();
  context.moveTo(width / 2, height * 0.62);
  context.lineTo(width / 2, height);
  context.stroke();
  context.setLineDash([]);
}

function drawRidge(
  context: CanvasRenderingContext2D,
  width: number,
  baseline: number,
  amplitude: number,
  color: string,
  shift: number,
) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, baseline);
  for (let x = 0; x <= width; x += 12) {
    const y = baseline - Math.sin((x + shift) / 90) * amplitude * 0.35 - Math.sin((x + shift) / 40) * 10;
    context.lineTo(x, y);
  }
  context.lineTo(width, baseline + 160);
  context.lineTo(0, baseline + 160);
  context.closePath();
  context.fill();
}
