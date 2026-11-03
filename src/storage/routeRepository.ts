import type { Route } from '../routes/routeTypes';
import { youTubeWatchUrl } from '../youtube/parseYouTubeUrl';
import { openRunscapeDb } from './database';
import type { SavedYouTubeRoute } from './savedRoute';

const STORE = 'routes';

export type { SavedYouTubeRoute };

export const routeRepository = {
  async list(): Promise<SavedYouTubeRoute[]> {
    const all = await (await openRunscapeDb()).getAll(STORE);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async get(id: string): Promise<SavedYouTubeRoute | undefined> {
    return (await openRunscapeDb()).get(STORE, id);
  },

  async save(record: SavedYouTubeRoute): Promise<void> {
    await (await openRunscapeDb()).put(STORE, record);
  },

  async remove(id: string): Promise<void> {
    await (await openRunscapeDb()).delete(STORE, id);
  },
};

export function savedRouteToRoute(saved: SavedYouTubeRoute): Route {
  const watchUrl = saved.originalUrl || youTubeWatchUrl(saved.videoId);
  const start = saved.videoStartSeconds;
  const end = saved.videoEndSeconds;
  return {
    id: saved.id,
    name: saved.name,
    description: 'Saved on this device.',
    videoUrl: watchUrl,
    media: { type: 'youtube', videoId: saved.videoId, originalUrl: watchUrl, title: saved.name },
    playbackMode: saved.mode === 'synced' ? 'synced' : 'scenic',
    castCompatible: false,
    totalDistanceMeters: saved.distanceMeters,
    videoDurationSeconds:
      start != null && end != null ? Math.max(0, end - start) : (saved.videoDurationSeconds ?? 0),
    videoStartSeconds: start,
    videoEndSeconds: end,
    referenceSpeedKmh: 4.5,
    elevationProfile: [],
    difficulty: saved.difficulty,
    tags: saved.tags,
    createdAt: saved.createdAt,
    userCreated: true,
  };
}
