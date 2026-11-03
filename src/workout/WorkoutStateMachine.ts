export type WorkoutPhase =
  | 'idle'
  | 'ready'
  | 'running'
  | 'paused'
  | 'connectionLost'
  | 'finished';

export type WorkoutEvent =
  | { type: 'CONTEXT'; connected: boolean; hasRoute: boolean }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'RESET' }
  | { type: 'CONNECTION_LOST' }
  | { type: 'CONNECTION_RESTORED' };

export type TransitionResult = {
  phase: WorkoutPhase;
  error?: string;
};

export function isWorkoutActive(phase: WorkoutPhase): boolean {
  return phase === 'running' || phase === 'paused' || phase === 'connectionLost';
}

export function transition(phase: WorkoutPhase, event: WorkoutEvent): TransitionResult {
  switch (event.type) {
    case 'CONTEXT': {
      if (isWorkoutActive(phase) || phase === 'finished') return { phase };
      return { phase: event.connected && event.hasRoute ? 'ready' : 'idle' };
    }
    case 'START': {
      if (isWorkoutActive(phase)) {
        return { phase, error: 'A run is already in progress.' };
      }
      if (phase !== 'ready') {
        return {
          phase,
          error: 'Start is only available when a route is selected and the treadmill is connected.',
        };
      }
      return { phase: 'running' };
    }
    case 'PAUSE': {
      if (phase !== 'running') {
        return { phase, error: 'Pause is only available while the run is in progress.' };
      }
      return { phase: 'paused' };
    }
    case 'RESUME': {
      if (phase !== 'paused') {
        return { phase, error: 'Resume is only available while the run is paused.' };
      }
      return { phase: 'running' };
    }
    case 'STOP': {
      if (!isWorkoutActive(phase)) {
        return { phase, error: 'Stop is only available during a run.' };
      }
      return { phase: 'finished' };
    }
    case 'CONNECTION_LOST': {
      if (phase === 'running' || phase === 'paused') return { phase: 'connectionLost' };
      if (phase === 'ready') return { phase: 'idle' };
      return { phase };
    }
    case 'CONNECTION_RESTORED': {
      if (phase === 'connectionLost') return { phase: 'paused' };
      return { phase };
    }
    case 'RESET': {
      if (isWorkoutActive(phase)) {
        return { phase, error: 'Finish the current run before starting another.' };
      }
      return { phase: 'idle' };
    }
    default:
      return { phase };
  }
}
