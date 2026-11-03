import type { RoutePoint } from '../routes/routeTypes';
import { formatKmh } from '../utils/format';

type Props = {
  profile: RoutePoint[];
  progressMeters: number;
  inclinePercent: number;
};

export function ElevationProfile({ profile, progressMeters, inclinePercent }: Props) {
  if (profile.length < 2) return null;
  const width = 360;
  const height = 78;
  const padX = 6;
  const padY = 10;
  const elevations = profile.map((point) => point.elevationMeters ?? 0);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const span = Math.max(1, max - min);
  const total = profile[profile.length - 1]?.distanceMeters || 1;
  const points = profile.map((point) => {
    const x = padX + (point.distanceMeters / total) * (width - padX * 2);
    const y = height - padY - ((point.elevationMeters ?? 0) - min) / span * (height - padY * 2);
    return { x, y };
  });
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const area =
    first && last ? `${line} L${last.x.toFixed(1)} ${height - 4} L${first.x.toFixed(1)} ${height - 4} Z` : '';
  const progress = Math.min(1, Math.max(0, progressMeters / total));
  const markerX = padX + progress * (width - padX * 2);

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" role="img" aria-label="Elevation profile">
        <path d={area} fill="rgba(240,162,2,0.16)" />
        <path d={line} fill="none" stroke="#8fd0bf" strokeWidth="2" />
        <line x1={markerX} x2={markerX} y1={6} y2={height - 4} stroke="#f0a202" strokeWidth="1.5" />
        <circle cx={markerX} cy={14} r="3.5" fill="#f3efe4" />
      </svg>
      <figcaption className="flex justify-between text-sm text-mist">
        <span>Elevation</span>
        <span className="text-paper">{formatKmh(inclinePercent, 1)}%</span>
      </figcaption>
    </figure>
  );
}
