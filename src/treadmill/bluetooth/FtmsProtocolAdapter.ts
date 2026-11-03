import type { TreadmillData } from '../types';
import {
  encodePause,
  encodeRequestControl,
  encodeSetTargetIncline,
  encodeSetTargetSpeed,
  encodeStartOrResume,
  encodeStop,
} from './ftmsControl';
import { FTMS_UUID, sameUuid } from './ftmsConstants';
import { parseFtmsTreadmillData } from './FtmsTreadmillParser';
import type { ProtocolAdapter } from './protocolAdapter';

export const ftmsProtocolAdapter: ProtocolAdapter = {
  id: 'ftms',
  label: 'Bluetooth FTMS',

  supports(serviceUuids: string[]): boolean {
    return serviceUuids.some((uuid) => sameUuid(uuid, FTMS_UUID.service));
  },

  parseNotification(characteristicUuid: string, data: DataView): Partial<TreadmillData> | null {
    if (!sameUuid(characteristicUuid, FTMS_UUID.treadmillData)) return null;
    const fields = parseFtmsTreadmillData(data);
    const partial: Partial<TreadmillData> = {};
    if (fields.instantaneousSpeedKmh != null) partial.speedKmh = fields.instantaneousSpeedKmh;
    if (fields.inclinePercent != null) partial.inclinePercent = fields.inclinePercent;
    if (fields.totalDistanceMeters != null) partial.distanceMeters = fields.totalDistanceMeters;
    if (fields.elapsedSeconds != null) partial.elapsedSeconds = fields.elapsedSeconds;
    if (fields.heartRateBpm != null) partial.heartRateBpm = fields.heartRateBpm;
    if (fields.totalEnergyKcal != null) partial.caloriesKcal = fields.totalEnergyKcal;
    return partial;
  },

  encodeRequestControl: () => encodeRequestControl(),
  encodeStart: () => encodeStartOrResume(),
  encodeStop: () => encodeStop(),
  encodePause: () => encodePause(),
  encodeSetSpeed: (kmh) => encodeSetTargetSpeed(kmh),
  encodeSetIncline: (percent) => encodeSetTargetIncline(percent),
};
