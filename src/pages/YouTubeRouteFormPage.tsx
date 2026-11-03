import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, PageTitle, Screen } from '../components/ui';
import { getRouteById } from '../routes/routeCatalog';
import type { RouteDifficulty } from '../routes/routeTypes';
import { useSession } from '../state/sessionStore';
import { createId } from '../utils/format';
import { isYouTubeVideoId, parseYouTubeUrl, youTubeThumbnailUrl, youTubeWatchUrl } from '../youtube/parseYouTubeUrl';

const TAGS = ['mountain', 'alps', 'dolomites', 'forest', 'lake', 'hiking', 'walking'] as const;

export function YouTubeRouteFormPage() {
  const { routeId = '' } = useParams();
  const editing = Boolean(routeId);
  const existing = editing ? getRouteById(routeId) : undefined;
  const navigate = useNavigate();
  const saveYouTubeRoute = useSession((state) => state.saveYouTubeRoute);
  const deleteYouTubeRoute = useSession((state) => state.deleteYouTubeRoute);
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.videoUrl ?? '');
  const [mode, setMode] = useState<'scenic' | 'synced'>(existing?.playbackMode === 'synced' ? 'synced' : 'scenic');
  const [distanceKm, setDistanceKm] = useState(existing?.totalDistanceMeters ? String(existing.totalDistanceMeters / 1000) : '');
  const [start, setStart] = useState(existing?.videoStartSeconds != null ? String(existing.videoStartSeconds) : '');
  const [end, setEnd] = useState(existing?.videoEndSeconds != null ? String(existing.videoEndSeconds) : '');
  const [difficulty, setDifficulty] = useState<RouteDifficulty>(existing?.difficulty ?? 'moderate');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? ['walking']);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseYouTubeUrl(url);
  const thumb = parsed ? youTubeThumbnailUrl(parsed.videoId) : null;

  if (editing && existing && !existing.userCreated) {
    return (
      <Screen>
        <PageTitle title="Built-in route" detail="Demo routes stay in the app. Add your own YouTube URL instead." />
        <Link to="/routes" className="text-amber">
          Back to routes
        </Link>
      </Screen>
    );
  }

  async function save() {
    const found = parseYouTubeUrl(url);
    if (!name.trim()) {
      setError('Give the route a name.');
      return;
    }
    if (!found || !isYouTubeVideoId(found.videoId)) {
      setError('That is not a YouTube URL this app can use.');
      return;
    }
    const distance = Number(distanceKm);
    const startSeconds = parseClock(start);
    const endSeconds = parseClock(end);
    if (mode === 'synced') {
      if (!Number.isFinite(distance) || distance <= 0) {
        setError('Distance sync needs a distance in kilometres.');
        return;
      }
      if (startSeconds == null || endSeconds == null || endSeconds <= startSeconds) {
        setError('Video end time has to be after the start time.');
        return;
      }
    }
    await saveYouTubeRoute({
      id: existing?.userCreated ? existing.id : createId(),
      name: name.trim(),
      videoId: found.videoId,
      originalUrl: youTubeWatchUrl(found.videoId),
      mode,
      distanceMeters: mode === 'synced' && Number.isFinite(distance) ? Math.round(distance * 1000) : 0,
      videoStartSeconds: mode === 'synced' ? (startSeconds ?? undefined) : undefined,
      videoEndSeconds: mode === 'synced' ? (endSeconds ?? undefined) : undefined,
      difficulty,
      tags,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    navigate('/routes');
  }

  return (
    <Screen>
      <PageTitle
        title={editing ? 'Edit YouTube route' : 'Add YouTube route'}
        detail="Paste a link. The player receives only the video id, not the raw address as HTML."
      />
      <label className="flex flex-col gap-2">
        <span>Route name</span>
        <input className="min-h-12 rounded-md border border-line bg-ink px-3" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span>YouTube URL</span>
        <input
          className="min-h-12 rounded-md border border-line bg-ink px-3"
          value={url}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      {parsed ? <p className="text-sm text-mist">Video id {parsed.videoId}</p> : url.trim() ? <p className="text-sm text-ember">Invalid video</p> : null}
      {thumb ? <img src={thumb} alt="" className="aspect-video w-full max-w-md rounded-md object-cover" /> : null}
      <label className="flex flex-col gap-2">
        <span>Mode</span>
        <select
          className="min-h-12 rounded-md border border-line bg-ink px-3"
          value={mode}
          onChange={(event) => setMode(event.target.value === 'synced' ? 'synced' : 'scenic')}
        >
          <option value="scenic">Scenic</option>
          <option value="synced">Distance synced</option>
        </select>
      </label>
      {mode === 'synced' ? (
        <>
          <label className="flex flex-col gap-2">
            <span>Distance km</span>
            <input className="min-h-12 rounded-md border border-line bg-ink px-3" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2">
            <span>Video start time (seconds or m:ss)</span>
            <input className="min-h-12 rounded-md border border-line bg-ink px-3" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2">
            <span>Video end time (seconds or m:ss)</span>
            <input className="min-h-12 rounded-md border border-line bg-ink px-3" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </>
      ) : null}
      <label className="flex flex-col gap-2">
        <span>Difficulty</span>
        <select
          className="min-h-12 rounded-md border border-line bg-ink px-3"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as RouteDifficulty)}
        >
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm text-mist">Tags</legend>
        {TAGS.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`min-h-10 rounded-md border px-3 text-sm capitalize ${on ? 'border-amber text-amber' : 'border-line text-mist'}`}
              onClick={() => setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]))}
            >
              {tag}
            </button>
          );
        })}
      </fieldset>
      {error ? <p className="text-sm text-ember">{error}</p> : null}
      <Button variant="primary" onClick={() => void save()}>
        Save
      </Button>
      {existing?.userCreated ? (
        <Button
          variant="danger"
          onClick={() => {
            void deleteYouTubeRoute(existing.id).then(() => navigate('/routes'));
          }}
        >
          Delete route
        </Button>
      ) : null}
      <Link to="/routes" className="text-sm text-mist">
        Cancel
      </Link>
    </Screen>
  );
}

function parseClock(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
