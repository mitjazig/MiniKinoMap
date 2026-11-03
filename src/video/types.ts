export type VideoOutputId = 'local' | 'cast' | 'youtube';

export type VideoOutputState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export type LocalRouteMedia = {
  type: 'local';
  url: string;
  contentType?: string;
  title?: string;
  castCompatible?: boolean;
};

export type YouTubeRouteMedia = {
  type: 'youtube';
  videoId: string;
  originalUrl?: string;
  title?: string;
};

export type RouteMedia = LocalRouteMedia | YouTubeRouteMedia;

export type VideoOutputCapabilities = {
  seek: boolean;
  playbackRate: boolean;
};

/**
 * Where a route video is drawn. Local HTML video and Chromecast both implement this.
 * A future custom receiver can sit behind the same calls.
 */
export interface VideoOutput {
  readonly id: VideoOutputId;
  readonly capabilities: VideoOutputCapabilities;
  load(media: RouteMedia): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setPlaybackRate?(rate: number): Promise<void>;
  getCurrentTime(): number | Promise<number>;
  getState(): VideoOutputState;
  destroy(): Promise<void>;
}

export type VideoDebugSnapshot = {
  output: VideoOutputId;
  state: string;
  currentTime: number;
  targetTime: number;
  drift: number;
  lastCorrection: string;
  castState: string;
};

export function emptyVideoDebug(): VideoDebugSnapshot {
  return {
    output: 'local',
    state: 'idle',
    currentTime: 0,
    targetTime: 0,
    drift: 0,
    lastCorrection: 'none',
    castState: 'idle',
  };
}
