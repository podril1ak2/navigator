import type { Route, RouteStep } from './api';
import { snapToPolyline, type LatLng } from './geo';

export const ARRIVAL_RADIUS = 25;

export type NavProgress = {
  /** Upcoming maneuver (the one the banner shows). */
  next: RouteStep | null;
  /** The maneuver after `next`, for the "then" hint. */
  then: RouteStep | null;
  nextIndex: number;
  distanceToNext: number;
  /** Meters along the route geometry. */
  along: number;
  /** Segment index of the position on the route. */
  segment: number;
  /** Position on the route line. */
  point: LatLng;
  remainingDistance: number;
  remainingDuration: number;
  /** Distance from the measured position to the route, meters (0 for dead reckoning). */
  offset: number;
  /** The position is farther from the route than the tolerance. */
  offLine: boolean;
  arrived: boolean;
};

/** Progress for a known position along the route. */
export function progressAtAlong(route: Route, along: number, segment: number, point: LatLng, offset = 0, tolerance = Infinity): NavProgress {
  const total = route.cumulative[route.cumulative.length - 1];
  const remainingDistance = Math.max(0, total - along);
  let nextIndex = route.steps.findIndex((s, i) => i > 0 && !s.silent && s.along > along + 3);
  if (nextIndex === -1) nextIndex = route.steps.length - 1;
  const next = route.steps[nextIndex] ?? null;
  return {
    next,
    then: route.steps.slice(nextIndex + 1).find((s) => !s.silent) ?? null,
    nextIndex,
    distanceToNext: next ? Math.max(0, next.along - along) : 0,
    along,
    segment,
    point,
    remainingDistance,
    remainingDuration: route.duration * (remainingDistance / (total || 1)),
    offset,
    offLine: offset > tolerance,
    arrived: remainingDistance < ARRIVAL_RADIUS,
  };
}

/** Progress for a measured position: snaps it onto the route first. */
export function computeProgress(route: Route, fix: { coordinate: LatLng; accuracy: number }): NavProgress {
  const snap = snapToPolyline(fix.coordinate, route.coordinates, route.cumulative);
  const tolerance = Math.max(35, fix.accuracy * 1.5);
  return progressAtAlong(route, snap.along, snap.segment, snap.point, snap.offset, tolerance);
}
