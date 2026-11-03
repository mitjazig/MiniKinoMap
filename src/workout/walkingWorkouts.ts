export type WalkSegment = {
  seconds: number;
  speedKmh: number;
  inclinePercent: number;
};

export type WalkingWorkout = {
  id: string;
  name: string;
  summary: string;
  segments: WalkSegment[];
};

export const FREE_WALK: WalkingWorkout = {
  id: 'free',
  name: 'Free Walk',
  summary: 'You choose the speed. The route is only what you watch.',
  segments: [],
};

const minute = 60;

export const walkingWorkouts: WalkingWorkout[] = [
  FREE_WALK,
  {
    id: 'easy-walk-30',
    name: 'Easy Walk 30',
    summary: 'A flat half hour at an easy walking pace.',
    segments: [
      { seconds: 5 * minute, speedKmh: 3.5, inclinePercent: 0 },
      { seconds: 20 * minute, speedKmh: 4.5, inclinePercent: 1 },
      { seconds: 5 * minute, speedKmh: 3.5, inclinePercent: 0 },
    ],
  },
  {
    id: 'mountain-walk-30',
    name: 'Mountain Walk 30',
    summary: 'A steady hike that climbs, then eases off.',
    segments: [
      { seconds: 5 * minute, speedKmh: 4, inclinePercent: 1 },
      { seconds: 5 * minute, speedKmh: 4.2, inclinePercent: 3 },
      { seconds: 5 * minute, speedKmh: 4, inclinePercent: 5 },
      { seconds: 5 * minute, speedKmh: 3.8, inclinePercent: 7 },
      { seconds: 5 * minute, speedKmh: 4, inclinePercent: 3 },
      { seconds: 5 * minute, speedKmh: 3.5, inclinePercent: 0 },
    ],
  },
  {
    id: 'alpine-endurance-45',
    name: 'Alpine Endurance 45',
    summary: 'Easy start, rolling hills, then a cooldown.',
    segments: [
      { seconds: 10 * minute, speedKmh: 4, inclinePercent: 1 },
      { seconds: 5 * minute, speedKmh: 4.2, inclinePercent: 2 },
      { seconds: 5 * minute, speedKmh: 4.2, inclinePercent: 4 },
      { seconds: 5 * minute, speedKmh: 4, inclinePercent: 6 },
      { seconds: 5 * minute, speedKmh: 4.2, inclinePercent: 4 },
      { seconds: 5 * minute, speedKmh: 4.2, inclinePercent: 2 },
      { seconds: 10 * minute, speedKmh: 3.5, inclinePercent: 0 },
    ],
  },
  {
    id: 'hill-intervals',
    name: 'Hill Intervals',
    summary: 'Warm up, six hills, then walk it down.',
    segments: [
      { seconds: 5 * minute, speedKmh: 4, inclinePercent: 1 },
      ...Array.from({ length: 6 }, () => [
        { seconds: 2 * minute, speedKmh: 4, inclinePercent: 6 },
        { seconds: 2 * minute, speedKmh: 4.2, inclinePercent: 1 },
      ]).flat(),
      { seconds: 5 * minute, speedKmh: 3.5, inclinePercent: 0 },
    ],
  },
];

export function getWalkingWorkout(id: string | null | undefined): WalkingWorkout {
  return walkingWorkouts.find((item) => item.id === id) ?? FREE_WALK;
}

export function workoutDurationSeconds(workout: WalkingWorkout): number {
  return workout.segments.reduce((sum, segment) => sum + segment.seconds, 0);
}

export function segmentAt(
  segments: WalkSegment[],
  elapsedSeconds: number,
): { index: number; segment: WalkSegment; remainingSeconds: number } | null {
  let cursor = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const end = cursor + segment.seconds;
    if (elapsedSeconds < end) {
      return { index, segment, remainingSeconds: end - elapsedSeconds };
    }
    cursor = end;
  }
  return null;
}
