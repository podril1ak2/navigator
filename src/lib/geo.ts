export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Distance between two points in meters (haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b in degrees, 0..360. */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Cumulative distance along a polyline; result[i] = meters from start to point i. */
export function cumulativeDistances(line: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distance(line[i - 1], line[i]));
  return out;
}

export type Snap = {
  /** Meters from the point to the polyline. */
  offset: number;
  /** Meters along the polyline to the projected point. */
  along: number;
  /** Index of the segment start. */
  segment: number;
  point: LatLng;
};

/**
 * Projects a point onto the polyline. Uses a local flat approximation per segment,
 * which is accurate enough for the short segments of a route.
 */
export function snapToPolyline(p: LatLng, line: LatLng[], cumulative: number[]): Snap {
  let best: Snap = { offset: Infinity, along: 0, segment: 0, point: line[0] };
  const kx = Math.cos(toRad(p.latitude)) * 111320;
  const ky = 110540;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ax = (a.longitude - p.longitude) * kx;
    const ay = (a.latitude - p.latitude) * ky;
    const bx = (b.longitude - p.longitude) * kx;
    const by = (b.latitude - p.latitude) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < best.offset) {
      best = {
        offset: d,
        along: cumulative[i] + t * (cumulative[i + 1] - cumulative[i]),
        segment: i,
        point: {
          latitude: a.latitude + t * (b.latitude - a.latitude),
          longitude: a.longitude + t * (b.longitude - a.longitude),
        },
      };
    }
  }
  return best;
}

/** Point and direction at `along` meters from the start of the polyline. */
export function pointAtAlong(line: LatLng[], cumulative: number[], along: number): { point: LatLng; segment: number; bearing: number } {
  const total = cumulative[cumulative.length - 1];
  const a = Math.max(0, Math.min(total, along));
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= a) lo = mid;
    else hi = mid;
  }
  const segLen = cumulative[hi] - cumulative[lo] || 1;
  const t = (a - cumulative[lo]) / segLen;
  const p = line[lo];
  const q = line[hi] ?? p;
  return {
    point: { latitude: p.latitude + t * (q.latitude - p.latitude), longitude: p.longitude + t * (q.longitude - p.longitude) },
    segment: lo,
    bearing: bearing(p, q),
  };
}

/** Splits a polyline at `along` meters, returning the part still ahead. */
export function remainingPolyline(line: LatLng[], snap: Snap): LatLng[] {
  return [snap.point, ...line.slice(snap.segment + 1)];
}

export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

export function formatDistance(meters: number): string {
  const rounded = meters < 100 ? Math.round(meters / 5) * 5 : Math.round(meters / 10) * 10;
  if (rounded < 1000) return `${rounded} м`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} км` : `${Math.round(km)} км`;
}

/** Distance phrase for speech, e.g. "300 метров", "1,5 километра". */
export function spokenDistance(meters: number): string {
  const r = meters < 200 ? Math.round(meters / 10) * 10 : Math.round(meters / 50) * 50;
  if (r < 1000) return `${r} ${plural(r, ['метр', 'метра', 'метров'])}`;
  const km = Math.round(meters / 500) / 2;
  if (Number.isInteger(km)) return `${km} ${plural(km, ['километр', 'километра', 'километров'])}`;
  return `${String(km).replace('.', ',')} километра`;
}

export function formatDuration(seconds: number): string {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin} мин`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

export function formatClock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatCoords(c: LatLng): string {
  return `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
}
