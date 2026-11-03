import { Link, useNavigate } from 'react-router-dom';
import { getRouteById } from '../routes/routeCatalog';
import { useSession } from '../state/sessionStore';
import { formatDistanceKm, formatDuration, formatKmh } from '../utils/format';
import { isWorkoutActive } from '../workout/WorkoutStateMachine';
import { MenuLink, PageTitle, Screen, SimulatorBadge, connectionLabel, Button } from '../components/ui';

export function HomePage() {
  const source = useSession((state) => state.source);
  const connectionState = useSession((state) => state.connectionState);
  const workout = useSession((state) => state.workout);
  const history = useSession((state) => state.history);
  const route = workout.routeId ? getRouteById(workout.routeId) : undefined;
  const active = isWorkoutActive(workout.phase);
  const recent = history.slice(0, 3);
  const developerMode = useSession((state) => state.developerMode);
  const startFullDemo = useSession((state) => state.startFullDemo);
  const navigate = useNavigate();

  return (
    <Screen>
      <div className="flex items-start justify-between gap-3">
        <PageTitle title="RUNSCAPE" detail="A route on the screen. The belt decides how fast it moves." />
        {source === 'simulator' ? <SimulatorBadge /> : null}
      </div>

      <p className="text-sm text-mist">
        Current source {source === 'simulator' ? 'Simulator' : 'Bluetooth'} · {connectionLabel(connectionState)}
      </p>

      <Link
        to={active && workout.routeId ? `/workout/${workout.routeId}` : route ? `/workout/${route.id}` : '/routes'}
        className="flex min-h-24 flex-col justify-center rounded-md bg-amber px-4 py-4 text-ink"
      >
        <span className="font-metric text-5xl leading-none">{active ? 'Resume run' : 'Start run'}</span>
        <span className="mt-1 text-sm">
          {active ? 'The current run is still open.' : route ? route.name : 'Choose a route first.'}
        </span>
      </Link>

      <Button
        onClick={() => {
          void startFullDemo().then((ready) => {
            if (ready) navigate('/workout/lakeside');
          });
        }}
      >
        Start full demo
      </Button>

      <nav>
        <MenuLink to="/routes" title="Choose route" detail={route ? route.name : 'Three demo routes'} />
        <MenuLink to="/device" title="Devices" detail="Treadmill, heart rate, video" />
        <MenuLink to="/history" title="Recent workouts" detail={history.length ? `${history.length} saved` : 'None yet'} />
        <MenuLink to="/settings" title="Settings" detail="Heart rate, Cast, incline" />
        {developerMode ? <MenuLink to="/debug" title="Debug" detail="Treadmill, heart rate, video, logs" /> : null}
      </nav>

      {recent.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm text-mist">Latest</h2>
          <ul>
            {recent.map((run) => (
              <li key={run.id} className="border-b border-line">
                <Link to={`/history/${run.id}`} className="block py-3">
                  <span className="block text-paper">{run.routeName}</span>
                  <span className="text-sm text-mist">
                    {formatDistanceKm(run.distanceMeters)} km · {formatDuration(run.durationSeconds)} · avg{' '}
                    {formatKmh(run.averageSpeedKmh, 1)} km/h
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}
