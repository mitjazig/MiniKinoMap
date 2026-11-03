import type { Route } from './routeTypes';
import type { RouteMedia } from '../video/types';

export function mediaOf(route: Route): RouteMedia {
  if (route.media?.type === 'youtube' || route.media?.type === 'local') return route.media;
  return {
    type: 'local',
    url: route.videoUrl,
    title: route.name,
    castCompatible: route.castCompatible,
  };
}

export function isYouTubeRoute(route: Route): boolean {
  return mediaOf(route).type === 'youtube';
}
