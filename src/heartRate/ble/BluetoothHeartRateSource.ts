import { logger } from '../../logging/logger';
import type { ConnectionState } from '../../treadmill/types';
import { uuid16 } from '../../treadmill/bluetooth/ftmsConstants';
import { getNavigatorBluetooth, type BluetoothCharacteristicLike, type BluetoothDeviceLike } from '../../treadmill/bluetooth/webBluetoothTypes';
import { dataViewToHex } from '../../utils/hex';
import type { HeartRateData, HeartRateSource, HeartRateSourceInfo } from '../HeartRateSource';
import {
  BODY_SENSOR_LOCATION_UUID,
  HEART_RATE_CONTROL_POINT_UUID,
  HEART_RATE_MEASUREMENT_UUID,
  HEART_RATE_SERVICE_UUID,
  HR_DISCONNECTED,
  HR_MEASUREMENT_SHORT,
  HR_SERVICE_MISSING,
  HR_SERVICE_SHORT,
  WEB_BLUETOOTH_HR_UNAVAILABLE,
} from './heartRateConstants';
import { parseHeartRateMeasurement, type ParsedHeartRateMeasurement } from './HeartRateMeasurementParser';

const BODY_LOCATION: Record<number, string> = {
  0: 'Other',
  1: 'Chest',
  2: 'Wrist',
  3: 'Finger',
  4: 'Hand',
  5: 'Ear lobe',
  6: 'Foot',
};

export type HeartRateDebugSnapshot = {
  deviceName: string;
  connectionState: ConnectionState;
  service: string;
  measurementCharacteristic: string;
  bodySensorLocation: string | null;
  controlPoint: string;
  controlPointUsed: false;
  lastPacketHex: string;
  parsed: {
    bpm: number;
    rrIntervalsMs: number[];
    contactDetected?: boolean;
    energyExpendedKj?: number;
  } | null;
  parseError: string | null;
  lastUpdate: number | null;
  statusDetail: string | null;
};

/**
 * Standard BLE Heart Rate Service (0x180D). No vendor protocol and no writes to 0x2A39.
 */
export class BluetoothHeartRateSource implements HeartRateSource {
  private state: ConnectionState = 'disconnected';
  private device: BluetoothDeviceLike | null = null;
  private measurement: BluetoothCharacteristicLike | null = null;
  private deviceName = '';
  private bodySensorLocation: string | null = null;
  private lastPacketHex = '';
  private lastParsed: ParsedHeartRateMeasurement | null = null;
  private parseError: string | null = null;
  private lastUpdate: number | null = null;
  private statusDetail: string | null = null;
  private userClosed = false;
  private dataListeners = new Set<(data: HeartRateData) => void>();
  private connectionListeners = new Set<(state: ConnectionState) => void>();

  async connect(): Promise<void> {
    await this.request(false);
  }

  /** Opens the chooser without a service filter so a watch that hides 0x180D can still be inspected. */
  async inspect(): Promise<void> {
    await this.request(true);
  }

  /** Reopens GATT on the last device. Falls back to the chooser when there is nothing to resume. */
  async reconnect(): Promise<void> {
    if (!this.device?.gatt) {
      await this.request(false);
      return;
    }
    await this.openGatt(this.device);
  }

  async disconnect(): Promise<void> {
    this.userClosed = true;
    this.statusDetail = null;
    await this.release(true);
    this.setState('disconnected');
  }

  subscribe(callback: (data: HeartRateData) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }

  subscribeConnection(callback: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.state);
    return () => this.connectionListeners.delete(callback);
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getSourceInfo(): HeartRateSourceInfo {
    return {
      id: 'ble-hr',
      name: this.deviceName || 'Heart rate sensor',
      type: 'bluetooth',
    };
  }

  hasRememberedDevice(): boolean {
    return this.device != null;
  }

  getDebug(): HeartRateDebugSnapshot {
    return {
      deviceName: this.deviceName,
      connectionState: this.state,
      service: HR_SERVICE_SHORT,
      measurementCharacteristic: HR_MEASUREMENT_SHORT,
      bodySensorLocation: this.bodySensorLocation,
      controlPoint: HEART_RATE_CONTROL_POINT_UUID.toString(16),
      controlPointUsed: false,
      lastPacketHex: this.lastPacketHex,
      parsed: this.lastParsed
        ? {
            bpm: this.lastParsed.bpm,
            rrIntervalsMs: this.lastParsed.rrIntervalsMs,
            contactDetected: this.lastParsed.contactDetected,
            energyExpendedKj: this.lastParsed.energyExpendedKj,
          }
        : null,
      parseError: this.parseError,
      lastUpdate: this.lastUpdate,
      statusDetail: this.statusDetail,
    };
  }

  private async request(inspect: boolean): Promise<void> {
    const bluetooth = getNavigatorBluetooth();
    if (!bluetooth) {
      this.statusDetail = WEB_BLUETOOTH_HR_UNAVAILABLE;
      this.setState('unsupported');
      logger.error('bluetooth', WEB_BLUETOOTH_HR_UNAVAILABLE);
      throw new Error(WEB_BLUETOOTH_HR_UNAVAILABLE);
    }

    this.statusDetail = null;
    this.setState('scanning');
    let device: BluetoothDeviceLike;
    try {
      const service = uuid16(HEART_RATE_SERVICE_UUID);
      device = await bluetooth.requestDevice(
        inspect
          ? { acceptAllDevices: true, optionalServices: [service] }
          : { filters: [{ services: [service] }] },
      );
    } catch (error) {
      this.setState('disconnected');
      if (isChooserCancel(error)) throw new Error('Heart rate device chooser was closed.');
      const message = error instanceof Error ? error.message : 'Heart rate connection failed.';
      this.statusDetail = message;
      logger.error('bluetooth', message);
      throw new Error(message);
    }

    this.device = device;
    this.deviceName = device.name?.trim() || 'Heart rate sensor';
    device.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    device.addEventListener('gattserverdisconnected', this.onGattDisconnected);
    await this.openGatt(device);
  }

  private async openGatt(device: BluetoothDeviceLike): Promise<void> {
    if (!device.gatt) {
      this.statusDetail = 'The selected device has no GATT server.';
      this.setState('error');
      throw new Error(this.statusDetail);
    }
    this.setState('connecting');
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(uuid16(HEART_RATE_SERVICE_UUID));
      const measurement = await service.getCharacteristic(uuid16(HEART_RATE_MEASUREMENT_UUID));
      await this.attachMeasurement(measurement);
      await this.readBodyLocation(service);
      this.statusDetail = null;
      this.setState('connected');
      logger.info('bluetooth', `HR sensor connected: ${this.deviceName}`);
    } catch (error) {
      const missing = isServiceMissing(error);
      this.statusDetail = missing ? HR_SERVICE_MISSING : error instanceof Error ? error.message : 'Heart rate connection failed.';
      this.setState('error');
      logger.error('heartRate', this.statusDetail);
      throw new Error(this.statusDetail);
    }
  }

  private async attachMeasurement(characteristic: BluetoothCharacteristicLike) {
    if (this.measurement) {
      this.measurement.removeEventListener('characteristicvaluechanged', this.onMeasurement);
    }
    this.measurement = characteristic;
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', this.onMeasurement);
  }

  private async readBodyLocation(service: { getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike> }) {
    try {
      const location = await service.getCharacteristic(uuid16(BODY_SENSOR_LOCATION_UUID));
      if (!location.readValue) return;
      const view = await location.readValue();
      if (view.byteLength < 1) return;
      const code = view.getUint8(0);
      this.bodySensorLocation = BODY_LOCATION[code] ?? `Unknown (${code})`;
    } catch {
      this.bodySensorLocation = null;
    }
  }

  private onMeasurement = () => {
    const value = this.measurement?.value;
    if (!value) return;
    this.lastPacketHex = dataViewToHex(value);
    this.lastUpdate = Date.now();
    const parsed = parseHeartRateMeasurement(value);
    if (!parsed.ok) {
      this.parseError = parsed.error;
      this.lastParsed = null;
      logger.warn('heartRate', parsed.error);
      return;
    }
    this.parseError = null;
    this.lastParsed = parsed.value;
    const data: HeartRateData = {
      timestamp: this.lastUpdate,
      bpm: parsed.value.bpm,
      rrIntervalsMs: parsed.value.rrIntervalsMs,
      contactDetected: parsed.value.contactDetected,
      source: 'bluetooth',
    };
    for (const listener of this.dataListeners) listener(data);
  };

  private onGattDisconnected = () => {
    void this.release(false);
    if (this.userClosed) {
      this.userClosed = false;
      this.statusDetail = null;
      this.setState('disconnected');
      return;
    }
    this.statusDetail = HR_DISCONNECTED;
    this.setState('disconnected');
    logger.warn('heartRate', HR_DISCONNECTED);
  };

  private async release(stopLink: boolean) {
    if (this.measurement) {
      this.measurement.removeEventListener('characteristicvaluechanged', this.onMeasurement);
      try {
        await this.measurement.stopNotifications?.();
      } catch {
        // The link may already be gone.
      }
    }
    this.measurement = null;
    if (stopLink) this.device?.gatt?.disconnect();
  }

  private setState(state: ConnectionState) {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state);
  }
}

function isChooserCancel(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'AbortError');
}

function isServiceMissing(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'NotFoundError' || /not found|no service/i.test(error.message);
}
