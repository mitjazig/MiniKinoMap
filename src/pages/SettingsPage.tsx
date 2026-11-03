import { Button, PageTitle, Screen } from '../components/ui';
import type { HrPreference } from '../heartRate/HeartRateSource';
import { useSession } from '../state/sessionStore';

const HR_OPTIONS: Array<{ id: HrPreference; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'external', label: 'External BLE' },
  { id: 'treadmill', label: 'Treadmill' },
  { id: 'simulator', label: 'Simulator' },
];

export function SettingsPage() {
  const autoIncline = useSession((state) => state.autoIncline);
  const maxIncline = useSession((state) => state.maxIncline);
  const weightKg = useSession((state) => state.weightKg);
  const hrPreference = useSession((state) => state.hrPreference);
  const videoOutput = useSession((state) => state.videoOutput);
  const castSync = useSession((state) => state.castSync);
  const developerMode = useSession((state) => state.developerMode);
  const simulatorEnabled = useSession((state) => state.simulatorEnabled);
  const castTestVideoUrl = useSession((state) => state.castTestVideoUrl);
  const pauseYouTubeWhenStopped = useSession((state) => state.pauseYouTubeWhenStopped);
  const maxHeartRate = useSession((state) => state.maxHeartRate);
  const capabilities = useSession((state) => state.capabilities);
  const setAutoIncline = useSession((state) => state.setAutoIncline);
  const setMaxIncline = useSession((state) => state.setMaxIncline);
  const setWeightKg = useSession((state) => state.setWeightKg);
  const setHrPreference = useSession((state) => state.setHrPreference);
  const setVideoOutput = useSession((state) => state.setVideoOutput);
  const setCastSync = useSession((state) => state.setCastSync);
  const setDeveloperMode = useSession((state) => state.setDeveloperMode);
  const setSimulatorEnabled = useSession((state) => state.setSimulatorEnabled);
  const setCastTestVideoUrl = useSession((state) => state.setCastTestVideoUrl);
  const setPauseYouTubeWhenStopped = useSession((state) => state.setPauseYouTubeWhenStopped);
  const setMaxHeartRate = useSession((state) => state.setMaxHeartRate);

  return (
    <Screen>
      <PageTitle
        title="Settings"
        detail="Auto incline sends the route grade to the belt. Heart rate and video choices never mix two sensors into one number."
      />

      <section className="border-b border-line py-4">
        <h2 className="text-sm text-mist">Capabilities</h2>
        <ul className="mt-2 text-sm leading-7">
          <Capability name="Web Bluetooth" on={capabilities.supportsWebBluetooth} />
          <Capability name="Google Cast" on={capabilities.supportsGoogleCast} />
          <Capability name="PWA" on={capabilities.supportsPWA} />
          <Capability name="Offline storage" on={capabilities.supportsIndexedDB} />
        </ul>
      </section>

      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        <div>
          <p>Pause YouTube when treadmill stops</p>
          <p className="text-sm text-mist">After two seconds under 0.3 km/h the scenic video pauses.</p>
        </div>
        <Button
          variant={pauseYouTubeWhenStopped ? 'primary' : 'quiet'}
          onClick={() => setPauseYouTubeWhenStopped(!pauseYouTubeWhenStopped)}
        >
          {pauseYouTubeWhenStopped ? 'On' : 'Off'}
        </Button>
      </div>

      <label className="flex flex-col gap-2 border-b border-line py-4">
        <span>Max heart rate</span>
        <input
          type="number"
          min={100}
          max={220}
          placeholder="Not set"
          className="min-h-12 rounded-md border border-line bg-ink px-3"
          value={maxHeartRate ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            setMaxHeartRate(raw === '' ? null : Number(raw));
          }}
        />
        <span className="text-sm leading-6 text-mist">
          Used only for Z1–Z5. Leave it empty if you do not know it. Age is never guessed.
        </span>
      </label>

      <label className="flex flex-col gap-2 border-b border-line py-4">
        <span>Heart rate source</span>
        <select
          className="min-h-12 rounded-md border border-line bg-ink px-3"
          value={hrPreference}
          onChange={(event) => setHrPreference(event.target.value as HrPreference)}
        >
          {HR_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-mist">Auto uses an external sensor, then the treadmill, then the simulator.</span>
      </label>

      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        <div>
          <p>Video output</p>
          <p className="text-sm text-mist">Cast opens the Google Cast device chooser.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={videoOutput === 'local' ? 'primary' : 'quiet'} onClick={() => void setVideoOutput('local')}>
            Local
          </Button>
          <Button variant={videoOutput === 'cast' ? 'primary' : 'quiet'} onClick={() => void setVideoOutput('cast')}>
            Cast
          </Button>
        </div>
      </div>

      <label className="flex flex-col gap-2 border-b border-line py-4">
        <span>Cast sync sensitivity</span>
        <select
          className="min-h-12 rounded-md border border-line bg-ink px-3"
          value={castSync}
          onChange={(event) => setCastSync(event.target.value === 'normal' ? 'normal' : 'normal')}
        >
          <option value="normal">Normal</option>
        </select>
        <span className="text-sm text-mist">Under 2 seconds is left alone. Over 5 seconds seeks.</span>
      </label>

      <label className="flex flex-col gap-2 border-b border-line py-4">
        <span>Test video URL for Chromecast</span>
        <input
          className="min-h-12 rounded-md border border-line bg-ink px-3 text-paper"
          value={castTestVideoUrl}
          placeholder="https://example.com/route.mp4"
          onChange={(event) => setCastTestVideoUrl(event.target.value)}
        />
        <span className="text-sm leading-6 text-mist">
          Chromecast cannot play localhost, blob, or files that only exist in this browser. Put a public MP4 here while developing.
        </span>
      </label>

      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        <div>
          <p>Developer mode</p>
          <p className="text-sm text-mist">Shows the debug screen.</p>
        </div>
        <Button variant={developerMode ? 'primary' : 'quiet'} onClick={() => setDeveloperMode(!developerMode)}>
          {developerMode ? 'On' : 'Off'}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        <div>
          <p>Simulator</p>
          <p className="text-sm text-mist">The virtual belt used when no treadmill is connected.</p>
        </div>
        <Button variant={simulatorEnabled ? 'primary' : 'quiet'} onClick={() => void setSimulatorEnabled(!simulatorEnabled)}>
          {simulatorEnabled ? 'On' : 'Off'}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        <div>
          <p>Auto incline</p>
          <p className="text-sm text-mist">Feature flag AUTO_INCLINE_ENABLED</p>
        </div>
        <Button variant={autoIncline ? 'primary' : 'quiet'} onClick={() => setAutoIncline(!autoIncline)}>
          {autoIncline ? 'On' : 'Off'}
        </Button>
      </div>

      <label className="flex flex-col gap-2 border-b border-line py-4">
        <span className="flex justify-between">
          Max incline <span>{maxIncline.toFixed(0)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={maxIncline}
          className="accent-amber"
          onChange={(event) => setMaxIncline(Number(event.target.value))}
        />
        <span className="text-sm text-mist">Commands are clamped to this limit before they are sent.</span>
      </label>

      <label className="flex flex-col gap-2 py-4">
        <span className="flex justify-between">
          Body weight <span>{weightKg.toFixed(0)} kg</span>
        </span>
        <input
          type="range"
          min={40}
          max={150}
          step={1}
          value={weightKg}
          className="accent-amber"
          onChange={(event) => setWeightKg(Number(event.target.value))}
        />
        <span className="text-sm text-mist">Used only for the calorie estimate.</span>
      </label>
    </Screen>
  );
}

function Capability({ name, on }: { name: string; on: boolean }) {
  return (
    <li className="flex justify-between gap-4">
      <span>{name}</span>
      <span className={on ? 'text-paper' : 'text-mist'}>{on ? '✓' : '✗'}</span>
    </li>
  );
}
