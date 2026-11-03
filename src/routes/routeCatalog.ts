import { demoRoutes } from './demoRoutes';
import type { Route } from './routeTypes';
import { youtubeWalks } from '../youtube/youtubeWalks';

let userRoutes: Route[] = [];

export function replaceUserRoutes(routes: Route[]) {
  userRoutes = routes;
}

export function listRoutes(): Route[] {
  return [...userRoutes, ...youtubeWalks, ...demoRoutes];
}

export function getRouteById(id: string): Route | undefined {
  return userRoutes.find((route) => route.id === id) ?? youtubeWalks.find((route) => route.id === id) ?? demoRoutes.find((route) => route.id === id);
}
