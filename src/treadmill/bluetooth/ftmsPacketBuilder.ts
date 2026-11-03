import { clamp } from '../../utils/math';
import { FTMS_FLAG } from './ftmsConstants';

export type FtmsPacketInput = {
  speedKmh: number;
  distanceMeters: number;
  inclinePercent: number;
  rampAngleDegrees?: number;
  heartRateBpm?: number;
  elapsedSeconds?: number;
  totalEnergyKcal?: number;
  energyPerHourKcal?: number;
  energyPerMinuteKcal?: number;
};

function writeUint24(view: DataView, offset: number, value: number) {
  const safe = Math.max(0, Math.min(0xffffff, Math.round(value)));
  view.setUint8(offset, safe & 0xff);
  view.setUint8(offset + 1, (safe >> 8) & 0xff);
  view.setUint8(offset + 2, (safe >> 16) & 0xff);
}

/**
 * Build a spec-shaped 0x2ACD packet for the simulator's FTMS debug view.
 * Field order matches FtmsTreadmillParser. Pace is omitted on purpose:
 * its unit is marked TODO in the parser.
 */
export function buildFtmsTreadmillPacket(input: FtmsPacketInput): Uint8Array {
  let flags = FTMS_FLAG.TOTAL_DISTANCE | FTMS_FLAG.INCLINATION;
  let size = 2 + 2 + 3 + 4;
  const includeHr = input.heartRateBpm != null;
  const includeElapsed = input.elapsedSeconds != null;
  const includeEnergy = input.totalEnergyKcal != null;
  if (includeEnergy) {
    flags |= FTMS_FLAG.EXPENDED_ENERGY;
    size += 5;
  }
  if (includeHr) {
    flags |= FTMS_FLAG.HEART_RATE;
    size += 1;
  }
  if (includeElapsed) {
    flags |= FTMS_FLAG.ELAPSED_TIME;
    size += 2;
  }

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint16(offset, flags, true);
  offset += 2;
  const speedCenti = Math.round(clamp(input.speedKmh, 0, 99.99) * 100);
  view.setUint16(offset, speedCenti, true);
  offset += 2;
  writeUint24(view, offset, input.distanceMeters);
  offset += 3;
  view.setInt16(offset, Math.round(clamp(input.inclinePercent, -100, 100) * 10), true);
  view.setInt16(offset + 2, Math.round((input.rampAngleDegrees ?? 0) * 10), true);
  offset += 4;
  if (includeEnergy) {
    view.setUint16(offset, Math.round(input.totalEnergyKcal ?? 0), true);
    view.setUint16(offset + 2, Math.round(input.energyPerHourKcal ?? 0), true);
    view.setUint8(offset + 4, Math.round(input.energyPerMinuteKcal ?? 0));
    offset += 5;
  }
  if (includeHr) {
    view.setUint8(offset, Math.round(clamp(input.heartRateBpm ?? 0, 0, 255)));
    offset += 1;
  }
  if (includeElapsed) {
    view.setUint16(offset, Math.round(clamp(input.elapsedSeconds ?? 0, 0, 65535)), true);
  }
  return new Uint8Array(buffer);
}

export function corruptPacket(packet: Uint8Array): Uint8Array {
  if (packet.length === 0) return packet;
  const copy = packet.slice();
  const mode = Math.floor(Math.random() * 3);
  if (mode === 0 && copy.length > 2) {
    return copy.slice(0, 2);
  }
  if (mode === 1) {
    const index = Math.floor(Math.random() * copy.length);
    copy[index] = copy[index] ^ 0xff;
    return copy;
  }
  return copy.slice(0, Math.max(1, Math.floor(copy.length / 2)));
}
