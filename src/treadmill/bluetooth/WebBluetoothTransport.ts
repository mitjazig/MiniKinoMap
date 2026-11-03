import { dataViewToHex } from '../../utils/hex';
import { ControlUnsupportedError, type TreadmillTransport } from '../TreadmillTransport';
import type { ConnectionState, LogEntry, PacketTrace, TreadmillData } from '../types';
import { FTMS_MISSING_MESSAGE, inspectGattServer, type GattReport } from './BleInspector';
import { ftmsProtocolAdapter } from './FtmsProtocolAdapter';
import {
  describeFitnessMachineStatus,
  parseControlPointResponse,
  parseFtmsFeatures,
} from './ftmsControl';
import { FTMS_UUID, OPTIONAL_SERVICE_UUIDS, sameUuid, uuid16 } from './ftmsConstants';
import { ftmsFieldsToRecord, parseFtmsTreadmillData } from './FtmsTreadmillParser';
import { selectProtocolAdapter, type ProtocolAdapter } from './protocolAdapter';
import {
  getNavigatorBluetooth,
  WEB_BLUETOOTH_UNAVAILABLE,
  type BluetoothCharacteristicLike,
  type BluetoothDeviceLike,
  type BluetoothGattServerLike,
  type BluetoothLike,
} from './webBluetoothTypes';

const adapters: ProtocolAdapter[] = [ftmsProtocolAdapter];

export class WebBluetoothTransport implements TreadmillTransport {
  private device: BluetoothDeviceLike | null = null;
  private server: BluetoothGattServerLike | null = null;
  private treadmillChar: BluetoothCharacteristicLike | null = null;
  private controlPoint: BluetoothCharacteristicLike | null = null;
  private statusChar: BluetoothCharacteristicLike | null = null;
  private state: ConnectionState = 'disconnected';
  private statusDetail: string | null = null;
  private ftmsDetected = false;
  private controlSupported = false;
  private inclineControlSupported = false;
  private speedControlSupported = false;
  private controlGranted = false;
  private userDisconnect = false;
  private report: GattReport | null = null;
  private adapter: ProtocolAdapter | null = null;
  private last: TreadmillData | null = null;
  private logId = 1;
  private packetId = 1;
  private pendingControl: {
    opcode: number;
    resolve: (ok: boolean) => void;
  } | null = null;

  private readonly dataListeners = new Set<(data: TreadmillData) => void>();
  private readonly connectionListeners = new Set<(state: ConnectionState) => void>();
  private readonly logListeners = new Set<(entry: LogEntry) => void>();
  private readonly packetListeners = new Set<(packet: PacketTrace) => void>();

  constructor(private readonly bluetoothSource: () => BluetoothLike | null = getNavigatorBluetooth) {
    if (!this.bluetoothSource()) this.state = 'unsupported';
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getStatusDetail(): string | null {
    return this.statusDetail;
  }

  isFtmsDetected(): boolean {
    return this.ftmsDetected;
  }

  isControlSupported(): boolean {
    return this.controlSupported;
  }

  isInclineControlSupported(): boolean {
    return this.inclineControlSupported;
  }

  getGattReport(): GattReport | null {
    return this.report;
  }

  subscribe(callback: (data: TreadmillData) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }

  subscribeConnection(callback: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  subscribeLog(callback: (entry: LogEntry) => void): () => void {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  subscribePacket(callback: (packet: PacketTrace) => void): () => void {
    this.packetListeners.add(callback);
    return () => this.packetListeners.delete(callback);
  }

  async connect(): Promise<void> {
    const bluetooth = this.bluetoothSource();
    if (!bluetooth) {
      this.statusDetail = WEB_BLUETOOTH_UNAVAILABLE;
      this.setState('unsupported');
      this.log(WEB_BLUETOOTH_UNAVAILABLE, 'error');
      throw new Error(WEB_BLUETOOTH_UNAVAILABLE);
    }

    this.userDisconnect = false;
    try {
      if (!this.device) {
        this.setState('scanning');
        this.log('Searching device');
        this.device = await bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: OPTIONAL_SERVICE_UUIDS,
        });
        this.device.addEventListener('gattserverdisconnected', this.onUnexpectedDisconnect);
      }

      this.setState(this.server ? 'reconnecting' : 'connecting');
      const name = this.device.name || 'Unnamed device';
      this.log(`Selected ${name}`);
      if (!this.device.gatt) throw new Error('This device does not expose a GATT server.');
      this.server = await this.device.gatt.connect();
      this.log('Connected');
      await this.inspectAndSubscribe(name);
      this.statusDetail = this.ftmsDetected ? 'FTMS treadmill data is streaming.' : FTMS_MISSING_MESSAGE;
      this.setState('connected');
    } catch (error) {
      if (isChooserCancel(error)) {
        this.log('Device selection cancelled');
        this.statusDetail = null;
        this.setState(this.server?.connected ? 'connected' : 'disconnected');
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.statusDetail = message;
      this.log(message, 'error');
      this.setState('error');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.userDisconnect = true;
    await this.releaseLink();
    this.log('Disconnected');
    this.setState('disconnected');
  }

  /** Drop the remembered device so the next connect opens the browser chooser. */
  async forget(): Promise<void> {
    await this.disconnect();
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.onUnexpectedDisconnect);
      this.device = null;
    }
    this.report = null;
    this.ftmsDetected = false;
    this.log('Forgot the Bluetooth device');
  }

  hasRememberedDevice(): boolean {
    return this.device != null;
  }

  async start(): Promise<void> {
    if (!this.controlSupported) {
      this.log('Control unsupported. Listening only — start the belt on the treadmill.');
      return;
    }
    await this.sendCommand('start', (adapter) => adapter.encodeStart());
  }

  async stop(): Promise<void> {
    if (!this.controlSupported) {
      this.log('Control unsupported. Stop the belt on the treadmill if it is still moving.');
      return;
    }
    await this.sendCommand('stop', (adapter) => adapter.encodeStop());
  }

  async pause(): Promise<void> {
    if (!this.controlSupported) {
      this.log('Control unsupported. The run timer can pause here, but the belt may keep moving.');
      return;
    }
    await this.sendCommand('pause', (adapter) => adapter.encodePause());
  }

  async setTargetSpeed(kmh: number): Promise<void> {
    if (!this.speedControlSupported) throw new ControlUnsupportedError();
    await this.sendCommand('set speed', (adapter) => adapter.encodeSetSpeed(kmh));
  }

  async setTargetIncline(percent: number): Promise<void> {
    if (!this.inclineControlSupported) throw new ControlUnsupportedError();
    await this.sendCommand('set incline', (adapter) => adapter.encodeSetIncline(percent));
  }

  private async inspectAndSubscribe(deviceName: string): Promise<void> {
    if (!this.server) return;
    const { report, warnings } = await inspectGattServer(this.server, {
      name: deviceName,
      id: this.device?.id,
    });
    this.report = report;
    this.ftmsDetected = report.ftmsServiceFound;
    for (const warning of warnings) {
      this.log(warning, warning.startsWith('FTMS service was not detected') ? 'warn' : 'info');
    }
    this.log(`Device ${report.deviceName}`);
    if (!report.ftmsServiceFound) {
      this.log(FTMS_MISSING_MESSAGE, 'warn');
      this.adapter = null;
      this.controlSupported = false;
      this.inclineControlSupported = false;
      this.speedControlSupported = false;
      return;
    }

    this.log('Service 1826 found');
    this.adapter = selectProtocolAdapter(
      adapters,
      report.services.map((service) => service.uuid),
    );

    const ftms = await this.server.getPrimaryService(uuid16(FTMS_UUID.service));
    const characteristics = await ftms.getCharacteristics();
    const treadmill = characteristics.find((item) => sameUuid(item.uuid, FTMS_UUID.treadmillData));
    const control = characteristics.find((item) => sameUuid(item.uuid, FTMS_UUID.controlPoint));
    const feature = characteristics.find((item) => sameUuid(item.uuid, FTMS_UUID.feature));
    const status = characteristics.find((item) => sameUuid(item.uuid, FTMS_UUID.status));

    if (!treadmill) {
      this.log('Service 1826 found, but Treadmill Data 2ACD is missing.', 'warn');
      return;
    }
    this.log('Characteristic 2ACD found');
    this.treadmillChar = treadmill;
    await treadmill.startNotifications();
    treadmill.addEventListener('characteristicvaluechanged', this.onTreadmillNotification);
    this.log('Notifications started');

    if (feature?.properties.read && feature.readValue) {
      try {
        const view = await feature.readValue();
        const decoded = parseFtmsFeatures(view);
        if (decoded) {
          this.speedControlSupported = decoded.speedTargetSupported;
          this.inclineControlSupported = decoded.inclineTargetSupported;
          this.log(
            `FTMS features: speed target ${decoded.speedTargetSupported ? 'yes' : 'no'}, incline target ${
              decoded.inclineTargetSupported ? 'yes' : 'no'
            }`,
          );
        }
      } catch (error) {
        this.log(`Could not read Fitness Machine Feature: ${messageOf(error)}`, 'warn');
      }
    }

    if (control && (control.properties.write || control.properties.writeWithoutResponse)) {
      this.controlPoint = control;
      const featuresKnown = feature?.properties.read === true;
      if (!featuresKnown) {
        // The control point exists, but the feature bits did not say what it allows.
        // Writes still go through the FTMS opcodes only, and only after Request Control.
        this.speedControlSupported = true;
        this.inclineControlSupported = true;
        this.log('Control point 2AD9 found. Feature bits were not readable, so commands wait for a control response.');
      }
      this.controlSupported = this.speedControlSupported || this.inclineControlSupported;
      if (control.properties.notify || control.properties.indicate) {
        try {
          await control.startNotifications();
          control.addEventListener('characteristicvaluechanged', this.onControlNotification);
          this.log('Control point indications started');
        } catch (error) {
          this.log(`Control point is present but indications failed: ${messageOf(error)}`, 'warn');
          this.controlSupported = false;
          this.speedControlSupported = false;
          this.inclineControlSupported = false;
        }
      } else {
        this.log('Control point has no indicate/notify. Refusing treadmill commands.', 'warn');
        this.controlSupported = false;
        this.speedControlSupported = false;
        this.inclineControlSupported = false;
      }
    } else {
      this.controlSupported = false;
      this.speedControlSupported = false;
      this.inclineControlSupported = false;
      this.log('Control unsupported');
    }

    if (status && (status.properties.notify || status.properties.indicate)) {
      try {
        this.statusChar = status;
        await status.startNotifications();
        status.addEventListener('characteristicvaluechanged', this.onStatusNotification);
        this.log('Fitness Machine Status notifications started');
      } catch (error) {
        this.log(`Status characteristic found, notifications failed: ${messageOf(error)}`, 'warn');
      }
    }
  }

  private async sendCommand(
    label: string,
    encode: (adapter: ProtocolAdapter) => Uint8Array | null,
  ): Promise<void> {
    if (!this.adapter || !this.controlPoint || !this.controlSupported) {
      throw new ControlUnsupportedError();
    }
    if (!this.controlGranted) {
      const request = this.adapter.encodeRequestControl();
      if (!request) throw new ControlUnsupportedError();
      this.log('Requesting FTMS control');
      const accepted = await this.writeAndWait(FTMS_OPCODE_REQUEST, request);
      if (!accepted) {
        this.log('Control unsupported', 'warn');
        this.controlSupported = false;
        this.speedControlSupported = false;
        this.inclineControlSupported = false;
        throw new ControlUnsupportedError();
      }
      this.controlGranted = true;
      this.log('Control granted');
    }
    const payload = encode(this.adapter);
    if (!payload || payload.length === 0) throw new ControlUnsupportedError();
    const opcode = payload[0] ?? 0;
    const accepted = await this.writeAndWait(opcode, payload);
    if (!accepted) {
      this.log(`Control unsupported (${label})`, 'warn');
      throw new ControlUnsupportedError();
    }
    this.log(`Sent FTMS ${label}`);
  }

  private async writeAndWait(opcode: number, payload: Uint8Array): Promise<boolean> {
    const characteristic = this.controlPoint;
    if (!characteristic) throw new ControlUnsupportedError();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        if (this.pendingControl?.opcode === opcode) this.pendingControl = null;
        this.log('Control point did not confirm the command', 'warn');
        resolve(false);
      }, 1500);
      this.pendingControl = {
        opcode,
        resolve: (ok) => {
          if (timer) clearTimeout(timer);
          resolve(ok);
        },
      };
    });
    const bytes = new Uint8Array(payload);
    try {
      if (characteristic.properties.write && characteristic.writeValueWithResponse) {
        await characteristic.writeValueWithResponse(bytes);
      } else if (characteristic.writeValueWithoutResponse) {
        await characteristic.writeValueWithoutResponse(bytes);
      } else {
        throw new ControlUnsupportedError();
      }
    } catch (error) {
      if (timer) clearTimeout(timer);
      this.pendingControl = null;
      if (error instanceof ControlUnsupportedError) throw error;
      this.log(`Control write failed: ${messageOf(error)}`, 'error');
      throw new ControlUnsupportedError();
    }
    return response;
  }

  private readonly onTreadmillNotification = () => {
    const value = this.treadmillChar?.value;
    if (!value) return;
    const hex = dataViewToHex(value);
    let parsed: PacketTrace['parsed'] = null;
    let error: string | undefined;
    try {
      const fields = parseFtmsTreadmillData(value);
      parsed = ftmsFieldsToRecord(fields);
      const partial = this.adapter?.parseNotification(uuid16(FTMS_UUID.treadmillData), value);
      if (partial && partial.speedKmh != null) {
        const data: TreadmillData = {
          timestamp: Date.now(),
          speedKmh: partial.speedKmh,
          inclinePercent: partial.inclinePercent ?? this.last?.inclinePercent,
          distanceMeters: partial.distanceMeters ?? this.last?.distanceMeters ?? 0,
          elapsedSeconds: partial.elapsedSeconds ?? this.last?.elapsedSeconds ?? 0,
          heartRateBpm: partial.heartRateBpm,
          caloriesKcal: partial.caloriesKcal,
          cadenceSpm: this.last?.cadenceSpm,
        };
        this.last = data;
        for (const listener of this.dataListeners) listener(data);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      this.log(`Treadmill packet dropped: ${error}`, 'warn');
    }
    this.emitPacket({
      id: this.packetId,
      timestamp: Date.now(),
      characteristicUuid: uuid16(FTMS_UUID.treadmillData),
      hex,
      parsed,
      error,
    });
    this.packetId += 1;
  };

  private readonly onControlNotification = () => {
    const value = this.controlPoint?.value;
    if (!value) return;
    const hex = dataViewToHex(value);
    const response = parseControlPointResponse(value);
    this.emitPacket({
      id: this.packetId,
      timestamp: Date.now(),
      characteristicUuid: uuid16(FTMS_UUID.controlPoint),
      hex,
      parsed: response
        ? { requestOpcode: response.requestOpcode, resultCode: response.resultCode, success: response.success }
        : null,
    });
    this.packetId += 1;
    if (response && this.pendingControl && response.requestOpcode === this.pendingControl.opcode) {
      const waiter = this.pendingControl;
      this.pendingControl = null;
      waiter.resolve(response.success);
      if (!response.success) this.log(`FTMS control rejected (result ${response.resultCode})`, 'warn');
    } else {
      this.log(`Control point ${hex}`);
    }
  };

  private readonly onStatusNotification = () => {
    const value = this.statusChar?.value;
    if (!value) return;
    const hex = dataViewToHex(value);
    const description = describeFitnessMachineStatus(value);
    this.log(`Status: ${description}`);
    this.emitPacket({
      id: this.packetId,
      timestamp: Date.now(),
      characteristicUuid: uuid16(FTMS_UUID.status),
      hex,
      parsed: { status: description },
    });
    this.packetId += 1;
  };

  private readonly onUnexpectedDisconnect = () => {
    if (this.userDisconnect) return;
    this.controlGranted = false;
    this.treadmillChar = null;
    this.controlPoint = null;
    this.statusChar = null;
    this.server = null;
    this.log('GATT server disconnected', 'warn');
    this.statusDetail = 'Treadmill connection lost';
    this.setState('disconnected');
  };

  private async releaseLink(): Promise<void> {
    await this.stopNotifications();
    try {
      this.server?.disconnect();
    } catch {
      // Already gone.
    }
    this.controlGranted = false;
    this.controlPoint = null;
    this.treadmillChar = null;
    this.statusChar = null;
    this.server = null;
  }

  private async stopNotifications(): Promise<void> {
    if (this.treadmillChar) {
      this.treadmillChar.removeEventListener('characteristicvaluechanged', this.onTreadmillNotification);
      try {
        await this.treadmillChar.stopNotifications?.();
      } catch {
        // Ignore.
      }
    }
    if (this.statusChar) {
      this.statusChar.removeEventListener('characteristicvaluechanged', this.onStatusNotification);
    }
    if (this.controlPoint) {
      this.controlPoint.removeEventListener('characteristicvaluechanged', this.onControlNotification);
    }
  }

  private setState(state: ConnectionState) {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state);
  }

  private log(message: string, level: LogEntry['level'] = 'info') {
    const entry: LogEntry = { id: this.logId, timestamp: Date.now(), level, message };
    this.logId += 1;
    for (const listener of this.logListeners) listener(entry);
  }

  private emitPacket(packet: PacketTrace) {
    for (const listener of this.packetListeners) listener(packet);
  }
}

const FTMS_OPCODE_REQUEST = 0x00;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isChooserCancel(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'AbortError');
}
