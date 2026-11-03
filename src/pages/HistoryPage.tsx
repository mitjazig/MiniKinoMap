import { Link } from 'react-router-dom';
import { PageTitle, Screen } from '../components/ui';
import { useSession } from '../state/sessionStore';
import { formatDistanceKm, formatDuration, formatKmh } from '../utils/format';

export function HistoryPage() {
  const history = useSession((state) => state.history);
  const historyReady = useSession((state) => state.historyReady);
  const historyError = useSession((state) => state.historyError);

  return (
    <Screen>
      <PageTitle title="History" detail="Runs stay on this device. Nothing is uploaded." />
      {historyError ? <p className="text-sm text-ember">{historyError}</p> : null}
      {!historyReady ? <p className="text-sm text-mist">Loading runs…</p> : null}
      {historyReady && history.length === 0 ? (
        <p className="text-sm text-mist">No runs yet. Start a route in the simulator.</p>
      ) : (
        <ul>
          {history.map((run) => (
            <li key={run.id} className="border-b border-line">
              <Link to={`/history/${run.id}`} className="block py-4">
                <span className="block text-sm text-mist">
                  {new Date(run.date).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="mt-1 block text-lg">{run.routeName}</span>
                <span className="text-sm text-paper">
                  {formatDistanceKm(run.distanceMeters)} km · {formatDuration(run.durationSeconds)} · avg{' '}
                  {formatKmh(run.averageSpeedKmh, 1)} km/h
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
