import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../state/sessionStore';
import { isWorkoutActive } from '../workout/WorkoutStateMachine';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/routes', label: 'Routes', end: false },
  { to: '/device', label: 'Device', end: false },
  { to: '/history', label: 'History', end: false },
];

export function AppShell() {
  const workout = useSession((state) => state.workout);
  const active = isWorkoutActive(workout.phase);
  return (
    <div className="app-shell min-h-dvh pb-24">
      <div className="app-main">
        {active ? (
          <NavLink
            to={`/workout/${workout.routeId ?? ''}`}
            className="block bg-amber px-4 py-3 text-center text-sm font-medium text-ink"
          >
            Run in progress · tap to return
          </NavLink>
        ) : null}
        <Outlet />
      </div>
      <nav className="app-nav fixed inset-x-0 bottom-0 z-20 border-t border-line bg-asphalt/95 pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-3xl grid-cols-4">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `flex min-h-16 items-center justify-center text-sm ${isActive ? 'text-paper' : 'text-mist'}`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
