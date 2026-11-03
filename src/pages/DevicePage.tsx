import { useState } from 'react';
import { Button, PageTitle, Screen, SimulatorBadge, connectionLabel } from '../components/ui';
import { HR_PRESETS } from '../heartRate/simulator/SimulatorHeartRateSource';
import { WEB_BLUETOOTH_HR_UNAVAILABLE } from '../heartRate/ble/heartRateConstants';
import { FTMS_MISSING_MESSAGE } from '../treadmill/bluetooth/BleInspector';
import { WEB_BLUETOOTH_UNAVAILABLE } from '../treadmill/bluetooth/webBluetoothTypes';
import { appRuntime } from '../state/runtime';
import { useSession } from '../state/sessionStore';
import { CAST_UNAVAILABLE_MESSAGE } from '../video/castAccess';

export function DevicePage() {
  const source = useSession((state) => state.source);
  const connectionState = useSession((state) => state.connectionState);
  const bluetoothAvailable = useSession((state) => state.bluetoothAvailable);
  const capabilities = useSession((state) => state.capabilities);
  const ftmsDetected = useSession((state) => state.ftmsDetected);
  const gattReport = useSession((state) => state.gattReport);
  const statusDetail = useSession((state) => state.statusDetail);
  const actionError = useSession((state) => state.actionError);
  const connectSimulator = useSession((state) => state.connectSimulator);
  const connectBluetooth = useSession((state) => state.connectBluetooth);
  const forgetBluetooth = useSession((state) => state.forgetBluetooth);
  const disconnect = useSession((state) => state.disconnect);
  const heartRateConnection = useSession((state) => state.heartRateConnection);
  const heartRateName = useSession((state) => state.heartRateName);
  const heartRateDebug = useSession((state) => state.heartRateDebug);
  const connectHeartRate = useSession((state) => state.connectHeartRate);
  const inspectHeartRate = useSession((state) => state.inspectHeartRate);
  const reconnectHeartRate = useSession((state) => state.reconnectHeartRate);
  const connectHeartRateSimulator = useSession((state) => state.connectHeartRateSimulator);
  const disconnectHeartRate = useSession((state) => state.disconnectHeartRate);
  const simulatorHrConnection = useSession((state) => state.simulatorHrConnection);
  const simulatorHrMode = useSession((state) => state.simulatorHrMode);
  const simulatorHrTarget = useSession((state) => state.simulatorHrTarget);
  const simulatorHrBpm = useSession((state) => state.simulatorHrBpm);
  const setSimulatorHrBpm = useSession((state) => state.setSimulatorHrBpm);
  const setSimulatorHrPreset = useSession((state) => state.setSimulatorHrPreset);
  const setSimulatorHrAuto = useSession((state) => state.setSimulatorHrAuto);
  const videoOutput = useSession((state) => state.videoOutput);
  const castState = useSession((state) => state.castState);
  const castDeviceName = useSession((state) => state.castDeviceName);
  const castMessage = useSession((state) => state.castMessage);
  const castToTv = useSession((state) => state.castToTv);
  const stopCasting = useSession((state) => state.stopCasting);
  const [copied, setCopied] = useState(false);

  const hrConnected = heartRateConnection === 'connected';
  const hrBpm = heartRateDebug.parsed && heartRateDebug.parsed.bpm > 0 ? Math.round(heartRateDebug.parsed.bpm) : null;
  const receiving = hrConnected && heartRateDebug.lastUpdate != null && Date.now() - heartRateDebug.lastUpdate < 5000;
  const castAvailable = capabilities.supportsGoogleCast;

  async function copyReport() {
    if (!gattReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(gattReport, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Screen>
      <PageTitle
        title="Devices"
        detail="Treadmill, heart rate, and video each connect on their own. The workout keeps running if a heart-rate sensor or the TV drops."
      />

      <section className="flex flex-col gap-3 border-b border-line pb-5">
        <h2 className="font-metric text-3xl leading-none">Treadmill</h2>
        <p className="text-paper">
          {source === 'simulator' ? 'Simulator' : gattReport?.deviceName || 'Bluetooth treadmill'}
        </p>
        <p className="text-sm text-mist">
          {connectionLabel(connectionState)}
          {source === 'simulator' ? <span className="ml-3"><SimulatorBadge /></span> : null}
        </p>
        <Button variant={source === 'simulator' ? 'primary' : 'quiet'} onClick={() => void connectSimulator()}>
          Use simulator
        </Button>
        {bluetoothAvailable ? null : <p className="text-sm leading-6 text-mist">{WEB_BLUETOOTH_UNAVAILABLE}</p>}
        <Button variant="primary" onClick={() => void connectBluetooth()} disabled={!bluetoothAvailable}>
          {appRuntime.bluetooth.hasRememberedDevice() ? 'Reconnect treadmill' : 'Connect treadmill'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void disconnect()} disabled={source !== 'bluetooth' || connectionState === 'disconnected'}>
            Disconnect
          </Button>
          <Button onClick={() => void forgetBluetooth()} disabled={!appRuntime.bluetooth.hasRememberedDevice()}>
            Forget device
          </Button>
        </div>
        {statusDetail ? <p className="text-sm leading-6 text-mist">{statusDetail}</p> : null}
        {source === 'bluetooth' && ftmsDetected === false ? (
          <p className="text-sm leading-6 text-ember">{FTMS_MISSING_MESSAGE}</p>
        ) : null}
        <Button onClick={() => void copyReport()} disabled={!gattReport}>
          {copied ? 'Copied GATT report' : 'Copy / Export GATT report'}
        </Button>
      </section>

      <section className="flex flex-col gap-3 border-b border-line pb-5">
        <h2 className="font-metric text-3xl leading-none">Heart rate sensor</h2>
        <p className="text-sm text-mist">Current</p>
        <p className="text-paper">{hrConnected ? heartRateName : 'Not connected'}</p>
        {hrConnected ? (
          <>
            <p>
              HR <span className="font-metric text-4xl text-amber">{hrBpm ?? '--'}</span> bpm
            </p>
            <p className="text-sm text-mist">{receiving ? 'Receiving data' : heartRateDebug.statusDetail || 'Waiting for measurements'}</p>
          </>
        ) : (
          <p className="text-sm text-mist">{heartRateDebug.statusDetail || connectionLabel(heartRateConnection)}</p>
        )}
        {capabilities.supportsWebBluetooth ? null : <p className="text-sm leading-6 text-mist">{WEB_BLUETOOTH_HR_UNAVAILABLE}</p>}
        <Button variant="primary" onClick={() => void connectHeartRate()} disabled={!capabilities.supportsWebBluetooth}>
          Connect HR sensor
        </Button>
        {heartRateConnection === 'disconnected' && appRuntime.heartRateBluetooth.hasRememberedDevice() ? (
          <Button onClick={() => void reconnectHeartRate()}>Reconnect HR sensor</Button>
        ) : null}
        <Button onClick={() => void connectHeartRateSimulator()} variant={simulatorHrConnection === 'connected' ? 'primary' : 'quiet'}>
          Use HR simulator
        </Button>
        <Button onClick={() => void disconnectHeartRate()} disabled={!hrConnected && simulatorHrConnection !== 'connected'}>
          Disconnect
        </Button>
        <Button onClick={() => void inspectHeartRate()} disabled={!capabilities.supportsWebBluetooth}>
          Inspect a device
        </Button>
        {actionError ? <p className="text-sm leading-6 text-ember">{actionError}</p> : null}
        {simulatorHrConnection === 'connected' ? (
          <div className="flex flex-col gap-3 rounded-md border border-line p-3">
            <p className="text-sm text-mist">
              Simulator {simulatorHrMode === 'auto' ? 'auto' : 'manual'} · {simulatorHrBpm ?? '--'} bpm
            </p>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex justify-between">
                Manual <span>{simulatorHrTarget} bpm</span>
              </span>
              <input
                type="range"
                min={40}
                max={220}
                step={1}
                value={simulatorHrTarget}
                className="accent-amber"
                onChange={(event) => setSimulatorHrBpm(Number(event.target.value))}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {HR_PRESETS.map((preset) => (
                <Button key={preset.id} className="min-h-11" onClick={() => setSimulatorHrPreset(preset.id)}>
                  {preset.label}
                </Button>
              ))}
              <Button className="min-h-11" variant={simulatorHrMode === 'auto' ? 'primary' : 'quiet'} onClick={setSimulatorHrAuto}>
                Auto
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-metric text-3xl leading-none">Video output</h2>
        <p className="text-paper">{videoOutput === 'cast' && castState === 'connected' ? castDeviceName || 'Chromecast' : 'Phone'}</p>
        <p className="text-sm text-mist">{castState === 'connected' ? 'Casting' : 'Local'}</p>
        {castAvailable ? null : <p className="text-sm leading-6 text-mist">{CAST_UNAVAILABLE_MESSAGE}</p>}
        {castState === 'connected' ? (
          <Button onClick={() => void stopCasting()}>Stop casting</Button>
        ) : (
          <Button variant="primary" onClick={() => void castToTv()} disabled={!castAvailable}>
            Cast to TV
          </Button>
        )}
        {castMessage ? <p className="text-sm leading-6 text-ember">{castMessage}</p> : null}
      </section>
    </Screen>
  );
}
