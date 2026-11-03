import { describe, expect, it } from 'vitest';
import { transition } from '../workout/WorkoutStateMachine';

describe('workout state machine', () => {
  it('reaches ready only with a route and a connection', () => {
    expect(transition('idle', { type: 'CONTEXT', connected: true, hasRoute: false }).phase).toBe('idle');
    expect(transition('idle', { type: 'CONTEXT', connected: true, hasRoute: true }).phase).toBe('ready');
  });

  it('starts only from ready', () => {
    expect(transition('ready', { type: 'START' }).phase).toBe('running');
    const blocked = transition('idle', { type: 'START' });
    expect(blocked.phase).toBe('idle');
    expect(blocked.error).toBeTruthy();
  });

  it('refuses pause unless the run is in progress', () => {
    const paused = transition('ready', { type: 'PAUSE' });
    expect(paused.phase).toBe('ready');
    expect(paused.error).toMatch(/Pause/);
    expect(transition('running', { type: 'PAUSE' }).phase).toBe('paused');
  });

  it('refuses a second start while a run is active', () => {
    for (const phase of ['running', 'paused', 'connectionLost'] as const) {
      const result = transition(phase, { type: 'START' });
      expect(result.phase).toBe(phase);
      expect(result.error).toMatch(/already/);
    }
  });

  it('moves a live run to connectionLost and restores it as paused', () => {
    expect(transition('running', { type: 'CONNECTION_LOST' }).phase).toBe('connectionLost');
    expect(transition('connectionLost', { type: 'CONNECTION_RESTORED' }).phase).toBe('paused');
    expect(transition('connectionLost', { type: 'STOP' }).phase).toBe('finished');
  });

  it('does not resume from connectionLost', () => {
    const result = transition('connectionLost', { type: 'RESUME' });
    expect(result.phase).toBe('connectionLost');
    expect(result.error).toBeTruthy();
  });
});
