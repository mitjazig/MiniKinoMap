import { describe, expect, it } from 'vitest';
import { syncThroughOutput } from '../routes/RouteProgressEngine';
import type { VideoOutput, VideoOutputState } from '../video/types';
import { castErrorMessage } from '../video/CastVideoOutput';

class FakeOutput implements VideoOutput {
  calls: string[] = [];
  state: VideoOutputState = 'paused';

  constructor(
    readonly id: 'local' | 'cast',
    private time: number,
    readonly capabilities: { seek: boolean; playbackRate: boolean },
  ) {}

  async load(): Promise<void> {
    this.calls.push('load');
  }

  async play(): Promise<void> {
    this.calls.push('play');
    this.state = 'playing';
  }

  async pause(): Promise<void> {
    this.calls.push('pause');
    this.state = 'paused';
  }

  async seek(seconds: number): Promise<void> {
    this.calls.push(`seek:${seconds}`);
    this.time = seconds;
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.calls.push(`rate:${rate}`);
  }

  getCurrentTime(): number {
    return this.time;
  }

  getState(): VideoOutputState {
    return this.state;
  }

  async destroy(): Promise<void> {
    this.calls.push('destroy');
  }
}

describe('VideoOutput sync', () => {
  it('pauses a local output when the belt is stopped', async () => {
    const output = new FakeOutput('local', 10, { seek: true, playbackRate: true });
    const command = await syncThroughOutput(output, {
      traveledMeters: 100,
      totalDistanceMeters: 1000,
      videoDurationSeconds: 360,
      referenceSpeedKmh: 10,
      currentSpeedKmh: 0,
    });
    expect(command.type).toBe('pause');
    expect(output.calls).toContain('pause');
  });

  it('does not seek a cast output for a one second drift', async () => {
    const output = new FakeOutput('cast', 100, { seek: true, playbackRate: false });
    await syncThroughOutput(output, {
      traveledMeters: 1000,
      totalDistanceMeters: 1000,
      videoDurationSeconds: 101,
      referenceSpeedKmh: 10,
      currentSpeedKmh: 10,
    });
    expect(output.calls.some((call) => call.startsWith('seek:'))).toBe(false);
    expect(output.calls).toContain('play');
  });

  it('seeks a cast output when the drift is eight seconds', async () => {
    const output = new FakeOutput('cast', 100, { seek: true, playbackRate: false });
    const command = await syncThroughOutput(output, {
      traveledMeters: 1000,
      totalDistanceMeters: 1000,
      videoDurationSeconds: 108,
      referenceSpeedKmh: 10,
      currentSpeedKmh: 10,
    });
    expect(command.type).toBe('seek');
    expect(output.calls.some((call) => call.startsWith('seek:108'))).toBe(true);
  });
});

describe('castErrorMessage', () => {
  it('turns Cast SDK error codes into readable text', () => {
    expect(castErrorMessage('cancel')).toBe('Cast device chooser was closed.');
    expect(castErrorMessage('receiver_unavailable')).toMatch(/No Chromecast found/);
    expect(castErrorMessage(new DOMException('x', 'NotAllowedError'))).toMatch(/Tap Cast again/);
    expect(castErrorMessage({ code: 'weird' })).toBe('Cast failed: weird');
  });
});
