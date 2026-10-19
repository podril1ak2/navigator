import { distance, type LatLng } from '../lib/geo';

/**
 * Position engine that survives GPS jamming and spoofing.
 *
 * - Plausibility gate: fixes implying impossible speed, landing in known spoofing
 *   hotspots (airports the spoofers "teleport" phones to) or carrying a clock far
 *   off from the phone's are rejected.
 * - Smoothing: a simple Kalman filter weighted by reported accuracy.
 * - Signal state: good / weak / lost / spoofed, used by the UI and by dead reckoning.
 *
 * Pure TypeScript with no native imports, so it can be unit-tested on a computer.
 */

export type RawFix = {
  coordinate: LatLng;
  /** Horizontal accuracy in meters. */
  accuracy: number;
  /** m/s, null when unknown. */
  speed: number | null;
  /** Degrees, null when unknown. */
  course: number | null;
  /** Timestamp the OS attached to the fix (ms). */
  timestamp: number;
  /** Phone clock when we received it (ms). */
  receivedAt: number;
};

export type SignalState = 'good' | 'weak' | 'lost' | 'spoofed';

export type FilteredPosition = {
  coordinate: LatLng;
  accuracy: number;
  speed: number | null;
  course: number | null;
  /** Phone time of the last accepted fix. */
  time: number;
};

export type RejectReason = 'speed' | 'hotspot' | 'clock';

export type EngineSnapshot = {
  position: FilteredPosition | null;
  state: SignalState;
  /** Why the latest fix was rejected, if it was. */
  lastReject: RejectReason | null;
  /** Consecutive rejected fixes. */
  rejectStreak: number;
};

/** Places GNSS spoofers are known to send phones to (mostly airports). */
export const SPOOF_HOTSPOTS: { name: string; center: LatLng; radius: number }[] = [
  { name: 'Внуково', center: { latitude: 55.5915, longitude: 37.2615 }, radius: 3500 },
  { name: 'Шереметьево', center: { latitude: 55.9726, longitude: 37.4146 }, radius: 3500 },
  { name: 'Домодедово', center: { latitude: 55.4088, longitude: 37.9063 }, radius: 3500 },
  { name: 'Пулково', center: { latitude: 59.8003, longitude: 30.2625 }, radius: 3500 },
];

export type EngineOptions = {
  /** Highest believable speed, m/s. */
  maxSpeed: number;
  /** After this many ms without an accepted fix the signal is "lost". */
  lostAfterMs: number;
  /** Accuracy worse than this (m) is "weak". */
  weakAccuracy: number;
  /** Clock difference (ms) treated as a spoofing sign. */
  maxClockSkewMs: number;
  /**
   * If rejected fixes keep agreeing with each other for this long, accept them:
   * the user really moved (e.g. flew) and we must not get stuck.
   */
  rebaselineAfterMs: number;
};

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  maxSpeed: 70,
  lostAfterMs: 6000,
  weakAccuracy: 60,
  maxClockSkewMs: 120000,
  rebaselineAfterMs: 120000,
};

const KALMAN_Q = 3; // process noise, m/s

export class PositionEngine {
  private opts: EngineOptions;
  private pos: FilteredPosition | null = null;
  private variance = -1;
  private lastReject: RejectReason | null = null;
  private rejectStreak = 0;
  private spoofedUntil = 0;
  /** First of a run of rejected fixes that agree with each other. */
  private rejectedRun: { start: number; anchor: LatLng; time: number } | null = null;

  constructor(opts: Partial<EngineOptions> = {}) {
    this.opts = { ...DEFAULT_ENGINE_OPTIONS, ...opts };
  }

  setOptions(opts: Partial<EngineOptions>) {
    this.opts = { ...this.opts, ...opts };
  }

  /** Checks a fix against the last trusted position. Returns a reason to reject or null. */
  private check(fix: RawFix): RejectReason | null {
    if (Math.abs(fix.timestamp - fix.receivedAt) > this.opts.maxClockSkewMs) return 'clock';
    if (!this.pos) {
      // No history: only refuse to start inside a hotspot.
      return inHotspot(fix.coordinate) ? 'hotspot' : null;
    }
    const d = distance(this.pos.coordinate, fix.coordinate);
    const dt = Math.max(1, (fix.receivedAt - this.pos.time) / 1000);
    // Allow for both fixes' uncertainty before calling it a jump.
    const slack = fix.accuracy + this.pos.accuracy;
    if (d > slack && (d - slack) / dt > this.opts.maxSpeed) {
      return inHotspot(fix.coordinate) ? 'hotspot' : 'speed';
    }
    if (d > 2000 && inHotspot(fix.coordinate)) return 'hotspot';
    return null;
  }

  /** Feeds a raw fix. Returns the new snapshot. */
  ingest(fix: RawFix): EngineSnapshot {
    const reason = this.check(fix);
    if (reason) {
      this.lastReject = reason;
      this.rejectStreak++;
      this.spoofedUntil = fix.receivedAt + 15000;
      if (this.trackRejectedRun(fix)) return this.accept(fix, true);
      return this.snapshot(fix.receivedAt);
    }
    this.rejectedRun = null;
    return this.accept(fix, false);
  }

  /** True when rejected fixes have been consistent long enough to trust them. */
  private trackRejectedRun(fix: RawFix): boolean {
    if (this.lastReject === 'clock') return false;
    const run = this.rejectedRun;
    if (!run || distance(run.anchor, fix.coordinate) > Math.max(300, this.opts.maxSpeed * ((fix.receivedAt - run.time) / 1000))) {
      this.rejectedRun = { start: fix.receivedAt, anchor: fix.coordinate, time: fix.receivedAt };
      return false;
    }
    run.anchor = fix.coordinate;
    run.time = fix.receivedAt;
    return fix.receivedAt - run.start >= this.opts.rebaselineAfterMs;
  }

  private accept(fix: RawFix, reset: boolean): EngineSnapshot {
    if (reset || !this.pos || this.variance < 0) {
      this.pos = {
        coordinate: fix.coordinate,
        accuracy: fix.accuracy,
        speed: fix.speed,
        course: fix.course,
        time: fix.receivedAt,
      };
      this.variance = fix.accuracy * fix.accuracy;
      this.rejectedRun = null;
      this.rejectStreak = 0;
      this.spoofedUntil = 0;
      return this.snapshot(fix.receivedAt);
    }
    // Kalman update in degrees with variance in m².
    const dt = Math.max(0, (fix.receivedAt - this.pos.time) / 1000);
    const q = Math.max(KALMAN_Q, fix.speed ?? 0);
    this.variance += dt * q * q;
    const r = fix.accuracy * fix.accuracy;
    const k = this.variance / (this.variance + r);
    const c = this.pos.coordinate;
    this.pos = {
      coordinate: {
        latitude: c.latitude + k * (fix.coordinate.latitude - c.latitude),
        longitude: c.longitude + k * (fix.coordinate.longitude - c.longitude),
      },
      accuracy: Math.sqrt((1 - k) * this.variance),
      speed: fix.speed,
      course: fix.course,
      time: fix.receivedAt,
    };
    this.variance = (1 - k) * this.variance;
    this.rejectStreak = 0;
    this.lastReject = null;
    return this.snapshot(fix.receivedAt);
  }

  snapshot(now: number): EngineSnapshot {
    return {
      position: this.pos,
      state: this.stateAt(now),
      lastReject: this.lastReject,
      rejectStreak: this.rejectStreak,
    };
  }

  private stateAt(now: number): SignalState {
    if (now < this.spoofedUntil && this.rejectStreak > 0) return 'spoofed';
    if (!this.pos || now - this.pos.time > this.opts.lostAfterMs) return 'lost';
    if (this.pos.accuracy > this.opts.weakAccuracy) return 'weak';
    return 'good';
  }

  reset() {
    this.pos = null;
    this.variance = -1;
    this.rejectStreak = 0;
    this.lastReject = null;
    this.spoofedUntil = 0;
    this.rejectedRun = null;
  }
}

export function inHotspot(c: LatLng): boolean {
  return SPOOF_HOTSPOTS.some((h) => distance(h.center, c) < h.radius);
}

export type DeadReckoningInput = {
  /** Meters along the route at the last trusted fix. */
  along: number;
  /** Seconds since the last trusted fix. */
  elapsed: number;
  /** Last trusted speed, m/s. */
  speed: number;
  /** Meters walked since the last trusted fix according to the pedometer, if known. */
  pedometerMeters: number | null;
  mode: 'car' | 'bike' | 'foot';
};

/** Max time we keep extrapolating before admitting we don't know where the user is. */
export const DEAD_RECKONING_LIMIT_S = 600;

/**
 * Estimates how far along the route the user is when GPS is unavailable.
 * Walking uses the pedometer; vehicles keep the last speed and slowly decay it
 * (traffic lights and turns make long extrapolation optimistic).
 */
export function deadReckonAlong(i: DeadReckoningInput): { along: number; uncertainty: number } {
  const t = Math.min(i.elapsed, DEAD_RECKONING_LIMIT_S);
  if (i.mode === 'foot' && i.pedometerMeters != null) {
    return { along: i.along + i.pedometerMeters, uncertainty: 10 + i.pedometerMeters * 0.1 };
  }
  // Integral of v * exp(-t / tau): average speed falls off over a few minutes.
  const tau = i.mode === 'car' ? 240 : 400;
  const travelled = i.speed * tau * (1 - Math.exp(-t / tau));
  return { along: i.along + travelled, uncertainty: 15 + travelled * 0.15 };
}
