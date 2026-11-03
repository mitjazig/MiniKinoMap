import type { CharacteristicProperties } from './BleInspector';

export type BluetoothCharacteristicLike = {
  uuid: string;
  properties: CharacteristicProperties;
  value?: DataView | null;
  startNotifications: () => Promise<BluetoothCharacteristicLike>;
  stopNotifications?: () => Promise<BluetoothCharacteristicLike>;
  readValue?: () => Promise<DataView>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  addEventListener: (type: 'characteristicvaluechanged', listener: () => void) => void;
  removeEventListener: (type: 'characteristicvaluechanged', listener: () => void) => void;
};

export type BluetoothServiceLike = {
  uuid: string;
  getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike>;
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
};

export type BluetoothGattServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothGattServerLike>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<BluetoothServiceLike>;
  getPrimaryServices: () => Promise<BluetoothServiceLike[]>;
};

export type BluetoothDeviceLike = {
  id?: string;
  name?: string | null;
  gatt?: BluetoothGattServerLike;
  addEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
  removeEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
};

export type BluetoothLike = {
  requestDevice: (options: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
    filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
  }) => Promise<BluetoothDeviceLike>;
};

export function getNavigatorBluetooth(): BluetoothLike | null {
  const nav = navigator as Navigator & { bluetooth?: BluetoothLike };
  return nav.bluetooth ?? null;
}

export const WEB_BLUETOOTH_UNAVAILABLE =
  'Web Bluetooth is not available in this browser. Use the simulator or open the app in a compatible Chromium-based browser.';
