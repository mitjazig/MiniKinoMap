import type { RouteMedia, VideoOutput, VideoOutputState } from './types';

/** The existing HTML5 player, behind VideoOutput. Sync policy stays in the route player. */
export class LocalVideoOutput implements VideoOutput {
  readonly id = 'local' as const;
  readonly capabilities = { seek: true, playbackRate: true };

  constructor(private readonly video: HTMLVideoElement) {}

  async load(media: RouteMedia): Promise<void> {
    if (media.type !== 'local') throw new Error('Local video output cannot play this media.');
    if (this.video.getAttribute('src') !== media.url) {
      this.video.src = media.url;
      this.video.load();
    }
  }

  async play(): Promise<void> {
    await this.video.play();
  }

  async pause(): Promise<void> {
    this.video.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds)) return;
    this.video.currentTime = Math.max(0, seconds);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.video.playbackRate = rate;
  }

  getCurrentTime(): number {
    return this.video.currentTime || 0;
  }

  getState(): VideoOutputState {
    if (this.video.error) return 'error';
    if (this.video.readyState < 2) return this.video.src ? 'loading' : 'idle';
    return this.video.paused ? 'paused' : 'playing';
  }

  async destroy(): Promise<void> {
    this.video.pause();
  }
}
