/** Bluetooth SIG Fitness Machine Service 1.0. These are standard UUIDs, not Kettler-specific. */
export const FTMS_SERVICE = 0x1826;

export const FTMS_UUID = {
  service: 0x1826,
  feature: 0x2acc,
  treadmillData: 0x2acd,
  supportedSpeedRange: 0x2ad4,
  supportedInclinationRange: 0x2ad5,
  supportedResistanceRange: 0x2ad6,
  supportedHeartRateRange: 0x2ad7,
  supportedPowerRange: 0x2ad8,
  controlPoint: 0x2ad9,
  status: 0x2ada,
} as const;

export const BLE_UUID = {
  deviceInformation: 0x180a,
  heartRate: 0x180d,
  battery: 0x180f,
  runningSpeedCadence: 0x1814,
  cyclingSpeedCadence: 0x1816,
  cyclingPower: 0x1818,
  manufacturerName: 0x2a29,
  modelNumber: 0x2a24,
  firmwareRevision: 0x2a26,
} as const;

const BASE = '0000-1000-8000-00805f9b34fb';

export function uuid16(value: number): string {
  return `0000${value.toString(16).padStart(4, '0')}-${BASE}`;
}

/** Compare 16-bit, 0x-prefixed, and 128-bit Bluetooth UUIDs. */
export function normalizeUuid(uuid: string | number): string {
  if (typeof uuid === 'number') return uuid.toString(16).padStart(4, '0');
  const lower = uuid.toLowerCase().replace(/^0x/, '');
  const full = lower.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
  if (full) return full[1];
  if (/^[0-9a-f]{4}$/.test(lower)) return lower;
  return lower;
}

export function sameUuid(a: string | number, b: string | number): boolean {
  return normalizeUuid(a) === normalizeUuid(b);
}

/**
 * Services we are allowed to ask the browser for.
 * Web Bluetooth cannot enumerate unknown proprietary services unless their
 * UUIDs are listed here before requestDevice().
 */
export const OPTIONAL_SERVICE_UUIDS: string[] = [
  uuid16(FTMS_UUID.service),
  uuid16(BLE_UUID.deviceInformation),
  uuid16(BLE_UUID.heartRate),
  uuid16(BLE_UUID.battery),
  uuid16(BLE_UUID.runningSpeedCadence),
  uuid16(BLE_UUID.cyclingSpeedCadence),
  uuid16(BLE_UUID.cyclingPower),
];

/**
 * Treadmill Data flags. Bit 0 is inverted: speed is present when the bit is 0.
 * Bluetooth SIG Fitness Machine Service 1.0, Treadmill Data characteristic.
 */
export const FTMS_FLAG = {
  MORE_DATA: 1 << 0,
  AVERAGE_SPEED: 1 << 1,
  TOTAL_DISTANCE: 1 << 2,
  INCLINATION: 1 << 3,
  ELEVATION_GAIN: 1 << 4,
  INSTANTANEOUS_PACE: 1 << 5,
  AVERAGE_PACE: 1 << 6,
  EXPENDED_ENERGY: 1 << 7,
  HEART_RATE: 1 << 8,
  METABOLIC_EQUIVALENT: 1 << 9,
  ELAPSED_TIME: 1 << 10,
  REMAINING_TIME: 1 << 11,
  FORCE_AND_POWER: 1 << 12,
} as const;

/** Fitness Machine Control Point opcodes. FTMS 1.0. */
export const FTMS_OPCODE = {
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_TARGET_SPEED: 0x02,
  SET_TARGET_INCLINE: 0x03,
  START_OR_RESUME: 0x07,
  STOP_OR_PAUSE: 0x08,
  RESPONSE: 0x80,
} as const;

export const FTMS_CONTROL_RESULT = {
  SUCCESS: 0x01,
  NOT_SUPPORTED: 0x02,
  INVALID_PARAMETER: 0x03,
  OPERATION_FAILED: 0x04,
  CONTROL_NOT_PERMITTED: 0x05,
} as const;

export const FTMS_STOP_PAUSE = {
  STOP: 0x01,
  PAUSE: 0x02,
} as const;
