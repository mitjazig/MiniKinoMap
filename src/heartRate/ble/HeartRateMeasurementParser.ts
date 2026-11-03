export type ParsedHeartRateMeasurement = {
  bpm: number;
  rrIntervalsMs: number[];
  contactDetected?: boolean;
  energyExpendedKj?: number;
  flags: number;
};

export type HeartRateParseResult =
  | { ok: true; value: ParsedHeartRateMeasurement }
  | { ok: false; error: string };

const FLAG_UINT16 = 0x01;
const FLAG_CONTACT_SUPPORTED = 0x02;
const FLAG_CONTACT_DETECTED = 0x04;
const FLAG_ENERGY = 0x08;
const FLAG_RR = 0x10;

/**
 * Parse a Bluetooth Heart Rate Measurement (0x2A37) packet.
 * Short or inconsistent packets return an error instead of throwing.
 */
export function parseHeartRateMeasurement(view: DataView): HeartRateParseResult {
  if (view.byteLength < 2) {
    return { ok: false, error: 'Heart rate packet is too short.' };
  }

  const flags = view.getUint8(0);
  const wide = (flags & FLAG_UINT16) !== 0;
  let offset = 1;
  const hrBytes = wide ? 2 : 1;
  if (view.byteLength < offset + hrBytes) {
    return { ok: false, error: 'Heart rate value is missing.' };
  }

  const bpm = wide ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += hrBytes;

  const contactSupported = (flags & FLAG_CONTACT_SUPPORTED) !== 0;
  const contactDetected = contactSupported ? (flags & FLAG_CONTACT_DETECTED) !== 0 : undefined;

  let energyExpendedKj: number | undefined;
  if ((flags & FLAG_ENERGY) !== 0) {
    if (view.byteLength < offset + 2) {
      return { ok: false, error: 'Energy expended field is truncated.' };
    }
    energyExpendedKj = view.getUint16(offset, true);
    offset += 2;
  }

  const rrIntervalsMs: number[] = [];
  if ((flags & FLAG_RR) !== 0) {
    if (view.byteLength < offset + 2) {
      return { ok: false, error: 'RR interval field is truncated.' };
    }
    while (offset + 2 <= view.byteLength) {
      const raw = view.getUint16(offset, true);
      rrIntervalsMs.push((raw / 1024) * 1000);
      offset += 2;
    }
    if (offset !== view.byteLength) {
      return { ok: false, error: 'RR interval field is truncated.' };
    }
  }

  return {
    ok: true,
    value: {
      bpm,
      rrIntervalsMs,
      contactDetected,
      energyExpendedKj,
      flags,
    },
  };
}
