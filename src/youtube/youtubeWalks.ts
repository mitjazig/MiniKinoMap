import type { Route, RouteDifficulty } from '../routes/routeTypes';
import { youTubeWatchUrl } from './parseYouTubeUrl';

/**
 * Replace demo videos with user-selected embeddable YouTube videos.
 * M7lc1UVf-VE is YouTube's own IFrame API sample, not a mountain film and not our content.
 */
export const YOUTUBE_PLACEHOLDER_ID = 'M7lc1UVf-VE';

function walk(input: {
  id: string;
  name: string;
  description: string;
  mode: 'scenic' | 'synced';
  difficulty: RouteDifficulty;
  tags: string[];
  distanceMeters?: number;
  videoStartSeconds?: number;
  videoEndSeconds?: number;
}): Route {
  const videoId = YOUTUBE_PLACEHOLDER_ID;
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    videoUrl: youTubeWatchUrl(videoId),
    media: { type: 'youtube', videoId, originalUrl: youTubeWatchUrl(videoId), title: input.name },
    playbackMode: input.mode,
    castCompatible: false,
    totalDistanceMeters: input.distanceMeters ?? 0,
    videoDurationSeconds:
      input.videoEndSeconds != null && input.videoStartSeconds != null
        ? Math.max(0, input.videoEndSeconds - input.videoStartSeconds)
        : 0,
    videoStartSeconds: input.videoStartSeconds,
    videoEndSeconds: input.videoEndSeconds,
    referenceSpeedKmh: 4.5,
    elevationProfile: [],
    difficulty: input.difficulty,
    tags: input.tags,
  };
}

export const youtubeWalks: Route[] = [
  walk({
    id: 'yt-dolomites',
    name: 'Dolomites Scenic Walk',
    description: 'Scenic placeholder. Replace it with an embeddable mountain walk you want to watch.',
    mode: 'scenic',
    difficulty: 'moderate',
    tags: ['mountain', 'dolomites', 'hiking', 'walking'],
  }),
  walk({
    id: 'yt-alps',
    name: 'Swiss Alps Walk',
    description: 'Scenic placeholder for an alpine walk. The video is not synced to distance.',
    mode: 'scenic',
    difficulty: 'moderate',
    tags: ['mountain', 'alps', 'hiking', 'walking'],
  }),
  walk({
    id: 'yt-trail',
    name: 'Mountain Trail Walk',
    description: 'Example of distance sync. Replace the video and set the real start, end, and distance.',
    mode: 'synced',
    difficulty: 'hard',
    tags: ['mountain', 'hiking', 'walking'],
    distanceMeters: 6200,
    videoStartSeconds: 30,
    videoEndSeconds: 2700,
  }),
];
