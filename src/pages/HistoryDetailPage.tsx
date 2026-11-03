import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, PageTitle, Screen } from '../components/ui';
import { workoutRepository } from '../storage/workoutRepository';
import { useSession } from '../state/sessionStore';
import type { WorkoutRecord } from '../workout/types';
import { formatDistanceKm, formatDuration, formatKmh } from '../utils/format';

export function HistoryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const remove = useSession((state) => state.deleteWorkout);
  const [run, setRun] = useState<WorkoutRecord | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void workoutRepository.get(id).then((record) => {
      if (!cancelled) setRun(record ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (run === undefined) {
    return (
      <Screen>
        <p className="text-sm text-mist">Loading run…</p>
      </Screen>
    );
  }
  if (run === null) {
    return (
      <Screen>
        <PageTitle title="Missing run" />
        <Link to="/history" className="text-amber">
          Back to history
        </Link>
      </Screen>
    );
  }

  const rows = [
    ['Date', new Date(run.date).toLocaleString()],
    ['Route', run.routeName],
    ['Distance', `${formatDistanceKm(run.distanceMeters)} km`],
    ['Time', formatDuration(run.durationSeconds)],
    ['Average speed', `${formatKmh(run.averageSpeedKmh, 1)} km/h`],
    ['Max speed', `${formatKmh(run.maxSpeedKmh, 1)} km/h`],
    ['Average heart rate', run.averageHeartRateBpm ? `${Math.round(run.averageHeartRateBpm)} bpm` : '—'],
    ['Max heart rate', run.maxHeartRateBpm ? `${Math.round(run.maxHeartRateBpm)} bpm` : '—'],
    ['Heart rate source', run.heartRateSource || '—'],
    ['Estimated calories', `${Math.round(run.caloriesKcal)} kcal`],
    ['Elevation gain', `${Math.round(run.elevationGainMeters)} m`],
  ];

  return (
    <Screen>
      <PageTitle title={run.routeName} detail={new Date(run.date).toLocaleString()} />
      <dl className="divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-sm text-mist">{label}</dt>
            <dd className="text-right text-paper">{value}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="danger"
        onClick={() => {
          void remove(run.id).then(() => navigate('/history'));
        }}
      >
        Delete run
      </Button>
    </Screen>
  );
}
