import type { RouteMedia } from '../video/types';

export type RoutePoint = {
  distanceMeters: number;
  elevationMeters?: number;
  inclinePercent?: number;
};

export type RouteDifficulty = 'easy' | 'moderate' | 'hard';

/** distance = native MP4 sync. scenic = YouTube plays on its own. synced = distance mapped onto a clip window. */
export type RoutePlaybackMode = 'distance' | 'scenic' | 'synced';

export type Route = {
  id: string;
  name: string;
  description?: string;
  /** Kept for native MP4 routes. YouTube routes store the original page URL here, never raw iframe HTML. */
  videoUrl: string;
  media?: RouteMedia;
  playbackMode?: RoutePlaybackMode;
  /** False when the file is local to the phone and a Chromecast cannot open it. */
  castCompatible?: boolean;
  totalDistanceMeters: number;
  videoDurationSeconds: number;
  videoStartSeconds?: number;
  videoEndSeconds?: number;
  /** Virtual camera speed the video was recorded at. */
  referenceSpeedKmh: number;
  elevationProfile: RoutePoint[];
  difficulty?: RouteDifficulty;
  tags?: string[];
  createdAt?: string;
  userCreated?: boolean;
};
