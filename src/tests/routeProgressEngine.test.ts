import { describe, expect, it } from 'vitest';
import { planVideoSync, routeProgress, targetVideoTime } from '../routes/RouteProgressEngine';
import { inclineAtDistance } from '../routes/elevation';
import { getRouteById } from '../routes/demoRoutes';

const base = {
  traveledMeters: 2500,
  totalDistanceMeters: 5000,
  videoDurationSeconds: 1800,
  referenceSpeedKmh: 10,
  currentSpeedKmh: 10,
  currentVideoTime: 900,
};

describe('RouteProgressEngine', () => {
  it('maps distance onto the video timeline', () => {
    expect(routeProgress(2500, 5000)).toBeCloseTo(0.5, 5);
    expect(targetVideoTime(0.5, 1800)).toBe(900);
    expect(routeProgress(9000, 5000)).toBe(1);
  });

  it('pauses the video when the belt is stopped', () => {
    expect(planVideoSync({ ...base, currentSpeedKmh: 0 }).type).toBe('pause');
  });

  it('holds near 1x when speed matches the reference and the frame is in sync', () => {
    const command = planVideoSync(base);
    expect(command.type).toBe('play');
    if (command.type === 'play') expect(command.playbackRate).toBeCloseTo(1, 1);
  });

  it('seeks when the picture is far from the route position', () => {
    const command = planVideoSync({ ...base, currentVideoTime: 100 });
    expect(command.type).toBe('seek');
    if (command.type === 'seek') expect(command.timeSeconds).toBe(900);
  });

  it('clamps playback rate into 0.5–2', () => {
    const command = planVideoSync({ ...base, currentSpeedKmh: 40, currentVideoTime: 900 });
    expect(command.type).toBe('play');
    if (command.type === 'play') expect(command.playbackRate).toBeLessThanOrEqual(2);
  });

  it('reads the quarry pitch as about 10%', () => {
    const quarry = getRouteById('quarry');
    expect(quarry).toBeTruthy();
    expect(inclineAtDistance(quarry!.elevationProfile, 3400)).toBeCloseTo(10, 1);
  });
});
