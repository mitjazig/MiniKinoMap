import { logger } from '../logging/logger';
import type { RouteMedia, VideoOutput, VideoOutputState } from '../video/types';
import { isYouTubeVideoId } from './parseYouTubeUrl';
import { loadYouTubeIframeApi, type YouTubePlayer } from './YouTubeApiLoader';
import { youtubeErrorMessage } from './youtubeErrors';

export type YouTubeDebugState = {
  videoId: string;
  playerState: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  availablePlaybackRates: number[];
  routeSync: boolean;
  targetTime: number;
  driftSeconds: number;
  lastSeek: number | null;
  lastPlayerError: string | null;
  lastPlayerErrorCode: number | null;
};

export function emptyYouTubeDebug(): YouTubeDebugState {
  return {
    videoId: '',
    playerState: 'idle',
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    availablePlaybackRates: [],
    routeSync: false,
    targetTime: 0,
    driftSeconds: 0,
    lastSeek: null,
    lastPlayerError: null,
    lastPlayerErrorCode: null,
  };
}

/**
 * Official IFrame Player API. The host element is replaced by YouTube's iframe.
 * This class never writes raw HTML from a user URL.
 */
export class YouTubeVideoOutput implements VideoOutput {
  readonly id = 'youtube' as const;
  capabilities = { seek: true, playbackRate: false };

  private player: YouTubePlayer | null = null;
  private state: VideoOutputState = 'idle';
  private videoId = '';
  private duration = 0;
  private currentTime = 0;
  private playbackRate = 1;
  private availableRates: number[] = [];
  private error: string | null = null;
  private errorCode: number | null = null;
  private lastSeek: number | null = null;
  private ready: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;

  constructor(private host: HTMLElement | null = null) {}

  attach(host: HTMLElement) {
    this.host = host;
  }

  async load(media: RouteMedia): Promise<void> {
    if (media.type !== 'youtube') throw new Error('YouTube output can only load a YouTube video.');
    if (!isYouTubeVideoId(media.videoId)) {
      this.fail(2);
      throw new Error(this.error ?? 'Invalid video');
    }
    if (!this.host) throw new Error('YouTube player has no place to mount.');
    const api = await loadYouTubeIframeApi();
    this.destroyPlayer();
    this.videoId = media.videoId;
    this.error = null;
    this.errorCode = null;
    this.state = 'loading';
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.player = new api.Player(this.host, {
      videoId: media.videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        playsinline: 1,
        rel: 0,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      },
      events: {
        onReady: (event) => {
          this.player = event.target;
          this.readRates();
          this.duration = safeNumber(event.target.getDuration());
          this.state = 'ready';
          this.resolveReady?.();
          logger.info('youtube', `Player ready ${media.videoId}`);
        },
        onStateChange: (event) => {
          this.state = mapPlayerState(event.data);
          this.currentTime = safeNumber(event.target.getCurrentTime());
          this.duration = safeNumber(event.target.getDuration()) || this.duration;
        },
        onError: (event) => {
          this.fail(event.data);
          this.resolveReady?.();
        },
      },
    });
    await this.ready;
    if (this.error) throw new Error(this.error);
  }

  async play(): Promise<void> {
    this.player?.playVideo();
    if (this.state !== 'error') this.state = 'playing';
  }

  async pause(): Promise<void> {
    this.player?.pauseVideo();
    if (this.state !== 'error') this.state = 'paused';
  }

  async seek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds)) return;
    const time = Math.max(0, seconds);
    this.player?.seekTo(time, true);
    this.currentTime = time;
    this.lastSeek = time;
    logger.info('youtube', `Seek ${time.toFixed(1)}s`);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (!this.capabilities.playbackRate || !this.player) return;
    const nearest = this.availableRates.reduce((best, item) =>
      Math.abs(item - rate) < Math.abs(best - rate) ? item : best,
    );
    if (!Number.isFinite(nearest)) return;
    this.player.setPlaybackRate(nearest);
    this.playbackRate = nearest;
  }

  getCurrentTime(): number {
    const remote = this.player ? safeNumber(this.player.getCurrentTime()) : 0;
    if (remote > 0) this.currentTime = remote;
    return this.currentTime;
  }

  getDuration(): number {
    const remote = this.player ? safeNumber(this.player.getDuration()) : 0;
    if (remote > 0) this.duration = remote;
    return this.duration;
  }

  getState(): VideoOutputState {
    return this.state;
  }

  getDebug(): YouTubeDebugState {
    return {
      videoId: this.videoId,
      playerState: this.state,
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      playbackRate: this.playbackRate,
      availablePlaybackRates: this.availableRates,
      routeSync: false,
      targetTime: 0,
      driftSeconds: 0,
      lastSeek: this.lastSeek,
      lastPlayerError: this.error,
      lastPlayerErrorCode: this.errorCode,
    };
  }

  async destroy(): Promise<void> {
    this.destroyPlayer();
    this.state = 'idle';
  }

  private readRates() {
    const rates = this.player?.getAvailablePlaybackRates?.() ?? [];
    this.availableRates = rates.filter((rate) => Number.isFinite(rate) && rate > 0);
    this.playbackRate = this.player ? safeNumber(this.player.getPlaybackRate()) || 1 : 1;
    const canChange = this.availableRates.some((rate) => Math.abs(rate - 1) > 0.01);
    this.capabilities = { seek: true, playbackRate: canChange };
  }

  private fail(code: number) {
    this.errorCode = code;
    this.error = youtubeErrorMessage(code);
    this.state = 'error';
    logger.error('youtube', `${this.error} (${code})`);
  }

  private destroyPlayer() {
    try {
      this.player?.destroy();
    } catch {
      // The iframe may already be gone.
    }
    this.player = null;
    this.resolveReady?.();
    this.resolveReady = null;
  }
}

function mapPlayerState(code: number): VideoOutputState {
  if (code === 1) return 'playing';
  if (code === 2 || code === 0) return 'paused';
  if (code === 3 || code === -1) return 'loading';
  if (code === 5) return 'ready';
  return 'ready';
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
