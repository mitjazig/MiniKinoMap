import { logger } from '../logging/logger';

export type YouTubePlayer = {
  loadVideoById: (videoId: string) => void;
  cueVideoById?: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates: () => number[];
  destroy: () => void;
};

export type YouTubePlayerOptions = {
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
    onError?: (event: { data: number; target: YouTubePlayer }) => void;
  };
};

export type YouTubeNamespace = {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YouTubeNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once and waits for the official ready callback. */
export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube player API is only available in a browser.'));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: YouTubeNamespace | null, error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (ok) resolve(ok);
      else {
        loading = null;
        reject(error ?? new Error('YouTube player API did not load.'));
      }
    };

    const timeout = window.setTimeout(() => {
      logger.error('youtube', 'YouTube player API did not load.');
      finish(null, new Error('YouTube player API did not load.'));
    }, 12000);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        // A previous hook must not block the player.
      }
      if (window.YT?.Player) finish(window.YT);
      else finish(null, new Error('YouTube player API did not load.'));
    };

    if (!document.querySelector('script[data-youtube-iframe]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframe = 'true';
      script.onerror = () => {
        logger.error('youtube', 'YouTube player script failed to load.');
        finish(null, new Error('YouTube player API did not load.'));
      };
      document.head.appendChild(script);
    }
  });

  return loading;
}
