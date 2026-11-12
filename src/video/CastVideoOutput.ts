import { logger } from '../logging/logger';
import { CAST_UNAVAILABLE_MESSAGE, CAST_URL_MESSAGE, isCastAccessibleUrl } from './castAccess';
import { castFramework, chromeCast, configureCast, loadCastFramework, type CastContext, type CastSession, type RemoteMedia } from './loadCastFramework';
import type { RouteMedia, VideoOutput, VideoOutputState } from './types';

export type CastSessionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export type CastStatus = {
  sessionState: CastSessionState;
  deviceName: string;
  message: string | null;
  currentTime: number;
  outputState: VideoOutputState;
  playbackRateSupported: boolean;
};

/**
 * Google Cast sender using the default media receiver and the standard device chooser.
 * No receiver app id is hardcoded beyond the SDK's default media receiver.
 */
export class CastVideoOutput implements VideoOutput {
  readonly id = 'cast' as const;
  capabilities = { seek: true, playbackRate: false };

  private session: CastSession | null = null;
  private media: RemoteMedia | null = null;
  private bound = false;
  private ignoreNextEnd = false;
  private sessionState: CastSessionState = 'idle';
  private outputState: VideoOutputState = 'idle';
  private deviceName = '';
  private message: string | null = null;
  private currentTime = 0;
  private statusListeners = new Set<(status: CastStatus) => void>();
  private endedListeners = new Set<(reason: string | null) => void>();

  async requestSession(): Promise<void> {
    logger.info('cast', 'Cast requested');
    const ready = await loadCastFramework();
    const framework = castFramework();
    if (!ready || !framework || !configureCast()) {
      logger.warn('cast', `Cast SDK not ready (loaded ${ready}, framework ${Boolean(framework)})`);
      this.message = CAST_UNAVAILABLE_MESSAGE;
      this.outputState = 'error';
      this.emit();
      throw new Error(CAST_UNAVAILABLE_MESSAGE);
    }
    const context = framework.CastContext.getInstance();
    this.bind(context);
    logger.info('cast', `Cast state before chooser: ${context.getCastState?.() ?? 'unknown'}`);
    this.sessionState = 'connecting';
    this.message = 'Looking for Chromecast…';
    this.emit();
    try {
      await withTimeout(context.requestSession(), CHOOSER_TIMEOUT_MS);
    } catch (error) {
      this.sessionState = 'disconnected';
      this.outputState = 'idle';
      const message = castErrorMessage(error);
      logger.warn('cast', `Cast request failed: ${describeCastError(error)}`);
      this.message = message;
      this.emit();
      throw new Error(message);
    }
    const session = context.getCurrentSession();
    if (!session) {
      this.sessionState = 'disconnected';
      this.message = 'Cast session did not start.';
      this.emit();
      throw new Error(this.message);
    }
    this.attach(session);
    logger.info('cast', `Cast session started: ${this.deviceName || 'TV'}`);
  }

  async load(media: RouteMedia): Promise<void> {
    if (media.type !== 'local') {
      this.message = 'This video output cannot play a YouTube route.';
      this.outputState = 'error';
      this.emit();
      throw new Error(this.message);
    }
    if (media.castCompatible === false || !isCastAccessibleUrl(media.url)) {
      this.message = CAST_URL_MESSAGE;
      this.outputState = 'error';
      this.emit();
      throw new Error(CAST_URL_MESSAGE);
    }
    const session = this.session;
    const chromeMedia = chromeCast()?.media;
    if (!session?.loadMedia || !chromeMedia?.MediaInfo || !chromeMedia.LoadRequest) {
      this.message = CAST_UNAVAILABLE_MESSAGE;
      this.outputState = 'error';
      this.emit();
      throw new Error(CAST_UNAVAILABLE_MESSAGE);
    }
    const info = new chromeMedia.MediaInfo(media.url, media.contentType ?? 'video/mp4');
    if (chromeMedia.GenericMediaMetadata) {
      const metadata = new chromeMedia.GenericMediaMetadata();
      metadata.title = media.title ?? 'Route';
      info.metadata = metadata;
    }
    this.outputState = 'loading';
    this.message = null;
    this.emit();
    try {
      await session.loadMedia(new chromeMedia.LoadRequest(info));
    } catch (error) {
      this.outputState = 'error';
      this.message = error instanceof Error ? error.message : 'The TV rejected this video.';
      this.emit();
      logger.error('cast', this.message);
      throw new Error(this.message);
    }
    this.media = session.getMediaSession?.() ?? null;
    this.detectCapabilities();
    this.watchMedia();
    this.outputState = 'ready';
    this.emit();
    logger.info('cast', `Cast media loaded: ${media.title ?? media.url}`);
  }

  async play(): Promise<void> {
    await this.media?.play?.();
    this.outputState = 'playing';
    this.emit();
  }

  async pause(): Promise<void> {
    await this.media?.pause?.();
    this.outputState = 'paused';
    this.emit();
  }

  async seek(seconds: number): Promise<void> {
    const SeekRequest = chromeCast()?.media?.SeekRequest;
    if (!this.media?.seek || !SeekRequest) {
      logger.warn('cast', 'Cast seek is not available on this session.');
      return;
    }
    const request = new SeekRequest();
    request.currentTime = Math.max(0, seconds);
    await this.media.seek(request);
    this.currentTime = request.currentTime;
    this.emit();
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (!this.capabilities.playbackRate || !this.media || !Number.isFinite(rate)) return;
    try {
      this.media.playbackRate = rate;
    } catch (error) {
      this.capabilities = { seek: true, playbackRate: false };
      logger.warn('cast', error instanceof Error ? error.message : 'Playback rate was rejected.');
    }
  }

  getCurrentTime(): number {
    const remote = this.media?.currentTime;
    if (typeof remote === 'number' && Number.isFinite(remote)) this.currentTime = remote;
    return this.currentTime;
  }

  getState(): VideoOutputState {
    return this.outputState;
  }

  async destroy(): Promise<void> {
    await this.stop();
  }

  async stop(): Promise<void> {
    this.ignoreNextEnd = true;
    const session = this.session;
    this.session = null;
    this.media = null;
    try {
      session?.endSession?.(true);
    } catch (error) {
      logger.warn('cast', error instanceof Error ? error.message : 'Could not end the cast session.');
    }
    this.sessionState = 'disconnected';
    this.outputState = 'idle';
    this.message = null;
    this.emit();
    logger.info('cast', 'Cast session stopped');
  }

  getDeviceName(): string {
    return this.deviceName;
  }

  getStatus(): CastStatus {
    return {
      sessionState: this.sessionState,
      deviceName: this.deviceName,
      message: this.message,
      currentTime: this.getCurrentTime(),
      outputState: this.outputState,
      playbackRateSupported: this.capabilities.playbackRate,
    };
  }

  subscribe(listener: (status: CastStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  onSessionEnded(listener: (reason: string | null) => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  private bind(context: CastContext) {
    if (this.bound) return;
    this.bound = true;
    const framework = castFramework();
    const type = framework?.CastContextEventType?.SESSION_STATE_CHANGED ?? 'sessionstatechanged';
    const ended = framework?.SessionState?.SESSION_ENDED ?? 'SESSION_ENDED';
    context.addEventListener(type, (event) => {
      if (event.sessionState === ended) {
        this.handleEnded();
        return;
      }
      const current = context.getCurrentSession();
      if (current) this.attach(current);
    });
  }

  private attach(session: CastSession) {
    this.session = session;
    this.deviceName = session.getCastDevice?.().friendlyName?.trim() || 'Chromecast';
    this.media = session.getMediaSession?.() ?? this.media;
    this.sessionState = 'connected';
    this.message = null;
    this.detectCapabilities();
    this.watchMedia();
    this.emit();
  }

  private handleEnded() {
    const unexpected = !this.ignoreNextEnd;
    this.ignoreNextEnd = false;
    this.session = null;
    this.media = null;
    this.sessionState = 'disconnected';
    this.outputState = 'idle';
    this.emit();
    const reason = unexpected ? 'TV disconnected' : null;
    if (reason) logger.warn('cast', reason);
    for (const listener of this.endedListeners) listener(reason);
  }

  private detectCapabilities() {
    const command = chromeCast()?.media?.MediaCommand?.PLAYBACK_RATE;
    const supported = command != null && this.media?.supportsCommand?.(command) === true;
    this.capabilities = { seek: true, playbackRate: supported };
  }

  private watchMedia() {
    this.media?.addUpdateListener?.(() => {
      this.getCurrentTime();
      const player = this.media?.playerState;
      if (player === 'PLAYING') this.outputState = 'playing';
      else if (player === 'PAUSED') this.outputState = 'paused';
      else if (player === 'BUFFERING') this.outputState = 'loading';
      else if (player === 'IDLE') this.outputState = 'ready';
      this.emit();
    });
  }

  private emit() {
    const status = this.getStatus();
    for (const listener of this.statusListeners) listener(status);
  }
}

const CHOOSER_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject('timeout'), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** CAF rejects with chrome.cast.ErrorCode strings, not Error objects. */
export function castErrorMessage(error: unknown): string {
  const code = describeCastError(error);
  if (code === 'cancel' || code === 'NotFoundError' || code === 'AbortError') return 'Cast device chooser was closed.';
  if (code === 'receiver_unavailable') {
    return 'No Chromecast found. Put the phone on the same Wi-Fi as the Chromecast and allow Chrome to find nearby devices.';
  }
  if (code === 'timeout') return 'The Chromecast did not answer. Restart it and try again.';
  if (code === 'session_error') return 'The Chromecast could not open the player. Restart it and try again.';
  if (code === 'NotAllowedError' || code === 'InvalidStateError') return 'Tap Cast again. Chrome only opens the device list right after a tap.';
  if (code === 'api_not_initialized' || code === 'extension_missing') return CAST_UNAVAILABLE_MESSAGE;
  return `Cast failed: ${code}`;
}

function describeCastError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof DOMException) return error.name;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'code' in error) return String((error as { code: unknown }).code);
  return 'unknown';
}
