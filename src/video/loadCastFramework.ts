import { logger } from '../logging/logger';
import { CAST_UNAVAILABLE_MESSAGE } from './castAccess';

type CastUpdateEvent = { sessionState?: string };

export type RemoteMedia = {
  currentTime?: number;
  playbackRate?: number;
  playerState?: string;
  play?: () => Promise<void> | void;
  pause?: () => Promise<void> | void;
  seek?: (request: unknown) => Promise<void> | void;
  supportsCommand?: (command: number) => boolean;
  addUpdateListener?: (listener: (alive: boolean) => void) => void;
};

export type CastSession = {
  getCastDevice?: () => { friendlyName?: string };
  getMediaSession?: () => RemoteMedia | null;
  loadMedia?: (request: unknown) => Promise<unknown>;
  endSession?: (stopCasting: boolean) => void;
};

export type CastContext = {
  setOptions: (options: Record<string, unknown>) => void;
  requestSession: () => Promise<void>;
  getCurrentSession: () => CastSession | null;
  addEventListener: (type: string, listener: (event: CastUpdateEvent) => void) => void;
  endCurrentSession?: (stopCasting: boolean) => void;
};

type CastFramework = {
  CastContext: { getInstance: () => CastContext };
  CastContextEventType?: { SESSION_STATE_CHANGED?: string };
  SessionState?: { SESSION_ENDED?: string };
};

type ChromeCastMedia = {
  DEFAULT_MEDIA_RECEIVER_APP_ID?: string;
  MediaInfo?: new (url: string, contentType: string) => { metadata?: { title?: string } };
  GenericMediaMetadata?: new () => { title?: string };
  LoadRequest?: new (media: unknown) => unknown;
  SeekRequest?: new () => { currentTime: number };
  MediaCommand?: { PLAYBACK_RATE?: number };
};

type ChromeCast = {
  AutoJoinPolicy?: { ORIGIN_SCOPED?: string };
  media?: ChromeCastMedia;
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: { framework?: CastFramework };
    chrome?: { cast?: ChromeCast };
  }
}

let loading: Promise<boolean> | null = null;
let configured = false;

export function castFramework(): CastFramework | null {
  if (typeof window === 'undefined') return null;
  return window.cast?.framework ?? null;
}

export function chromeCast(): ChromeCast | null {
  if (typeof window === 'undefined') return null;
  return window.chrome?.cast ?? null;
}

/** Loads the Cast sender SDK once. Safe to call when the browser has no Cast support. */
export function loadCastFramework(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  if (window.cast?.framework && window.chrome?.cast?.media) {
    configureCast();
    return Promise.resolve(true);
  }
  if (loading) return loading;

  loading = new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) configureCast();
      resolve(ok);
    };

    const previous = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (available: boolean) => {
      try {
        previous?.(available);
      } catch {
        // Ignore a previous hook.
      }
      finish(Boolean(available && window.cast?.framework));
    };

    if (!document.querySelector('script[data-cast-sender]')) {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      script.async = true;
      script.dataset.castSender = 'true';
      script.onerror = () => {
        logger.error('cast', CAST_UNAVAILABLE_MESSAGE);
        finish(false);
      };
      document.head.appendChild(script);
    }

    window.setTimeout(() => finish(Boolean(window.cast?.framework && window.chrome?.cast?.media)), 8000);
  });

  return loading;
}

function configureCast() {
  if (configured) return;
  const framework = castFramework();
  const media = chromeCast()?.media;
  const appId = media?.DEFAULT_MEDIA_RECEIVER_APP_ID;
  if (!framework || !appId) return;
  try {
    framework.CastContext.getInstance().setOptions({
      receiverApplicationId: appId,
      autoJoinPolicy: chromeCast()?.AutoJoinPolicy?.ORIGIN_SCOPED ?? 'origin_scoped',
    });
    configured = true;
    logger.info('cast', 'Cast framework ready');
  } catch (error) {
    logger.warn('cast', error instanceof Error ? error.message : 'Cast options were rejected');
  }
}
