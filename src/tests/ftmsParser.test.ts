import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '../utils/hex';
import { encodeSetTargetIncline, encodeSetTargetSpeed, machineEventFromStatus, snapToRange, walkingTargetKmh } from '../treadmill/bluetooth/ftmsControl';
import { FTMS_FLAG } from '../treadmill/bluetooth/ftmsConstants';
import { buildFtmsTreadmillPacket } from '../treadmill/bluetooth/ftmsPacketBuilder';
import { FtmsParseError, parseFtmsTreadmillData } from '../treadmill/bluetooth/FtmsTreadmillParser';

describe('FTMS treadmill parser', () => {
  it('round-trips a treadmill data packet', () => {
    const packet = buildFtmsTreadmillPacket({
      speedKmh: 8.4,
      distanceMeters: 2360,
      inclinePercent: 3,
      heartRateBpm: 142,
      elapsedSeconds: 1121,
      totalEnergyKcal: 180,
    });
    const fields = parseFtmsTreadmillData(new DataView(packet.buffer, packet.byteOffset, packet.byteLength));
    expect(fields.instantaneousSpeedKmh).toBeCloseTo(8.4, 2);
    expect(fields.totalDistanceMeters).toBe(2360);
    expect(fields.inclinePercent).toBeCloseTo(3, 1);
    expect(fields.heartRateBpm).toBe(142);
    expect(fields.elapsedSeconds).toBe(1121);
    expect(fields.totalEnergyKcal).toBe(180);
  });

  it('omits instantaneous speed when the More Data bit is set', () => {
    const distance = 500;
    const bytes = new Uint8Array(5);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, FTMS_FLAG.MORE_DATA | FTMS_FLAG.TOTAL_DISTANCE, true);
    view.setUint8(2, distance & 0xff);
    view.setUint8(3, (distance >> 8) & 0xff);
    view.setUint8(4, (distance >> 16) & 0xff);
    const fields = parseFtmsTreadmillData(view);
    expect(fields.instantaneousSpeedKmh).toBeUndefined();
    expect(fields.totalDistanceMeters).toBe(500);
  });

  it('reads a negative incline', () => {
    const packet = buildFtmsTreadmillPacket({
      speedKmh: 6,
      distanceMeters: 10,
      inclinePercent: -1.5,
    });
    const fields = parseFtmsTreadmillData(new DataView(packet.buffer, packet.byteOffset, packet.byteLength));
    expect(fields.inclinePercent).toBeCloseTo(-1.5, 1);
  });

  it('throws when a flagged field is truncated', () => {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, FTMS_FLAG.EXPENDED_ENERGY, true);
    expect(() => parseFtmsTreadmillData(view)).toThrow(FtmsParseError);
  });

  it('encodes FTMS control point speed and incline', () => {
    expect(bytesToHex(encodeSetTargetSpeed(8.4))).toBe('02 48 03');
    expect(bytesToHex(encodeSetTargetIncline(-1))).toBe('03 f6 ff');
    expect(Array.from(hexToBytes('02 48 03'))).toEqual([0x02, 0x48, 0x03]);
  });

  it('keeps a Kettler walking speed inside the reported range', () => {
    expect(walkingTargetKmh({ minKmh: 1, maxKmh: 18, incrementKmh: 0.1 })).toBe(4);
    expect(walkingTargetKmh({ minKmh: 5, maxKmh: 18, incrementKmh: 0.1 }, 4)).toBe(5);
  });

  it('snaps incline to the Kettler 1% step and 0–15% range', () => {
    const kettler = { min: 0, max: 15, step: 1 };
    const fallback = { min: 0, max: 15, step: 0.5 };
    expect(snapToRange(2.3, kettler, fallback)).toBe(2);
    expect(snapToRange(2.6, kettler, fallback)).toBe(3);
    expect(snapToRange(19, kettler, fallback)).toBe(15);
    expect(snapToRange(-3, kettler, fallback)).toBe(0);
    expect(snapToRange(2.3, null, fallback)).toBe(2.5);
    expect(Array.from(encodeSetTargetIncline(snapToRange(3.4, kettler, fallback)))).toEqual([0x03, 30, 0]);
  });

  it('reads a console start from Fitness Machine Status', () => {
    const started = new DataView(new Uint8Array([0x04]).buffer);
    const paused = new DataView(new Uint8Array([0x02, 0x02]).buffer);
    expect(machineEventFromStatus(started)).toBe('started');
    expect(machineEventFromStatus(paused)).toBe('paused');
  });
});
