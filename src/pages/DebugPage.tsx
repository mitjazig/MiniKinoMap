import { useState } from 'react';
import { SimulatorPanel } from '../components/SimulatorPanel';
import { Button, PageTitle, Screen, connectionLabel } from '../components/ui';
import type { LogCategory } from '../logging/logger';
import { buildDebugReport, buildHeartRateDebugReport, useSession } from '../state/sessionStore';
import { formatClock, formatKmh } from '../utils/format';

const FILTERS: Array<LogCategory | 'all'> = [
  'all',
  'app',
  'workout',
  'treadmill',
  'bluetooth',
  'heartRate',
  'video',
  'cast',
  'youtube',
  'storage',
];

export function DebugPage() {
  const source = useSession((state) => state.source);
  const connectionState = useSession((state) => state.connectionState);
  const latest = useSession((state) => state.latest);
  const packets = useSession((state) => state.packets);
  const gattReport = useSession((state) => state.gattReport);
  const ftmsDetected = useSession((state) => state.ftmsDetected);
  const workout = useSession((state) => state.workout);
  const heartRateDebug = useSession((state) => state.heartRateDebug);
  const hrPreference = useSession((state) => state.hrPreference);
  const videoDebug = useSession((state) => state.videoDebug);
  const castState = useSession((state) => state.castState);
  const castDeviceName = useSession((state) => state.castDeviceName);
  const youtubeDebug = useSession((state) => state.youtubeDebug);
  const devLogs = useSession((state) => state.devLogs);
  const clearLogs = useSession((state) => state.clearLogs);
  const [copied, setCopied] = useState<'report' | 'gatt' | 'hr' | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  const visibleLogs = filter === 'all' ? devLogs : devLogs.filter((entry) => entry.category === filter);

  async function copy(kind: 'report' | 'gatt' | 'hr') {
    const text =
      kind === 'report'
        ? buildDebugReport()
        : kind === 'hr'
          ? buildHeartRateDebugReport()
          : JSON.stringify(gattReport, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Screen>
      <PageTitle
        title="Debug"
        detail="Treadmill, heart rate, and video side by side. Export the report before changing protocol code."
      />

      <div className="grid gap-6 md:grid-cols-3">
        <section className="flex flex-col gap-2 border-b border-line pb-4 md:border-b-0 md:border-r md:pr-4">
          <h2 className="font-metric text-3xl leading-none">Treadmill</h2>
          <Item label="Transport" value={source === 'simulator' ? 'Simulator' : 'Web Bluetooth'} />
          <Item label="Connection" value={connectionLabel(connectionState)} />
          <Item label="Speed" value={latest ? `${formatKmh(latest.speedKmh, 2)} km/h` : '—'} />
          <Item label="Incline" value={latest?.inclinePercent != null ? `${formatKmh(latest.inclinePercent, 1)} %` : '—'} />
          <Item label="Distance" value={latest ? `${latest.distanceMeters.toFixed(1)} m` : '—'} />
          <Item label="FTMS" value={ftmsDetected == null ? 'Not checked' : ftmsDetected ? 'Service found' : 'Not detected'} />
          <Item label="Workout" value={workout.phase} />
          <h3 className="mt-2 text-sm text-mist">Raw BLE</h3>
          {packets.length === 0 ? <p className="text-sm text-mist">No packets yet.</p> : null}
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {packets.slice().reverse().slice(0, 6).map((packet) => (
              <li key={packet.id} className="text-xs">
                <p className="text-mist">
                  {formatClock(packet.timestamp)} · {packet.characteristicUuid}
                  {packet.corrupted ? ' · corrupted' : ''}
                </p>
                <p className="break-all font-mono leading-5 text-paper">{packet.hex}</p>
                {packet.error ? <p className="text-ember">{packet.error}</p> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2 border-b border-line pb-4 md:border-b-0 md:border-r md:pr-4">
          <h2 className="font-metric text-3xl leading-none">Heart rate</h2>
          <Item label="Source" value={workout.liveHeartRateLabel || hrPreference} />
          <Item label="Device" value={heartRateDebug.deviceName || '—'} />
          <Item label="Connection" value={connectionLabel(heartRateDebug.connectionState)} />
          <Item label="BPM" value={heartRateDebug.parsed && heartRateDebug.parsed.bpm > 0 ? String(heartRateDebug.parsed.bpm) : '—'} />
          <Item label="Service" value={heartRateDebug.service} />
          <Item label="Characteristic" value={heartRateDebug.measurementCharacteristic} />
          <Item label="Contact" value={contactLabel(heartRateDebug.parsed?.contactDetected)} />
          <Item label="RR intervals" value={rrLabel(heartRateDebug.parsed?.rrIntervalsMs)} />
          <Item label="Last update" value={heartRateDebug.lastUpdate ? formatClock(heartRateDebug.lastUpdate) : '—'} />
          <h3 className="mt-2 text-sm text-mist">Raw packet</h3>
          <p className="break-all font-mono text-xs leading-5 text-paper">{heartRateDebug.lastPacketHex || '—'}</p>
          {heartRateDebug.parseError ? <p className="text-sm text-ember">{heartRateDebug.parseError}</p> : null}
          <Button onClick={() => void copy('hr')}>{copied === 'hr' ? 'Copied HR report' : 'Copy HR debug report'}</Button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-metric text-3xl leading-none">Video</h2>
          <Item label="Output" value={videoDebug.output === 'cast' ? 'cast' : 'local'} />
          <Item label="State" value={videoDebug.state} />
          <Item label="Current time" value={`${videoDebug.currentTime.toFixed(2)} s`} />
          <Item label="Target time" value={`${videoDebug.targetTime.toFixed(2)} s`} />
          <Item label="Drift" value={`${videoDebug.drift.toFixed(2)} s`} />
          <Item label="Last correction" value={videoDebug.lastCorrection} />
          <Item label="Cast state" value={castState} />
          <Item label="Cast device" value={castDeviceName || '—'} />
        </section>
      </div>

      <section className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <h2 className="font-metric text-3xl leading-none sm:col-span-2">YouTube</h2>
        <Item label="videoId" value={youtubeDebug.videoId || '—'} />
        <Item label="playerState" value={youtubeDebug.playerState} />
        <Item label="currentTime" value={`${youtubeDebug.currentTime.toFixed(1)} s`} />
        <Item label="duration" value={`${youtubeDebug.duration.toFixed(1)} s`} />
        <Item label="playbackRate" value={String(youtubeDebug.playbackRate)} />
        <Item label="availablePlaybackRates" value={youtubeDebug.availablePlaybackRates.join(', ') || '—'} />
        <Item label="routeSync" value={youtubeDebug.routeSync ? 'on' : 'off'} />
        <Item label="targetTime" value={`${youtubeDebug.targetTime.toFixed(1)} s`} />
        <Item label="driftSeconds" value={youtubeDebug.driftSeconds.toFixed(1)} />
        <Item label="lastSeek" value={youtubeDebug.lastSeek == null ? '—' : `${youtubeDebug.lastSeek.toFixed(1)} s`} />
        <Item
          label="lastPlayerError"
          value={
            youtubeDebug.lastPlayerError
              ? `${youtubeDebug.lastPlayerError}${youtubeDebug.lastPlayerErrorCode != null ? ` (${youtubeDebug.lastPlayerErrorCode})` : ''}`
              : '—'
          }
        />
      </section>

      {gattReport ? (
        <section>
          <h2 className="font-metric text-3xl leading-none">Treadmill GATT</h2>
          {gattReport.services.map((service) => (
            <div key={service.uuid} className="mt-3">
              <p className="text-sm text-paper">{service.uuid}</p>
              <ul className="mt-1 text-xs leading-5 text-mist">
                {service.characteristics.map((characteristic) => (
                  <li key={characteristic.uuid}>
                    {characteristic.uuid} · {propertyList(characteristic.properties)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-metric text-3xl leading-none">Log</h2>
          <Button onClick={clearLogs}>Clear log</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={`min-h-10 rounded-md border px-3 text-sm ${filter === item ? 'border-amber text-amber' : 'border-line text-mist'}`}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <ul className="mt-3 max-h-72 overflow-y-auto font-mono text-xs leading-5">
          {visibleLogs.slice().reverse().map((entry) => (
            <li key={entry.id} className={entry.level === 'error' ? 'text-ember' : entry.level === 'warn' ? 'text-amber' : 'text-mist'}>
              [{formatClock(entry.timestamp)}] {entry.category} {entry.message}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="primary" onClick={() => void copy('report')}>
          {copied === 'report' ? 'Copied full report' : 'Export full debug report'}
        </Button>
        <Button onClick={() => void copy('gatt')} disabled={!gattReport}>
          {copied === 'gatt' ? 'Copied GATT report' : 'Copy / Export GATT report'}
        </Button>
      </div>

      {source === 'simulator' ? (
        <div className="border-t border-line pt-4">
          <SimulatorPanel embedded />
        </div>
      ) : (
        <p className="text-sm text-mist">Simulator controls are hidden while Bluetooth is the active source.</p>
      )}
    </Screen>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="block text-mist">{label}</span>
      {value}
    </p>
  );
}

function contactLabel(value: boolean | undefined): string {
  if (value == null) return '—';
  return value ? 'Detected' : 'Not detected';
}

function rrLabel(values: number[] | undefined): string {
  if (!values || values.length === 0) return '—';
  return values.map((value) => `${Math.round(value)} ms`).join(', ');
}

function propertyList(properties: {
  read: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
  notify: boolean;
  indicate: boolean;
}): string {
  return [
    properties.read ? 'read' : '',
    properties.write ? 'write' : '',
    properties.writeWithoutResponse ? 'writeWithoutResponse' : '',
    properties.notify ? 'notify' : '',
    properties.indicate ? 'indicate' : '',
  ]
    .filter(Boolean)
    .join(', ') || 'none';
}
