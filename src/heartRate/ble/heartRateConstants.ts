/** Bluetooth SIG Heart Rate Service. These are standard UUIDs, not a Garmin protocol. */
export const HEART_RATE_SERVICE_UUID = 0x180d;
export const HEART_RATE_MEASUREMENT_UUID = 0x2a37;
export const BODY_SENSOR_LOCATION_UUID = 0x2a38;
/** Present on some sensors. This app never writes it. */
export const HEART_RATE_CONTROL_POINT_UUID = 0x2a39;

export const HR_SERVICE_SHORT = '180d';
export const HR_MEASUREMENT_SHORT = '2a37';
export const HR_LOCATION_SHORT = '2a38';
export const HR_CONTROL_SHORT = '2a39';

export const WEB_BLUETOOTH_HR_UNAVAILABLE =
  'Web Bluetooth is not available in this browser. A heart-rate sensor needs Chrome or Edge on https:// or localhost.';

export const HR_SERVICE_MISSING =
  'This device does not expose the standard Bluetooth Heart Rate Service (0x180D). On a Garmin watch, turn on Broadcast Heart Rate and try again. Browser and watch firmware decide whether the watch is visible as a heart-rate sensor. Use the heart-rate simulator and copy the debug report if it is not.';

export const HR_DISCONNECTED = 'Heart rate sensor disconnected';
