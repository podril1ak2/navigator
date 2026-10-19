import type { LatLng } from './geo';

const rad = Math.PI / 180;

/** Solar elevation in degrees (NOAA approximation, good to ~1°). */
export function solarElevation(c: LatLng, date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + c.longitude) * rad;
  const ha = lst - ra;
  const lat = c.latitude * rad;
  return Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)) / rad;
}

/** Day while the sun is above civil-twilight-ish elevation. */
export function isDaytime(c: LatLng, date: Date): boolean {
  return solarElevation(c, date) > -3;
}
