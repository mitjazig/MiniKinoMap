/** Leave the receiver alone when it is already this close to the route clock. */
export const CAST_IGNORE_DRIFT_SECONDS = 2;
/** Above this, seek. Between the two thresholds, wait or nudge playback rate. */
export const CAST_SEEK_DRIFT_SECONDS = 5;

export type CastCorrection = 'none' | 'hold' | 'seek';

/**
 * Decide one Cast correction. This does not talk to the Cast API.
 * Small drift is ignored. Medium drift waits, or nudges playback rate when the receiver allows it.
 * Large drift seeks.
 */
export function planCastCorrection(
  currentSeconds: number,
  targetSeconds: number,
  playbackRateSupported: boolean,
): CastCorrection {
  if (!Number.isFinite(currentSeconds) || !Number.isFinite(targetSeconds)) return 'none';
  const drift = Math.abs(targetSeconds - currentSeconds);
  if (drift < CAST_IGNORE_DRIFT_SECONDS) return 'none';
  if (drift <= CAST_SEEK_DRIFT_SECONDS) return playbackRateSupported ? 'hold' : 'none';
  return 'seek';
}

/** Remembers the last seek so a stuck receiver is not seeked on every sample. */
export class CastSyncController {
  private lastSeekAt = 0;
  private lastCorrection: CastCorrection = 'none';

  constructor(private readonly seekCooldownMs = 3000) {}

  decide(currentSeconds: number, targetSeconds: number, playbackRateSupported: boolean, now = Date.now()): CastCorrection {
    const planned = planCastCorrection(currentSeconds, targetSeconds, playbackRateSupported);
    this.lastCorrection = planned;
    if (planned === 'seek') {
      if (now - this.lastSeekAt < this.seekCooldownMs) return 'none';
      this.lastSeekAt = now;
    }
    return planned;
  }

  getLastCorrection(): CastCorrection {
    return this.lastCorrection;
  }
}
