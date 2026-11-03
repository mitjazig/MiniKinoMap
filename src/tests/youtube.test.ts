import { describe, expect, it } from 'vitest';
import { createVideoOutput } from '../video/createVideoOutput';
import { parseYouTubeUrl } from '../youtube/parseYouTubeUrl';
import {
  planYouTubePlayback,
  shouldPauseYouTube,
  StoppedBeltTimer,
  youtubeTargetTime,
} from '../youtube/youtubeSync';

const ID = 'M7lc1UVf-VE';

describe('parseYouTubeUrl', () => {
  it('reads a watch URL', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toEqual({ videoId: ID });
  });

  it('reads a youtu.be URL', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}`)).toEqual({ videoId: ID });
  });

  it('reads an embed URL', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}`)).toEqual({ videoId: ID });
  });

  it('reads a shorts URL', () => {
    expect(parseYouTubeUrl(`https://youtube.com/shorts/${ID}`)).toEqual({ videoId: ID });
  });

  it('rejects a page that is not a video', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/feed/trending')).toBeNull();
    expect(parseYouTubeUrl('not a url')).toBeNull();
    expect(parseYouTubeUrl('https://example.com/watch?v=' + ID)).toBeNull();
  });
});

describe('youtube route progress', () => {
  it('maps the halfway point onto the video window', () => {
    expect(
      youtubeTargetTime({
        distanceMeters: 2500,
        totalDistanceMeters: 5000,
        videoStartSeconds: 60,
        videoEndSeconds: 1860,
      }),
    ).toBe(960);
  });

  it('stays at the start before any distance and at the end after the route', () => {
    expect(
      youtubeTargetTime({
        distanceMeters: 0,
        totalDistanceMeters: 5000,
        videoStartSeconds: 60,
        videoEndSeconds: 1860,
      }),
    ).toBe(60);
    expect(
      youtubeTargetTime({
        distanceMeters: 9000,
        totalDistanceMeters: 5000,
        videoStartSeconds: 60,
        videoEndSeconds: 1860,
      }),
    ).toBe(1860);
  });
});

describe('standing still', () => {
  it('pauses only after the belt has been slow for two seconds', () => {
    expect(shouldPauseYouTube({ enabled: true, speedKmh: 0.1, stoppedForMs: 1999 })).toBe(false);
    expect(shouldPauseYouTube({ enabled: true, speedKmh: 0.1, stoppedForMs: 2000 })).toBe(true);
    expect(shouldPauseYouTube({ enabled: false, speedKmh: 0, stoppedForMs: 5000 })).toBe(false);
    expect(shouldPauseYouTube({ enabled: true, speedKmh: 4, stoppedForMs: 5000 })).toBe(false);
  });

  it('resets the stopped timer when walking resumes', () => {
    const timer = new StoppedBeltTimer();
    expect(timer.milliseconds(0.1, 1000)).toBe(0);
    expect(timer.milliseconds(0.1, 2500)).toBe(1500);
    expect(timer.milliseconds(4, 2600)).toBe(0);
    expect(timer.milliseconds(0.1, 4000)).toBe(0);
  });
});

describe('youtube drift', () => {
  const base = {
    mode: 'synced' as const,
    running: true,
    speedKmh: 4,
    stoppedForMs: 0,
    pauseWhenStopped: true,
    playbackRateSupported: true,
    availableRates: [0.75, 1, 1.25],
  };

  it('ignores drift under three seconds', () => {
    expect(planYouTubePlayback({ ...base, currentTime: 100, targetTime: 102 }).action).toBe('play');
  });

  it('seeks when drift is larger than eight seconds', () => {
    const plan = planYouTubePlayback({ ...base, currentTime: 100, targetTime: 120 });
    expect(plan).toEqual({ action: 'seek', timeSeconds: 120 });
  });

  it('holds instead of inventing a playback rate', () => {
    const plan = planYouTubePlayback({
      ...base,
      playbackRateSupported: false,
      availableRates: [1],
      currentTime: 100,
      targetTime: 105,
    });
    expect(plan).toEqual({ action: 'hold' });
  });
});

describe('createVideoOutput', () => {
  it('builds a YouTube output from youtube media and refuses local media without an element', () => {
    const youtube = createVideoOutput({ type: 'youtube', videoId: ID });
    expect(youtube.id).toBe('youtube');
    expect(youtube.capabilities.seek).toBe(true);
    expect(() => createVideoOutput({ type: 'local', url: '/videos/demo.mp4' })).toThrow(/video element/);
  });
});
