import { useEffect, useState } from 'react';
import { appRuntime } from '../state/runtime';
import type { SimulatorSnapshot } from '../treadmill/simulator/SimulatorEngine';
import { SCENARIOS, type ScenarioId } from '../treadmill/simulator/scenarios';
import { SIMULATOR_MAX_INCLINE_PERCENT, SIMULATOR_MAX_SPEED_KMH } from '../config';
import { formatKmh } from '../utils/format';
import { Button } from './ui';

const simulator = appRuntime.simulator;

const presets = [
  { label: 'Walk', speed: 4 },
  { label: 'Jog', speed: 7 },
  { label: 'Run', speed: 10 },
  { label: 'Sprint', speed: 15 },
];

export function SimulatorPanel({ embedded = false }: { embedded?: boolean }) {
  const snap = useSimulator();
  return (
    <section className={embedded ? 'flex flex-col gap-4' : 'flex max-h-[70vh] flex-col gap-4 overflow-y-auto'}>
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-metric text-3xl leading-none">Simulator</h2>
        <p className="text-sm text-mist">{snap.connected ? 'Connected' : 'Disconnected'}</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void simulator.connect()} disabled={snap.connected}>
          Connect
        </Button>
        <Button onClick={() => void simulator.disconnect()} disabled={!snap.connected}>
          Disconnect
        </Button>
        <Button variant="primary" onClick={() => void simulator.start()} disabled={!snap.connected || snap.running}>
          Start belt
        </Button>
        <Button onClick={() => void simulator.pause()} disabled={!snap.running}>
          Pause belt
        </Button>
      </div>

      <Control
        label="Speed"
        value={`${formatKmh(snap.targetSpeedKmh, 1)} km/h`}
        actual={`${formatKmh(snap.speedKmh, 1)} actual`}
        min={0}
        max={SIMULATOR_MAX_SPEED_KMH}
        step={0.1}
        disabled={!snap.connected || snap.scenarioOwnsSpeed}
        current={snap.targetSpeedKmh}
        onChange={(value) => void simulator.setTargetSpeed(value)}
      />
      <div className="grid grid-cols-5 gap-2">
        {presets.map((preset) => (
          <Button key={preset.label} className="px-1 text-sm" onClick={() => void simulator.setTargetSpeed(preset.speed)}>
            {preset.label}
          </Button>
        ))}
        <Button className="px-1 text-sm" onClick={() => void simulator.setTargetSpeed(0)}>
          0
        </Button>
      </div>

      <Control
        label="Incline"
        value={`${formatKmh(snap.targetInclinePercent, 1)}%`}
        actual={`${formatKmh(snap.inclinePercent, 1)}% actual`}
        min={0}
        max={SIMULATOR_MAX_INCLINE_PERCENT}
        step={0.5}
        disabled={!snap.connected || snap.scenarioOwnsIncline}
        current={snap.targetInclinePercent}
        onChange={(value) => void simulator.setTargetIncline(value)}
      />
      {snap.scenarioOwnsIncline ? (
        <p className="text-sm text-mist">This scenario is setting the incline. Auto incline waits.</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-mist">Heart rate</p>
          <p className="font-metric text-3xl leading-none">{Math.round(snap.heartRateBpm)} bpm</p>
        </div>
        <Button
          onClick={() => (snap.heartRateMode === 'auto' ? simulator.setManualHeartRate(snap.manualHeartRateBpm) : simulator.setHeartRateAuto())}
        >
          {snap.heartRateMode === 'auto' ? 'Auto' : 'Manual'}
        </Button>
      </div>
      <Control
        label="Manual heart rate"
        value={`${snap.manualHeartRateBpm} bpm`}
        min={60}
        max={200}
        step={1}
        disabled={snap.heartRateMode === 'auto'}
        current={snap.manualHeartRateBpm}
        onChange={(value) => simulator.setManualHeartRate(value)}
      />
      <p className="text-sm text-mist">Cadence {snap.cadenceSpm ? `${snap.cadenceSpm} spm` : '—'} · model only, not an FTMS field</p>

      <label className="flex flex-col gap-2 text-sm">
        Scenario
        <select
          className="min-h-12 rounded-md border border-line bg-deck px-3"
          value={snap.scenario}
          onChange={(event) => simulator.setScenario(event.target.value as ScenarioId)}
        >
          {SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label} — {scenario.detail}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2">
        {([1, 2, 5] as const).map((scale) => (
          <Button
            key={scale}
            variant={snap.timeScale === scale ? 'primary' : 'quiet'}
            onClick={() => simulator.setTimeScale(scale)}
          >
            x{scale}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void simulator.reset()} disabled={snap.running}>
          Reset
        </Button>
        <Button variant="danger" onClick={() => void simulator.simulateDisconnect()}>
          Simulate disconnect
        </Button>
      </div>

      <fieldset className="grid grid-cols-2 gap-3 text-sm">
        <legend className="mb-2 text-mist">Packet corruption</legend>
        <Choice
          name="corruption"
          label="Off"
          checked={snap.packetCorruption === 'off'}
          onChange={() => simulator.setPacketCorruption('off')}
        />
        <Choice
          name="corruption"
          label="Occasional"
          checked={snap.packetCorruption === 'occasional'}
          onChange={() => simulator.setPacketCorruption('occasional')}
        />
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-3 text-sm">
        <legend className="mb-2 text-mist">Sensor dropout</legend>
        <Choice
          name="dropout"
          label="Off"
          checked={snap.sensorDropout === 'off'}
          onChange={() => simulator.setSensorDropout('off')}
        />
        <Choice
          name="dropout"
          label="Occasional"
          checked={snap.sensorDropout === 'occasional'}
          onChange={() => simulator.setSensorDropout('occasional')}
        />
      </fieldset>
      <p className="text-xs text-mist">
        Dropped packets {snap.dropoutCount} · corrupted {snap.corruptCount}
      </p>
    </section>
  );
}

function useSimulator(): SimulatorSnapshot {
  const [snap, setSnap] = useState(() => simulator.getSnapshot());
  useEffect(() => {
    setSnap(simulator.getSnapshot());
    return simulator.subscribeSnapshot((next) => setSnap(next));
  }, []);
  return snap;
}

function Control({
  label,
  value,
  actual,
  min,
  max,
  step,
  current,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  actual?: string;
  min: number;
  max: number;
  step: number;
  current: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-mist">{label}</span>
        <span className="text-right">
          <span className="font-metric text-3xl leading-none">{value}</span>
          {actual ? <span className="mt-1 block text-xs text-mist">{actual}</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button className="min-w-14 px-0" disabled={disabled} onClick={() => onChange(round(current - step, step))}>
          −
        </Button>
        <input
          className="h-8 w-full accent-amber"
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <Button className="min-w-14 px-0" disabled={disabled} onClick={() => onChange(round(current + step, step))}>
          +
        </Button>
      </div>
    </div>
  );
}

function Choice({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-2 rounded-md border border-line px-3">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function round(value: number, step: number): number {
  const places = step < 1 ? 1 : 0;
  return Number(value.toFixed(places));
}
