import { limitAt, type RoadInfo, type Route, type SpeedCamera, type TravelMode } from '../lib/api';
import { bearing, pointAtAlong, spokenDistance, type LatLng } from '../lib/geo';
import { lowerFirst } from '../lib/instructions';
import { computeProgress, progressAtAlong, type NavProgress } from '../lib/progress';
import { DEAD_RECKONING_LIMIT_S, deadReckonAlong, PositionEngine, type RawFix, type SignalState } from './engine';

/**
 * Trip controller: the single source of truth for "where am I and what's next".
 * Feeds raw fixes through the PositionEngine, falls back to dead reckoning along the
 * route when GPS is lost or spoofed, and drives voice prompts, camera and speed
 * warnings, rerouting and arrival. Platform effects are injected, so this file has
 * no native imports and is unit-testable.
 */

export type DisplayPosition = {
  coordinate: LatLng;
  accuracy: number;
  course: number | null;
  /** m/s */
  speed: number | null;
  /** 'gps' — measured; 'dr' — estimated by dead reckoning; 'stale' — last known, not moving. */
  source: 'gps' | 'dr' | 'stale';
};

export type TripSnapshot = {
  signal: SignalState;
  position: DisplayPosition | null;
  progress: NavProgress | null;
  speedLimit: number | null;
  nextCamera: { camera: SpeedCamera; distance: number } | null;
  overSpeed: boolean;
  /** Seconds the user has been without trusted GPS during a trip. */
  drSeconds: number;
};

export type TripEffects = {
  speak: (text: string) => void;
  haptic: (kind: 'light' | 'medium' | 'success' | 'warning') => void;
  reroute: (from: LatLng) => void;
  arrived: () => void;
};

export type TripSettings = {
  voice: boolean;
  /** km/h over the limit before warning; null disables. */
  overSpeedTolerance: number | null;
  cameraAlerts: boolean;
};

// Announcement distances (meters) per mode: far, near, now.
const THRESHOLDS: Record<TravelMode, [number, number, number]> = {
  car: [1000, 300, 60],
  bike: [400, 120, 30],
  foot: [200, 60, 15],
};
const MAX_SPEED: Record<TravelMode, number> = { car: 70, bike: 20, foot: 10 };
const STRIDE_M = 0.72;
const OFF_ROUTE_FIXES = 3;
const REROUTE_COOLDOWN_MS = 12000;
const CAMERA_ALERT_M = 500;
const OVERSPEED_REPEAT_MS = 45000;

type Trusted = { along: number; time: number; speed: number; steps: number };

const EMPTY: TripSnapshot = {
  signal: 'lost',
  position: null,
  progress: null,
  speedLimit: null,
  nextCamera: null,
  overSpeed: false,
  drSeconds: 0,
};

export class TripController {
  readonly engine = new PositionEngine();
  private route: Route | null = null;
  private roadInfo: RoadInfo | null = null;
  private settings: TripSettings = { voice: true, overSpeedTolerance: 10, cameraAlerts: true };
  private trusted: Trusted | null = null;
  private steps = 0;
  private pedometer = false;
  private announced = new Map<number, number>();
  private camerasAnnounced = new Set<number>();
  private offCount = 0;
  private lastReroute = 0;
  private lastOverSpeedAlert = 0;
  private arrivedFlag = false;
  private snapshot: TripSnapshot = EMPTY;
  private listeners = new Set<() => void>();

  constructor(private effects: TripEffects) {}

  // ---- external store API (useSyncExternalStore) ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  setEffects(effects: TripEffects) {
    this.effects = effects;
  }

  setSettings(s: Partial<TripSettings>) {
    this.settings = { ...this.settings, ...s };
  }

  setPedometerAvailable(v: boolean) {
    this.pedometer = v;
  }

  /** Starts, replaces (reroute) or ends (null) the active route. */
  setRoute(route: Route | null, opts: { announce: boolean; now: number }) {
    const continuing = !!route && !!this.route;
    this.route = route;
    this.announced = new Map();
    this.offCount = 0;
    if (!continuing) {
      this.camerasAnnounced = new Set();
      this.arrivedFlag = false;
      this.roadInfo = null;
    }
    this.trusted = null;
    this.engine.setOptions({ maxSpeed: route ? MAX_SPEED[route.mode] : MAX_SPEED.car });
    if (route && opts.announce && this.settings.voice) {
      const first = route.steps[0];
      const turnIndex = route.steps.findIndex((s, i) => i > 0 && !s.silent);
      const turn = route.steps[turnIndex];
      // The opening phrase already covers the first turn's distance prompt.
      if (turn) this.announced.set(turnIndex, turn.along <= THRESHOLDS[route.mode][1] ? 2 : 1);
      this.effects.speak(
        turn && turn.maneuver.type !== 'arrive'
          ? `${first.text}. Через ${spokenDistance(turn.along)} ${lowerFirst(turn.text)}`
          : first.text,
      );
    }
    this.recompute(opts.now);
  }

  setRoadInfo(info: RoadInfo | null, now: number) {
    this.roadInfo = info;
    this.recompute(now);
  }

  ingest(fix: RawFix) {
    this.engine.ingest(fix);
    this.recompute(fix.receivedAt, true);
  }

  setSteps(total: number) {
    this.steps = total;
  }

  /** Called about once a second so state changes and dead reckoning advance without fixes. */
  tick(now: number) {
    this.recompute(now);
  }

  private emit(next: TripSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private recompute(now: number, fromFix = false) {
    const e = this.engine.snapshot(now);
    const pos = e.position;
    const trustedNow = !!pos && (e.state === 'good' || e.state === 'weak');
    const route = this.route;

    if (!route) {
      const position: DisplayPosition | null = pos
        ? {
            coordinate: pos.coordinate,
            accuracy: trustedNow ? pos.accuracy : pos.accuracy + (now - pos.time) / 1000,
            course: pos.course,
            speed: trustedNow ? pos.speed : null,
            source: trustedNow ? 'gps' : 'stale',
          }
        : null;
      this.emit({ ...EMPTY, signal: e.state, position });
      return;
    }

    let progress: NavProgress | null = null;
    let position: DisplayPosition | null = null;
    let drSeconds = 0;

    if (trustedNow && pos) {
      progress = computeProgress(route, pos);
      const seg = route.coordinates;
      const roadBearing = seg[progress.segment + 1] ? bearing(seg[progress.segment], seg[progress.segment + 1]) : null;
      position = {
        coordinate: progress.offLine ? pos.coordinate : progress.point,
        accuracy: pos.accuracy,
        course: (pos.speed ?? 0) > 1.5 && pos.course != null ? pos.course : roadBearing,
        speed: pos.speed,
        source: 'gps',
      };
      if (!progress.offLine) {
        this.trusted = { along: progress.along, time: pos.time, speed: pos.speed ?? this.trusted?.speed ?? 0, steps: this.steps };
      }
      if (fromFix) this.checkOffRoute(progress, pos.coordinate, now);
    } else if (this.trusted && (now - this.trusted.time) / 1000 < DEAD_RECKONING_LIMIT_S) {
      const t = this.trusted;
      drSeconds = (now - t.time) / 1000;
      const dr = deadReckonAlong({
        along: t.along,
        elapsed: drSeconds,
        speed: t.speed,
        pedometerMeters: route.mode === 'foot' && this.pedometer ? Math.max(0, this.steps - t.steps) * STRIDE_M : null,
        mode: route.mode,
      });
      const at = pointAtAlong(route.coordinates, route.cumulative, dr.along);
      progress = progressAtAlong(route, dr.along, at.segment, at.point);
      position = { coordinate: at.point, accuracy: dr.uncertainty, course: at.bearing, speed: t.speed, source: 'dr' };
    } else if (pos) {
      position = { coordinate: pos.coordinate, accuracy: pos.accuracy + (now - pos.time) / 1000, course: pos.course, speed: null, source: 'stale' };
    }

    const speedLimit = progress ? limitAt(this.roadInfo, progress.along) : null;
    const nextCamera = progress ? this.findCamera(progress.along) : null;
    const kmh = position?.source === 'gps' && position.speed != null ? position.speed * 3.6 : null;
    const tol = this.settings.overSpeedTolerance;
    const overSpeed = kmh != null && speedLimit != null && tol != null && kmh > speedLimit + tol;

    if (progress) this.runPrompts(progress, trustedNow, nextCamera, overSpeed, now);

    this.emit({ signal: e.state, position, progress, speedLimit, nextCamera, overSpeed, drSeconds });
  }

  private checkOffRoute(p: NavProgress, at: LatLng, now: number) {
    this.offCount = p.offLine ? this.offCount + 1 : 0;
    if (this.offCount < OFF_ROUTE_FIXES || now - this.lastReroute < REROUTE_COOLDOWN_MS) return;
    this.lastReroute = now;
    this.offCount = 0;
    if (this.settings.voice) this.effects.speak('Маршрут перестраивается');
    this.effects.reroute(at);
  }

  private findCamera(along: number): TripSnapshot['nextCamera'] {
    const cam = this.roadInfo?.cameras.find((c) => c.along > along - 5);
    if (!cam) return null;
    const d = cam.along - along;
    return d <= 2000 ? { camera: cam, distance: Math.max(0, d) } : null;
  }

  private runPrompts(p: NavProgress, trusted: boolean, cam: TripSnapshot['nextCamera'], overSpeed: boolean, now: number) {
    const route = this.route!;
    const voice = this.settings.voice;

    if (p.arrived && trusted) {
      if (!this.arrivedFlag) {
        this.arrivedFlag = true;
        if (voice) this.effects.speak('Вы прибыли. Маршрут завершён');
        this.effects.haptic('success');
        this.effects.arrived();
      }
      return;
    }

    if (cam && this.settings.cameraAlerts && route.mode === 'car' && cam.distance <= CAMERA_ALERT_M && !this.camerasAnnounced.has(cam.camera.id)) {
      this.camerasAnnounced.add(cam.camera.id);
      this.effects.haptic('warning');
      if (voice) this.effects.speak(cam.camera.limit ? `Камера. Ограничение ${cam.camera.limit}` : 'Впереди камера');
    }

    if (overSpeed && now - this.lastOverSpeedAlert > OVERSPEED_REPEAT_MS) {
      this.lastOverSpeedAlert = now;
      this.effects.haptic('warning');
      if (voice) this.effects.speak('Превышение скорости');
    }

    const { next, then, nextIndex, distanceToNext } = p;
    if (!next || p.offLine) return;
    const [far, near, nowM] = THRESHOLDS[route.mode];
    const level = distanceToNext <= nowM ? 3 : distanceToNext <= near ? 2 : distanceToNext <= far ? 1 : 0;
    // Each threshold is spoken once per maneuver; if a step starts already close,
    // the nearer prompt is spoken directly.
    if (level <= (this.announced.get(nextIndex) ?? 0)) return;
    this.announced.set(nextIndex, level);
    if (voice) {
      const hint = level === 3 && then && then.along - next.along < 150 ? `, затем ${lowerFirst(then.text)}` : '';
      this.effects.speak(level === 3 ? `${next.text}${hint}` : `Через ${spokenDistance(distanceToNext)} ${lowerFirst(next.text)}`);
    }
    if (level === 3) this.effects.haptic('medium');
  }
}
