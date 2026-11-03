import type { Route, RoutePoint } from './routeTypes';
import { profileWithIncline } from './elevation';

const REFERENCE_KMH = 10;

function durationFor(distanceMeters: number): number {
  return distanceMeters / (REFERENCE_KMH / 3.6);
}

function route(
  id: string,
  name: string,
  description: string,
  videoFile: string,
  points: RoutePoint[],
): Route {
  const total = points[points.length - 1]?.distanceMeters ?? 0;
  return {
    id,
    name,
    description,
    videoUrl: `${import.meta.env.BASE_URL}videos/${videoFile}`,
    castCompatible: false,
    totalDistanceMeters: total,
    videoDurationSeconds: durationFor(total),
    referenceSpeedKmh: REFERENCE_KMH,
    elevationProfile: profileWithIncline(points),
  };
}

/**
 * Original demo routes. Drop an MP4 at the videoUrl path to replace the
 * generated preview. Nothing here is from Kinomap.
 */
export const demoRoutes: Route[] = [
  route(
    'lakeside',
    'Lakeside Path',
    'A flat gravel loop beside a reservoir. The grade barely leaves the deck.',
    'lakeside.mp4',
    [
      { distanceMeters: 0, elevationMeters: 18 },
      { distanceMeters: 800, elevationMeters: 22 },
      { distanceMeters: 1600, elevationMeters: 27 },
      { distanceMeters: 2500, elevationMeters: 24 },
      { distanceMeters: 3400, elevationMeters: 21 },
      { distanceMeters: 4200, elevationMeters: 19 },
      { distanceMeters: 5000, elevationMeters: 18 },
    ],
  ),
  route(
    'pine',
    'Pine Switchbacks',
    'Rolling forest road. Short rises, then a long false flat.',
    'pine.mp4',
    [
      { distanceMeters: 0, elevationMeters: 90 },
      { distanceMeters: 1000, elevationMeters: 110 },
      { distanceMeters: 1800, elevationMeters: 102 },
      { distanceMeters: 2800, elevationMeters: 140 },
      { distanceMeters: 4000, elevationMeters: 128 },
      { distanceMeters: 5200, elevationMeters: 156 },
      { distanceMeters: 6600, elevationMeters: 148 },
      { distanceMeters: 8000, elevationMeters: 160 },
    ],
  ),
  route(
    'quarry',
    'Quarry Ridge',
    'A climb through an old limestone cut, with one pitch near 10%.',
    'quarry.mp4',
    [
      { distanceMeters: 0, elevationMeters: 210 },
      { distanceMeters: 1500, elevationMeters: 230 },
      { distanceMeters: 3000, elevationMeters: 250 },
      { distanceMeters: 3800, elevationMeters: 330 },
      { distanceMeters: 5000, elevationMeters: 348 },
      { distanceMeters: 7000, elevationMeters: 360 },
      { distanceMeters: 8500, elevationMeters: 340 },
      { distanceMeters: 10000, elevationMeters: 355 },
    ],
  ),
];

export function getRouteById(id: string): Route | undefined {
  return demoRoutes.find((item) => item.id === id);
}
