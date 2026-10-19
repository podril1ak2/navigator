import type { Route } from '../lib/api';
import { pointAtAlong } from '../lib/geo';
import type { RawFix } from './engine';
import { SPOOF_HOTSPOTS } from './engine';

export type SimInterference = 'none' | 'jam' | 'spoof';

/**
 * Drives along a route and produces fixes as the GPS would. Can simulate jamming
 * (no fixes) and spoofing (fixes teleported to an airport) to demo how the
 * navigator copes. Used by the "Симуляция" mode.
 */
export class RouteSimulator {
  private along = 0;
  private lastTime: number | null = null;
  interference: SimInterference = 'none';

  constructor(
    private route: Route,
    /** m/s */
    public speed: number,
  ) {}

  get finished() {
    return this.along >= this.route.cumulative[this.route.cumulative.length - 1];
  }

  /** Advances the simulation to `now` and returns the fix the phone would get, or null. */
  step(now: number): RawFix | null {
    const dt = this.lastTime == null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.along += this.speed * dt;
    if (this.interference === 'jam') return null;
    const at = pointAtAlong(this.route.coordinates, this.route.cumulative, this.along);
    const coordinate = this.interference === 'spoof' ? SPOOF_HOTSPOTS[0].center : at.point;
    return { coordinate, accuracy: 6, speed: this.speed, course: at.bearing, timestamp: now, receivedAt: now };
  }
}
