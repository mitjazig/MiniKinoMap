import { FTMS_FLAG } from './ftmsConstants';

/**
 * Parsed Treadmill Data fields.
 * Resolutions follow Bluetooth SIG FTMS 1.0 unless marked TODO.
 */
export type FtmsTreadmillFields = {
  flags: number;
  instantaneousSpeedKmh?: number;
  averageSpeedKmh?: number;
  totalDistanceMeters?: number;
  inclinePercent?: number;
  rampAngleDegrees?: number;
  positiveElevationGainMeters?: number;
  negativeElevationGainMeters?: number;
  /** Raw uint8. See TODO on the pace unit below. */
  instantaneousPaceRaw?: number;
  averagePaceRaw?: number;
  /**
   * TODO: FTMS 1.0 describes this uint8 as resolution 0.1 in "kilometer per minute".
   * That unit is easy to confuse with minutes per kilometre, and some devices
   * disagree. Do not drive the UI pace from this field. Verify against a capture.
   */
  instantaneousPaceKmPerMin?: number;
  averagePaceKmPerMin?: number;
  totalEnergyKcal?: number;
  energyPerHourKcal?: number;
  energyPerMinuteKcal?: number;
  heartRateBpm?: number;
  metabolicEquivalent?: number;
  elapsedSeconds?: number;
  remainingSeconds?: number;
  forceOnBeltNewton?: number;
  powerOutputWatts?: number;
  bytesConsumed: number;
};

export class FtmsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FtmsParseError';
  }
}

export type FtmsParseOptions = {
  /**
   * Spec default is false: instantaneous speed is present when bit 0 is clear.
   * Turn this on only after a real capture shows a non-compliant device.
   */
  invertMoreDataBit?: boolean;
};

function readUint24(view: DataView, offset: number): number {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

/**
 * Parse a Fitness Machine Treadmill Data notification (UUID 0x2ACD).
 * Throws FtmsParseError on truncation so callers can drop the packet
 * without crashing the workout.
 */
export function parseFtmsTreadmillData(
  view: DataView,
  options: FtmsParseOptions = {},
): FtmsTreadmillFields {
  if (view.byteLength < 2) {
    throw new FtmsParseError('Treadmill Data packet is shorter than the flags field');
  }

  let offset = 0;
  const flags = view.getUint16(offset, true);
  offset += 2;

  const fields: FtmsTreadmillFields = { flags, bytesConsumed: 2 };
  const need = (bytes: number, name: string) => {
    if (offset + bytes > view.byteLength) {
      throw new FtmsParseError(`Truncated Treadmill Data while reading ${name}`);
    }
  };

  const speedPresent = options.invertMoreDataBit
    ? (flags & FTMS_FLAG.MORE_DATA) !== 0
    : (flags & FTMS_FLAG.MORE_DATA) === 0;

  if (speedPresent) {
    need(2, 'instantaneous speed');
    fields.instantaneousSpeedKmh = view.getUint16(offset, true) / 100;
    offset += 2;
  }
  if (flags & FTMS_FLAG.AVERAGE_SPEED) {
    need(2, 'average speed');
    fields.averageSpeedKmh = view.getUint16(offset, true) / 100;
    offset += 2;
  }
  if (flags & FTMS_FLAG.TOTAL_DISTANCE) {
    need(3, 'total distance');
    fields.totalDistanceMeters = readUint24(view, offset);
    offset += 3;
  }
  if (flags & FTMS_FLAG.INCLINATION) {
    need(4, 'inclination and ramp angle');
    fields.inclinePercent = view.getInt16(offset, true) / 10;
    fields.rampAngleDegrees = view.getInt16(offset + 2, true) / 10;
    offset += 4;
  }
  if (flags & FTMS_FLAG.ELEVATION_GAIN) {
    need(4, 'elevation gain');
    fields.positiveElevationGainMeters = view.getUint16(offset, true) / 10;
    fields.negativeElevationGainMeters = view.getUint16(offset + 2, true) / 10;
    offset += 4;
  }
  if (flags & FTMS_FLAG.INSTANTANEOUS_PACE) {
    need(1, 'instantaneous pace');
    const raw = view.getUint8(offset);
    fields.instantaneousPaceRaw = raw;
    fields.instantaneousPaceKmPerMin = raw / 10;
    offset += 1;
  }
  if (flags & FTMS_FLAG.AVERAGE_PACE) {
    need(1, 'average pace');
    const raw = view.getUint8(offset);
    fields.averagePaceRaw = raw;
    fields.averagePaceKmPerMin = raw / 10;
    offset += 1;
  }
  if (flags & FTMS_FLAG.EXPENDED_ENERGY) {
    need(5, 'expended energy');
    fields.totalEnergyKcal = view.getUint16(offset, true);
    fields.energyPerHourKcal = view.getUint16(offset + 2, true);
    fields.energyPerMinuteKcal = view.getUint8(offset + 4);
    offset += 5;
  }
  if (flags & FTMS_FLAG.HEART_RATE) {
    need(1, 'heart rate');
    fields.heartRateBpm = view.getUint8(offset);
    offset += 1;
  }
  if (flags & FTMS_FLAG.METABOLIC_EQUIVALENT) {
    need(1, 'metabolic equivalent');
    fields.metabolicEquivalent = view.getUint8(offset) / 10;
    offset += 1;
  }
  if (flags & FTMS_FLAG.ELAPSED_TIME) {
    need(2, 'elapsed time');
    fields.elapsedSeconds = view.getUint16(offset, true);
    offset += 2;
  }
  if (flags & FTMS_FLAG.REMAINING_TIME) {
    need(2, 'remaining time');
    fields.remainingSeconds = view.getUint16(offset, true);
    offset += 2;
  }
  if (flags & FTMS_FLAG.FORCE_AND_POWER) {
    need(4, 'force and power');
    fields.forceOnBeltNewton = view.getInt16(offset, true);
    fields.powerOutputWatts = view.getInt16(offset + 2, true);
    offset += 4;
  }

  fields.bytesConsumed = offset;
  return fields;
}

export function ftmsFieldsToRecord(
  fields: FtmsTreadmillFields,
): Record<string, number | string | boolean | undefined> {
  return {
    flags: fields.flags,
    instantaneousSpeedKmh: fields.instantaneousSpeedKmh,
    averageSpeedKmh: fields.averageSpeedKmh,
    totalDistanceMeters: fields.totalDistanceMeters,
    inclinePercent: fields.inclinePercent,
    rampAngleDegrees: fields.rampAngleDegrees,
    heartRateBpm: fields.heartRateBpm,
    elapsedSeconds: fields.elapsedSeconds,
    totalEnergyKcal: fields.totalEnergyKcal,
    instantaneousPaceRaw: fields.instantaneousPaceRaw,
  };
}
