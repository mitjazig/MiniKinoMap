import { dataViewToHex } from '../../utils/hex';
import { BLE_UUID, FTMS_UUID, OPTIONAL_SERVICE_UUIDS, sameUuid } from './ftmsConstants';
import { parseFtmsFeatures, parseSupportedInclineRange, parseSupportedSpeedRange } from './ftmsControl';

export type CharacteristicProperties = {
  read: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
  notify: boolean;
  indicate: boolean;
};

export type GattCharacteristicReport = {
  uuid: string;
  properties: CharacteristicProperties;
};

export type GattServiceReport = {
  uuid: string;
  characteristics: GattCharacteristicReport[];
  error?: string;
};

export type GattReport = {
  deviceName: string;
  deviceId?: string;
  generatedAt: string;
  ftmsServiceFound: boolean;
  limitation: string;
  requestedOptionalServices: string[];
  services: GattServiceReport[];
  deviceInformation?: {
    manufacturer?: string;
    model?: string;
    firmware?: string;
  };
  ftms?: {
    featureHex?: string;
    featureDecode?: ReturnType<typeof parseFtmsFeatures>;
    supportedSpeedRange?: ReturnType<typeof parseSupportedSpeedRange>;
    supportedInclineRange?: ReturnType<typeof parseSupportedInclineRange>;
    statusSample?: string;
  };
};

type GattCharacteristicLike = {
  uuid: string;
  properties: CharacteristicProperties;
  readValue?: () => Promise<DataView>;
};

type GattServiceLike = {
  uuid: string;
  getCharacteristics: () => Promise<GattCharacteristicLike[]>;
};

type GattServerLike = {
  getPrimaryServices?: () => Promise<GattServiceLike[]>;
  getPrimaryService?: (uuid: string) => Promise<GattServiceLike>;
};

const ENUMERATION_LIMIT =
  'Web Bluetooth only exposes services listed in optionalServices or filters. Proprietary services with unknown UUIDs will not appear until those UUIDs are added before connecting.';

function propsOf(properties: CharacteristicProperties): CharacteristicProperties {
  return {
    read: Boolean(properties.read),
    write: Boolean(properties.write),
    writeWithoutResponse: Boolean(properties.writeWithoutResponse),
    notify: Boolean(properties.notify),
    indicate: Boolean(properties.indicate),
  };
}

async function readText(characteristic: GattCharacteristicLike | undefined): Promise<string | undefined> {
  if (!characteristic?.properties.read || !characteristic.readValue) return undefined;
  try {
    const view = await characteristic.readValue();
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const text = new TextDecoder().decode(bytes).replaceAll('\u0000', '').trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function readView(characteristic: GattCharacteristicLike | undefined): Promise<DataView | null> {
  if (!characteristic?.properties.read || !characteristic.readValue) return null;
  try {
    return await characteristic.readValue();
  } catch {
    return null;
  }
}

export async function inspectGattServer(
  server: GattServerLike,
  device: { name?: string | null; id?: string },
): Promise<{ report: GattReport; warnings: string[] }> {
  const warnings: string[] = [];
  const services: GattServiceLike[] = [];

  if (server.getPrimaryServices) {
    try {
      const listed = await server.getPrimaryServices();
      services.push(...listed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(
        `Browser refused a full service list (${message}). Probing the services requested in optionalServices instead.`,
      );
    }
  }

  if (services.length === 0 && server.getPrimaryService) {
    for (const uuid of OPTIONAL_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(uuid);
        if (service) services.push(service);
      } catch {
        // Not present, or blocked because it was not requested. Both are expected.
      }
    }
    if (services.length === 0) {
      warnings.push(ENUMERATION_LIMIT);
    }
  }

  const serviceReports: GattServiceReport[] = [];
  for (const service of services) {
    try {
      const characteristics = await service.getCharacteristics();
      serviceReports.push({
        uuid: service.uuid,
        characteristics: characteristics.map((characteristic) => ({
          uuid: characteristic.uuid,
          properties: propsOf(characteristic.properties),
        })),
      });
    } catch (error) {
      serviceReports.push({
        uuid: service.uuid,
        characteristics: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ftms = services.find((service) => sameUuid(service.uuid, FTMS_UUID.service));
  const report: GattReport = {
    deviceName: device.name || 'Unnamed device',
    deviceId: device.id,
    generatedAt: new Date().toISOString(),
    ftmsServiceFound: Boolean(ftms),
    limitation: ENUMERATION_LIMIT,
    requestedOptionalServices: [...OPTIONAL_SERVICE_UUIDS],
    services: serviceReports,
  };

  if (ftms) {
    try {
      const characteristics = await ftms.getCharacteristics();
      const find = (uuid: number) => characteristics.find((item) => sameUuid(item.uuid, uuid));
      const featureView = await readView(find(FTMS_UUID.feature));
      const speedView = await readView(find(FTMS_UUID.supportedSpeedRange));
      const inclineView = await readView(find(FTMS_UUID.supportedInclinationRange));
      report.ftms = {
        featureHex: featureView ? dataViewToHex(featureView) : undefined,
        featureDecode: featureView ? parseFtmsFeatures(featureView) ?? undefined : undefined,
        supportedSpeedRange: speedView ? parseSupportedSpeedRange(speedView) ?? undefined : undefined,
        supportedInclineRange: inclineView ? parseSupportedInclineRange(inclineView) ?? undefined : undefined,
      };
    } catch (error) {
      warnings.push(
        `FTMS service was found, but reading its characteristics failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const info = services.find((service) => sameUuid(service.uuid, BLE_UUID.deviceInformation));
  if (info) {
    try {
      const characteristics = await info.getCharacteristics();
      const find = (uuid: number) => characteristics.find((item) => sameUuid(item.uuid, uuid));
      report.deviceInformation = {
        manufacturer: await readText(find(BLE_UUID.manufacturerName)),
        model: await readText(find(BLE_UUID.modelNumber)),
        firmware: await readText(find(BLE_UUID.firmwareRevision)),
      };
    } catch {
      warnings.push('Device Information service was visible, but its characteristics could not be read.');
    }
  }

  if (!report.ftmsServiceFound) {
    warnings.push(
      'FTMS service was not detected. This treadmill may use a proprietary Kettler protocol. Use BLE Inspector and export the detected GATT structure.',
    );
  }

  return { report, warnings };
}

export const FTMS_MISSING_MESSAGE =
  'FTMS service was not detected. This treadmill may use a proprietary Kettler protocol. Use BLE Inspector and export the detected GATT structure.';
