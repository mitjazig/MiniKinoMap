import { describe, expect, it } from 'vitest';
import { planCastCorrection } from '../video/CastSyncController';
import { isCastAccessibleUrl, resolveCastUrl } from '../video/castAccess';

describe('Cast synchronization', () => {
  it('ignores a one second drift', () => {
    expect(planCastCorrection(100, 101, false)).toBe('none');
    expect(planCastCorrection(100, 101, true)).toBe('none');
  });

  it('seeks when the drift is larger than five seconds', () => {
    expect(planCastCorrection(100, 108, false)).toBe('seek');
    expect(planCastCorrection(100, 108, true)).toBe('seek');
  });

  it('waits on a medium drift unless playback rate is supported', () => {
    expect(planCastCorrection(100, 103, false)).toBe('none');
    expect(planCastCorrection(100, 103, true)).toBe('hold');
  });
});

describe('Cast media URLs', () => {
  it('rejects files the TV cannot open', () => {
    expect(isCastAccessibleUrl('/videos/lakeside.mp4')).toBe(false);
    expect(isCastAccessibleUrl('blob:http://localhost/abc')).toBe(false);
    expect(isCastAccessibleUrl('http://localhost:5173/videos/a.mp4')).toBe(false);
    expect(isCastAccessibleUrl('http://127.0.0.1/a.mp4')).toBe(false);
    expect(isCastAccessibleUrl('https://cdn.example.com/route.mp4')).toBe(true);
  });

  it('uses a public test URL when the route file is local', () => {
    const blocked = resolveCastUrl('/videos/lakeside.mp4', false, '');
    expect(blocked.url).toBeNull();
    const override = resolveCastUrl('/videos/lakeside.mp4', false, 'https://cdn.example.com/route.mp4');
    expect(override.url).toBe('https://cdn.example.com/route.mp4');
  });
});
