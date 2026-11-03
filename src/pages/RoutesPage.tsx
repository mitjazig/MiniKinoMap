import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ElevationProfile } from '../components/ElevationProfile';
import { Button, PageTitle, Screen } from '../components/ui';
import { listRoutes } from '../routes/routeCatalog';
import { elevationGainMeters } from '../routes/elevation';
import { isYouTubeRoute, mediaOf } from '../routes/mediaOf';
import type { Route, RouteDifficulty } from '../routes/routeTypes';
import { useSession } from '../state/sessionStore';
import { formatDistanceKm, formatDuration } from '../utils/format';
import { youTubeThumbnailUrl } from '../youtube/parseYouTubeUrl';

type Filter = 'all' | 'mountain' | 'walking' | 'easy' | 'moderate' | 'hard' | 'youtube' | 'native';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mountain', label: 'Mountain' },
  { id: 'walking', label: 'Walking' },
  { id: 'easy', label: 'Easy' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'hard', label: 'Hard' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'native', label: 'Native' },
];

export function RoutesPage() {
  const routeRevision = useSession((state) => state.routeRevision);
  const deleteYouTubeRoute = useSession((state) => state.deleteYouTubeRoute);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const routes = useMemo(() => {
    void routeRevision;
    return listRoutes().filter((route) => matches(route, filter, query));
  }, [filter, query, routeRevision]);

  return (
    <Screen>
      <PageTitle
        title="Routes"
        detail="A route is what you watch. A workout is how you walk. The same video can be used with more than one plan."
      />
      <Link to="/routes/new" className="text-amber">
        Add YouTube route
      </Link>
      <input
        className="min-h-12 rounded-md border border-line bg-ink px-3 text-paper"
        value={query}
        placeholder="Search, for example alps"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`min-h-10 rounded-md border px-3 text-sm ${filter === item.id ? 'border-amber text-amber' : 'border-line text-mist'}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-6">
        {routes.map((route) => (
          <RouteCard key={route.id} route={route} onDelete={() => void deleteYouTubeRoute(route.id)} />
        ))}
      </ul>
      {routes.length === 0 ? <p className="text-sm text-mist">No routes match that search.</p> : null}
    </Screen>
  );
}

function RouteCard({ route, onDelete }: { route: Route; onDelete: () => void }) {
  const youtube = isYouTubeRoute(route);
  const media = mediaOf(route);
  const videoId = media.type === 'youtube' ? media.videoId : '';
  const thumb = videoId ? youTubeThumbnailUrl(videoId) : null;
  const scenic = route.playbackMode === 'scenic' || (youtube && route.playbackMode !== 'synced');
  const gain = elevationGainMeters(route.elevationProfile, route.totalDistanceMeters);

  return (
    <li className="border-b border-line pb-5">
      {thumb ? (
        <img src={thumb} alt="" className="mb-3 aspect-video w-full rounded-md object-cover" />
      ) : null}
      <h2 className="font-metric text-4xl leading-none">{route.name}</h2>
      <p className="mt-2 text-sm text-mist">
        {youtube ? 'YouTube' : 'Native'}
        {route.tags?.includes('mountain') ? ' · Mountain' : ''}
        {route.tags?.includes('walking') || route.tags?.includes('hiking') ? ' · Walking' : ''}
      </p>
      {route.description ? <p className="mt-2 max-w-prose text-sm leading-6 text-mist">{route.description}</p> : null}
      <p className="mt-2 text-sm text-paper">
        {scenic ? 'Scenic' : null}
        {!scenic && route.totalDistanceMeters > 0 ? `${formatDistanceKm(route.totalDistanceMeters, 1)} km` : null}
        {route.videoDurationSeconds > 0 ? ` · ${formatDuration(route.videoDurationSeconds)}` : null}
        {route.difficulty ? ` · ${labelDifficulty(route.difficulty)}` : null}
        {!youtube && gain > 0 ? ` · ${Math.round(gain)} m up` : null}
      </p>
      {!youtube ? (
        <div className="mt-3">
          <ElevationProfile profile={route.elevationProfile} progressMeters={0} inclinePercent={0} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/workout/${route.id}`} className="inline-flex min-h-14 items-center rounded-md bg-amber px-4 text-ink">
          Start walk
        </Link>
        {route.userCreated ? (
          <>
            <Link to={`/routes/${route.id}/edit`} className="inline-flex min-h-14 items-center rounded-md border border-line px-4">
              Edit route
            </Link>
            <Button variant="danger" onClick={onDelete}>
              Delete route
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function matches(route: Route, filter: Filter, query: string): boolean {
  const haystack = `${route.name} ${route.description ?? ''} ${(route.tags ?? []).join(' ')}`.toLowerCase();
  if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
  if (filter === 'all') return true;
  if (filter === 'youtube') return isYouTubeRoute(route);
  if (filter === 'native') return !isYouTubeRoute(route);
  if (filter === 'mountain') return route.tags?.includes('mountain') ?? false;
  if (filter === 'walking') return Boolean(route.tags?.includes('walking') || route.tags?.includes('hiking'));
  return route.difficulty === filter;
}

function labelDifficulty(value: RouteDifficulty): string {
  if (value === 'easy') return 'Easy';
  if (value === 'hard') return 'Hard';
  return 'Moderate';
}
