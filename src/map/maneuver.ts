import type { Route, RouteStep } from '../lib/api';
import { pointAtAlong, type LatLng } from '../lib/geo';

const R = 6371000;

/** Point `meters` away from `p` in direction `bearingDeg`. */
export function offset(p: LatLng, bearingDeg: number, meters: number): LatLng {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(b)) / R;
  const dLon = (meters * Math.sin(b)) / (R * Math.cos((p.latitude * Math.PI) / 180));
  return { latitude: p.latitude + (dLat * 180) / Math.PI, longitude: p.longitude + (dLon * 180) / Math.PI };
}

const ll = (c: LatLng): [number, number] => [c.longitude, c.latitude];

/**
 * On-map maneuver arrow, like big navigator apps draw at the next turn:
 * the route piece through the intersection (shaft) plus a triangular head.
 * Sizes are in meters so the arrow scales with the map.
 */
export function maneuverArrow(route: Route, step: RouteStep, opts: { before?: number; after?: number; head?: number } = {}): GeoJSON.FeatureCollection | null {
  if (step.maneuver.type === 'arrive' || step.maneuver.type === 'depart' || step.maneuver.type === 'waypoint') return null;
  const total = route.cumulative[route.cumulative.length - 1];
  const before = opts.before ?? 30;
  const after = Math.min(opts.after ?? 26, total - step.along);
  const head = opts.head ?? 12;
  if (after < 6) return null;

  const from = Math.max(0, step.along - before);
  const to = step.along + after - head * 0.55;
  const shaft: LatLng[] = [];
  const startIdx = route.cumulative.findIndex((d) => d > from);
  shaft.push(pointAtAlong(route.coordinates, route.cumulative, from).point);
  for (let i = Math.max(0, startIdx); i < route.coordinates.length && route.cumulative[i] < to; i++) shaft.push(route.coordinates[i]);
  const end = pointAtAlong(route.coordinates, route.cumulative, to);
  shaft.push(end.point);

  // Head direction: average over the last few meters for a stable angle.
  const tip = pointAtAlong(route.coordinates, route.cumulative, step.along + after);
  const base = end.point;
  const dir = bearingBetween(base, tip.point);
  const left = offset(base, dir - 90, head * 0.62);
  const right = offset(base, dir + 90, head * 0.62);
  const point = offset(base, dir, head);

  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { part: 'shaft' }, geometry: { type: 'LineString', coordinates: shaft.map(ll) } },
      { type: 'Feature', properties: { part: 'head' }, geometry: { type: 'Polygon', coordinates: [[ll(left), ll(point), ll(right), ll(left)]] } },
    ],
  };
}

function bearingBetween(a: LatLng, b: LatLng): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Layer specs for the arrow (shared by the app and design renders). */
export function maneuverArrowLayers(source: string, colors: { fill: string; outline: string }) {
  const shaftW = ['interpolate', ['exponential', 2], ['zoom'], 14, 3, 16, 9, 17, 16, 18, 30];
  const outlineW = ['interpolate', ['exponential', 2], ['zoom'], 14, 5, 16, 13, 17, 22, 18, 40];
  return [
    { id: `${source}-shaft-outline`, type: 'line', source, filter: ['==', ['get', 'part'], 'shaft'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': colors.outline, 'line-width': outlineW } },
    { id: `${source}-head-outline`, type: 'line', source, filter: ['==', ['get', 'part'], 'head'], layout: { 'line-join': 'round' }, paint: { 'line-color': colors.outline, 'line-width': 4 } },
    { id: `${source}-shaft`, type: 'line', source, filter: ['==', ['get', 'part'], 'shaft'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': colors.fill, 'line-width': shaftW } },
    { id: `${source}-head`, type: 'fill', source, filter: ['==', ['get', 'part'], 'head'], paint: { 'fill-color': colors.fill } },
  ] as const;
}
