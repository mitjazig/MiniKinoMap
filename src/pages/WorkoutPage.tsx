import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CastRouteSync } from '../components/CastRouteSync';
import { ElevationProfile } from '../components/ElevationProfile';
import { RouteVideoPlayer } from '../components/RouteVideoPlayer';
import { SimulatorPanel } from '../components/SimulatorPanel';
import { YouTubeRoutePlayer } from '../components/YouTubeRoutePlayer';
import { Button, SimulatorBadge } from '../components/ui';
import { heartRateZone } from '../heartRate/zones';
import { mediaOf } from '../routes/mediaOf';
import { getRouteById } from '../routes/routeCatalog';
import { useSession } from '../state/sessionStore';
import { formatDistanceKm, formatDuration, formatKmh } from '../utils/format';
import { formatPace } from '../utils/pace';
import { YOUTUBE_CAST_MESSAGE } from '../youtube/youtubeErrors';
import { getWalkingWorkout, walkingWorkouts } from '../workout/walkingWorkouts';

export function WorkoutPage() {
  const { routeId = '' } = useParams();
  const navigate = useNavigate();
  const workout = useSession((state) => state.workout);
  const source = useSession((state) => state.source);
  const connectionState = useSession((state) => state.connectionState);
  const actionError = useSession((state) => state.actionError);
  const selectRoute = useSession((state) => state.selectRoute);
  const startWorkout = useSession((state) => state.startWorkout);
  const pauseWorkout = useSession((state) => state.pauseWorkout);
  const resumeWorkout = useSession((state) => state.resumeWorkout);
  const stopWorkout = useSession((state) => state.stopWorkout);
  const resetWorkout = useSession((state) => state.resetWorkout);
  const reconnect = useSession((state) => state.reconnect);
  const reconnectHeartRate = useSession((state) => state.reconnectHeartRate);
  const castToTv = useSession((state) => state.castToTv);
  const stopCasting = useSession((state) => state.stopCasting);
  const loadCastForRoute = useSession((state) => state.loadCastForRoute);
  const dismissTvNotice = useSession((state) => state.dismissTvNotice);
  const reportVideoDebug = useSession((state) => state.reportVideoDebug);
  const videoOutput = useSession((state) => state.videoOutput);
  const castState = useSession((state) => state.castState);
  const castDeviceName = useSession((state) => state.castDeviceName);
  const castMessage = useSession((state) => state.castMessage);
  const castMediaLoaded = useSession((state) => state.castMediaLoaded);
  const tvNotice = useSession((state) => state.tvNotice);
  const castTestVideoUrl = useSession((state) => state.castTestVideoUrl);
  const resumeVideoTime = useSession((state) => state.resumeVideoTime);
  const pauseYouTubeWhenStopped = useSession((state) => state.pauseYouTubeWhenStopped);
  const maxHeartRate = useSession((state) => state.maxHeartRate);
  const programId = useSession((state) => state.programId);
  const selectProgram = useSession((state) => state.selectProgram);
  const reportYouTubeDebug = useSession((state) => state.reportYouTubeDebug);
  const youtubeDebug = useSession((state) => state.youtubeDebug);
  const routeRevision = useSession((state) => state.routeRevision);
  const [confirmStop, setConfirmStop] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [youtubeCastNote, setYoutubeCastNote] = useState<string | null>(null);

  useEffect(() => {
    if (routeId) selectRoute(routeId);
  }, [routeId, selectRoute]);

  useEffect(() => {
    if (castState !== 'connected' || !routeId) return;
    const routeForCast = getRouteById(routeId);
    if (!routeForCast || mediaOf(routeForCast).type === 'youtube') return;
    void loadCastForRoute(routeForCast);
  }, [castState, routeId, loadCastForRoute, castTestVideoUrl]);

  const route = routeRevision >= 0 ? getRouteById(workout.routeId ?? routeId) : undefined;
  if (!route) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
        <p>That route is not on this device.</p>
        <Link to="/routes" className="text-amber">
          Choose a route
        </Link>
      </div>
    );
  }

  const running = workout.phase === 'running';
  const lost = workout.phase === 'connectionLost';
  const media = mediaOf(route);
  const youtube = media.type === 'youtube';
  const casting = !youtube && videoOutput === 'cast' && castState === 'connected' && castMediaLoaded;
  const heartBpm = workout.liveHeartRateBpm && workout.liveHeartRateBpm > 0 ? Math.round(workout.liveHeartRateBpm) : null;
  const zone = heartRateZone(heartBpm ?? 0, maxHeartRate);
  const heartDetail = [heartBpm ? workout.liveHeartRateLabel : null, zone].filter(Boolean).join(' · ') || null;
  const synced = youtube && route.playbackMode === 'synced' && route.totalDistanceMeters > 0;
  const plan = getWalkingWorkout(programId);
  const canChoosePlan = workout.phase === 'idle' || workout.phase === 'ready' || workout.phase === 'finished';

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col md:flex-row">
      <div className={youtube ? 'w-full md:min-h-0 md:flex-1' : 'relative min-h-0 flex-1'}>
        {youtube ? (
          <YouTubeRoutePlayer
            route={route}
            traveledMeters={workout.distanceMeters}
            speedKmh={workout.liveSpeedKmh}
            running={running}
            pauseWhenStopped={pauseYouTubeWhenStopped}
            onDebug={reportYouTubeDebug}
          />
        ) : casting ? (
          <div className="flex h-full min-h-[42vh] flex-col items-center justify-center gap-3 bg-ink px-6 text-center">
            <p className="text-sm tracking-wide text-amber">CASTING TO TV</p>
            <p className="font-metric text-5xl leading-none">{route.name}</p>
            <p className="text-mist">
              Current progress: {formatDistanceKm(Math.min(workout.distanceMeters, route.totalDistanceMeters))} /{' '}
              {formatDistanceKm(route.totalDistanceMeters)} km
            </p>
            <p className="text-sm text-paper">TV: {castDeviceName || 'Chromecast'}</p>
          </div>
        ) : (
          <RouteVideoPlayer
            route={route}
            traveledMeters={workout.distanceMeters}
            speedKmh={workout.liveSpeedKmh}
            hold={!running}
            initialTime={resumeVideoTime}
            onSyncSample={reportVideoDebug}
          />
        )}
        {youtube ? null : (
          <CastRouteSync
            route={route}
            traveledMeters={workout.distanceMeters}
            speedKmh={workout.liveSpeedKmh}
            running={running}
          />
        )}
        {youtube ? null : (
          <div className="absolute left-3 top-3 z-10">
            {castState === 'connected' ? (
              <Button className="min-h-11 bg-ink/80 text-paper" onClick={() => void stopCasting()}>
                TV: {castDeviceName || 'Chromecast'}
              </Button>
            ) : (
              <Button className="min-h-11 bg-ink/80 text-paper" onClick={() => void castToTv()}>
                Cast
              </Button>
            )}
          </div>
        )}
        {lost ? (
          <div className={`${youtube ? 'mx-4 mt-3' : 'absolute inset-x-3 top-16 z-10'} flex items-center justify-between gap-3 rounded-md bg-ember px-3 py-3 text-ink`} role="status">
            <p className="text-sm font-medium">Treadmill connection lost</p>
            <button className="min-h-11 px-3 text-sm font-medium underline" onClick={() => void reconnect()}>
              Reconnect
            </button>
          </div>
        ) : null}
        {youtube ? null : workout.heartRateNotice ? (
          <div className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-3 rounded-md bg-ink/85 px-3 py-2 text-sm">
            <p>{workout.heartRateNotice}</p>
            <button className="min-h-11 px-3 font-medium underline" onClick={() => void reconnectHeartRate()}>
              Reconnect
            </button>
          </div>
        ) : null}
        {youtube ? null : castMessage && !casting ? (
          <p className="absolute inset-x-3 bottom-16 z-10 rounded-md bg-ink/85 px-3 py-2 text-sm leading-5 text-paper">
            {castMessage}
          </p>
        ) : null}
      </div>

      <section className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto bg-asphalt px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:w-[380px]">
        <div className="flex items-center justify-between">
          <p className="text-sm text-mist">{source === 'simulator' ? 'Simulator' : 'Bluetooth'}</p>
          {source === 'simulator' ? <SimulatorBadge /> : null}
        </div>

        <div>
          <p className="font-metric text-8xl leading-none text-amber">{formatKmh(workout.liveSpeedKmh, 1)}</p>
          <p className="text-mist">km/h</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Metric label="Pace" value={formatPace(workout.liveSpeedKmh)} unit="/km" />
          <Metric label="Distance" value={formatDistanceKm(workout.distanceMeters)} unit="km" />
          <Metric label="Time" value={formatDuration(workout.activeSeconds)} />
          <Metric label="Incline" value={formatKmh(workout.liveInclinePercent, 1)} unit="%" />
          <Metric
            label="Heart rate"
            value={heartBpm ? String(heartBpm) : '--'}
            unit="bpm"
            detail={heartDetail}
          />
        </dl>

        {youtube ? (
          <div className="text-sm leading-6 text-mist">
            {synced ? (
              <>
                <p>
                  Route {formatDistanceKm(workout.distanceMeters)} / {formatDistanceKm(route.totalDistanceMeters)} km
                </p>
                <p>Video {formatDuration(youtubeDebug.currentTime)}</p>
              </>
            ) : (
              <>
                <p>
                  Video {formatDuration(youtubeDebug.currentTime)}
                  {youtubeDebug.duration > 0 ? ` / ${formatDuration(youtubeDebug.duration)}` : ''}
                </p>
                <p>Workout {formatDuration(workout.activeSeconds)}</p>
                <p>Distance {formatDistanceKm(workout.distanceMeters)} km</p>
                <p>Scenic</p>
              </>
            )}
          </div>
        ) : null}

        {workout.programCue ? <p className="text-sm text-paper">{workout.programCue}</p> : null}
        {youtube && workout.heartRateNotice ? (
          <div className="flex items-center justify-between gap-3 text-sm text-ember">
            <p>{workout.heartRateNotice}</p>
            <button className="min-h-11 underline" onClick={() => void reconnectHeartRate()}>
              Reconnect
            </button>
          </div>
        ) : null}

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-mist">Workout</span>
          <select
            className="min-h-12 rounded-md border border-line bg-ink px-3"
            value={plan.id}
            disabled={!canChoosePlan}
            onChange={(event) => selectProgram(event.target.value)}
          >
            {walkingWorkouts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="text-mist">{plan.summary}</span>
        </label>

        {youtube ? (
          <Button
            onClick={() => {
              if (castState === 'connected') {
                void stopCasting();
                return;
              }
              setYoutubeCastNote(YOUTUBE_CAST_MESSAGE);
            }}
          >
            Cast
          </Button>
        ) : null}
        {youtubeCastNote ? <p className="text-sm leading-6 text-mist">{youtubeCastNote}</p> : null}

        <ElevationProfile
          profile={route.elevationProfile}
          progressMeters={workout.distanceMeters}
          inclinePercent={workout.liveInclinePercent}
        />

        {workout.autoInclineNote ? <p className="text-sm text-mist">{workout.autoInclineNote}</p> : null}
        {actionError ? <p className="text-sm text-ember">{actionError}</p> : null}
        {connectionState !== 'connected' && workout.phase === 'idle' ? (
          <p className="text-sm text-mist">Connect the simulator or a treadmill before starting.</p>
        ) : null}

        <div className="mt-auto grid grid-cols-2 gap-2">
          {workout.phase === 'running' ? (
            <Button variant="primary" onClick={() => void pauseWorkout()}>
              Pause
            </Button>
          ) : null}
          {workout.phase === 'paused' ? (
            <Button variant="primary" onClick={() => void resumeWorkout()}>
              Resume
            </Button>
          ) : null}
          {workout.phase === 'ready' || workout.phase === 'idle' || workout.phase === 'finished' ? (
            <Button
              variant="primary"
              className="col-span-2"
              disabled={workout.phase !== 'ready'}
              onClick={() => void startWorkout()}
            >
              Start
            </Button>
          ) : null}
          {workout.phase === 'running' || workout.phase === 'paused' || lost ? (
            <Button variant="danger" onClick={() => setConfirmStop(true)}>
              Stop
            </Button>
          ) : null}
        </div>

        {workout.phase === 'finished' ? (
          <div className="rounded-md border border-line p-3">
            <p className="font-metric text-3xl leading-none">Run saved</p>
            <p className="mt-2 text-sm text-mist">
              {formatDistanceKm(workout.distanceMeters)} km in {formatDuration(workout.activeSeconds)} · avg{' '}
              {formatKmh(workout.averageSpeedKmh, 1)} km/h
              {workout.averageHeartRateBpm
                ? ` · avg HR ${Math.round(workout.averageHeartRateBpm)}`
                : ''}
              {workout.maxHeartRateBpm ? ` · max HR ${Math.round(workout.maxHeartRateBpm)}` : ''}
            </p>
            <Button
              className="mt-3 w-full"
              onClick={() => {
                resetWorkout();
                navigate('/');
              }}
            >
              Done
            </Button>
          </div>
        ) : null}

        {source === 'simulator' ? (
          <Button variant="ghost" onClick={() => setPanelOpen(true)}>
            Simulator controls
          </Button>
        ) : null}
      </section>

      {tvNotice ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-md bg-deck p-4" role="dialog" aria-modal="true" aria-labelledby="tv-title">
            <h2 id="tv-title" className="font-metric text-4xl leading-none">
              TV disconnected
            </h2>
            <p className="mt-2 text-sm text-mist">The workout keeps going. The video continues on this phone.</p>
            <Button className="mt-4 w-full" variant="primary" onClick={dismissTvNotice}>
              Continue on phone
            </Button>
          </div>
        </div>
      ) : null}

      {confirmStop ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-md bg-deck p-4" role="dialog" aria-modal="true" aria-labelledby="stop-title">
            <h2 id="stop-title" className="font-metric text-4xl leading-none">
              End this run?
            </h2>
            <p className="mt-2 text-sm text-mist">The distance so far is kept and saved on this device.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button onClick={() => setConfirmStop(false)}>Keep going</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmStop(false);
                  void stopWorkout();
                }}
              >
                End run
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {panelOpen ? (
        <div className="fixed inset-0 z-30 flex items-end bg-ink/70">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-md bg-deck px-4 pt-4 pb-[env(safe-area-inset-bottom)]">
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setPanelOpen(false)}>Close</Button>
            </div>
            <SimulatorPanel />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, unit, detail }: { label: string; value: string; unit?: string; detail?: string | null }) {
  return (
    <div>
      <dt className="text-sm text-mist">{label}</dt>
      <dd className="font-metric text-5xl leading-none">
        {value}
        {unit ? <span className="ml-1 text-2xl text-mist">{unit}</span> : null}
      </dd>
      {detail ? <p className="mt-1 text-sm text-mist">{detail}</p> : null}
    </div>
  );
}
