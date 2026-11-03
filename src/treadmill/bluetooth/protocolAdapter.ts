import type { TreadmillData } from '../types';

/**
 * A protocol adapter turns GATT notifications into TreadmillData and, only
 * when the real specification is known, into control-point bytes.
 *
 * WebBluetoothTransport
 *   ├── FtmsProtocolAdapter          (standard Bluetooth FTMS)
 *   └── KettlerAlphaRun200Adapter    (NOT implemented)
 *
 * Do not add a guessed Kettler proprietary codec. Add that adapter only
 * after a GATT report and raw notification capture from the Alpha Run 200.
 */
export interface ProtocolAdapter {
  readonly id: string;
  readonly label: string;
  supports(serviceUuids: string[]): boolean;
  parseNotification(characteristicUuid: string, data: DataView): Partial<TreadmillData> | null;
  encodeRequestControl(): Uint8Array | null;
  encodeStart(): Uint8Array | null;
  encodeStop(): Uint8Array | null;
  encodePause(): Uint8Array | null;
  encodeSetSpeed(kmh: number): Uint8Array | null;
  encodeSetIncline(percent: number): Uint8Array | null;
}

export function selectProtocolAdapter(
  adapters: ProtocolAdapter[],
  serviceUuids: string[],
): ProtocolAdapter | null {
  return adapters.find((adapter) => adapter.supports(serviceUuids)) ?? null;
}
