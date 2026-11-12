import { clamp } from '../../utils/math';
import { FTMS_CONTROL_RESULT, FTMS_OPCODE, FTMS_STOP_PAUSE } from './ftmsConstants';

/** uint16, resolution 0.01 km/h. FTMS 1.0 Set Target Speed. */
export function encodeSetTargetSpeed(kmh: number): Uint8Array {
  const centi = Math.round(clamp(kmh, 0, 99.99) * 100);
  const bytes = new Uint8Array(3);
  const view = new DataView(bytes.buffer);
  bytes[0] = FTMS_OPCODE.SET_TARGET_SPEED;
  view.setUint16(1, centi, true);
  return bytes;
}

/** sint16, resolution 0.1 percent. FTMS 1.0 Set Target Inclination. */
export function encodeSetTargetIncline(percent: number): Uint8Array {
  const deci = Math.round(clamp(percent, -100, 100) * 10);
  const bytes = new Uint8Array(3);
  const view = new DataView(bytes.buffer);
  bytes[0] = FTMS_OPCODE.SET_TARGET_INCLINE;
  view.setInt16(1, deci, true);
  return bytes;
}

export function encodeRequestControl(): Uint8Array {
  return new Uint8Array([FTMS_OPCODE.REQUEST_CONTROL]);
}

export function encodeStartOrResume(): Uint8Array {
  return new Uint8Array([FTMS_OPCODE.START_OR_RESUME]);
}

export function encodeStop(): Uint8Array {
  return new Uint8Array([FTMS_OPCODE.STOP_OR_PAUSE, FTMS_STOP_PAUSE.STOP]);
}

export function encodePause(): Uint8Array {
  return new Uint8Array([FTMS_OPCODE.STOP_OR_PAUSE, FTMS_STOP_PAUSE.PAUSE]);
}

export type ControlPointResponse = {
  requestOpcode: number;
  resultCode: number;
  success: boolean;
};

/** Response is 0x80, request opcode, result code. Parameter bytes after that vary. */
export function parseControlPointResponse(view: DataView): ControlPointResponse | null {
  if (view.byteLength < 3) return null;
  if (view.getUint8(0) !== FTMS_OPCODE.RESPONSE) return null;
  const resultCode = view.getUint8(2);
  return {
    requestOpcode: view.getUint8(1),
    resultCode,
    success: resultCode === FTMS_CONTROL_RESULT.SUCCESS,
  };
}

export type SupportedSpeedRange = {
  minKmh: number;
  maxKmh: number;
  incrementKmh: number;
};

export function parseSupportedSpeedRange(view: DataView): SupportedSpeedRange | null {
  if (view.byteLength < 6) return null;
  return {
    minKmh: view.getUint16(0, true) / 100,
    maxKmh: view.getUint16(2, true) / 100,
    incrementKmh: view.getUint16(4, true) / 100,
  };
}

export type SupportedInclineRange = {
  minPercent: number;
  maxPercent: number;
  incrementPercent: number;
};

export function parseSupportedInclineRange(view: DataView): SupportedInclineRange | null {
  if (view.byteLength < 6) return null;
  return {
    minPercent: view.getInt16(0, true) / 10,
    maxPercent: view.getInt16(2, true) / 10,
    incrementPercent: view.getUint16(4, true) / 10,
  };
}

export type FtmsFeatureBits = {
  rawHex: string;
  speedTargetSupported: boolean;
  inclineTargetSupported: boolean;
  heartRateSupported: boolean;
  inclinationSupported: boolean;
};

/**
 * First uint32 is machine features, second uint32 is target-setting features.
 * Bit positions follow FTMS 1.0. The raw hex is the source of truth if a
 * device disagrees with this decode.
 */
export function parseFtmsFeatures(view: DataView): FtmsFeatureBits | null {
  if (view.byteLength < 8) return null;
  const features = view.getUint32(0, true);
  const targets = view.getUint32(4, true);
  const raw = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const rawHex = Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join(' ');
  return {
    rawHex,
    inclinationSupported: (features & (1 << 3)) !== 0,
    heartRateSupported: (features & (1 << 10)) !== 0,
    speedTargetSupported: (targets & (1 << 0)) !== 0,
    inclineTargetSupported: (targets & (1 << 1)) !== 0,
  };
}

const STATUS_NAMES: Record<number, string> = {
  0x01: 'Reset',
  0x02: 'Stopped or paused by user',
  0x03: 'Stopped by safety key',
  0x04: 'Started or resumed by user',
  0x05: 'Target speed changed',
  0x06: 'Target incline changed',
  0x0d: 'Targeted distance changed',
  0x0e: 'Targeted training time changed',
};

/**
 * A walking speed the belt will accept. Kettler 07886-900 rejects 0 km/h;
 * its reported minimum is 1 km/h.
 */
export function walkingTargetKmh(range: SupportedSpeedRange | null, preferred = 4): number {
  const min = range && range.minKmh > 0 ? range.minKmh : 1;
  const max = range && range.maxKmh > min ? range.maxKmh : 18;
  return clamp(preferred, min, max);
}

/** Clamp to the machine range and round to its step. Kettler 07886-900 reports incline steps of 1%. */
export function snapToRange(
  value: number,
  range: { min: number; max: number; step: number } | null,
  fallback: { min: number; max: number; step: number },
): number {
  const min = range ? range.min : fallback.min;
  const max = range && range.max > min ? range.max : fallback.max;
  const step = range && range.step > 0 ? range.step : fallback.step;
  const snapped = min + Math.round((clamp(value, min, max) - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(2));
}

/** Fitness Machine Status opcodes that mean the console changed the workout. */
export function machineEventFromStatus(view: DataView): 'started' | 'paused' | 'stopped' | null {
  if (view.byteLength < 1) return null;
  const opcode = view.getUint8(0);
  if (opcode === 0x04) return 'started';
  if (opcode === 0x02) {
    const control = view.byteLength > 1 ? view.getUint8(1) : 0x01;
    return control === 0x02 ? 'paused' : 'stopped';
  }
  return null;
}

/**
 * Training Status is flags plus a status byte.
 * 0x0D is manual mode. Interval values mean the belt session is already active.
 */
export function isActiveTrainingStatus(view: DataView): boolean {
  if (view.byteLength < 2) return false;
  const status = view.getUint8(1);
  return status === 0x0d || (status >= 0x02 && status <= 0x0c);
}

/** Best-effort status name. Unknown opcodes stay visible as hex. */
export function describeFitnessMachineStatus(view: DataView): string {
  if (view.byteLength < 1) return 'Empty status';
  const opcode = view.getUint8(0);
  const name = STATUS_NAMES[opcode] ?? `Unknown status opcode 0x${opcode.toString(16).padStart(2, '0')}`;
  if (view.byteLength === 1) return name;
  const rest = new Uint8Array(view.buffer, view.byteOffset + 1, view.byteLength - 1);
  const hex = Array.from(rest, (b) => b.toString(16).padStart(2, '0')).join(' ');
  return `${name} [${hex}]`;
}
