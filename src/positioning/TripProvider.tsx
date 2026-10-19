import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { Pedometer } from 'expo-sensors';
import * as Speech from 'expo-speech';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Route } from '../lib/api';
import type { LatLng } from '../lib/geo';
import { useAppState } from '../state/AppState';
import { TripController, type TripEffects, type TripSnapshot } from './controller';
import type { RawFix } from './engine';
import { RouteSimulator, type SimInterference } from './simulator';

export type PermissionState = 'unknown' | 'granted' | 'denied';

type SimControls = {
  active: boolean;
  interference: SimInterference;
  start: (route: Route, speedKmh: number) => void;
  setInterference: (i: SimInterference) => void;
  stop: () => void;
};

type TripContext = {
  controller: TripController;
  permission: PermissionState;
  /** Compass heading, degrees. */
  heading: number | null;
  online: boolean;
  /** Last known position from the OS cache, for the first camera position. */
  initialCenter: LatLng | null;
  sim: SimControls;
  /** Screen registers what to do on reroute / arrival. */
  setHandlers: (h: { reroute: (from: LatLng) => void; arrived: () => void }) => void;
};

const Ctx = createContext<TripContext | null>(null);

export function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'ru-RU', rate: 1.0 });
}

function haptic(kind: 'light' | 'medium' | 'success' | 'warning') {
  const p =
    kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : kind === 'warning'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}

/** Effects until the map screen registers its reroute/arrival handlers. */
const baseEffects: TripEffects = { speak, haptic, reroute: () => {}, arrived: () => {} };

function toRaw(loc: Location.LocationObject): RawFix {
  const { latitude, longitude, accuracy, speed, heading } = loc.coords;
  return {
    coordinate: { latitude, longitude },
    accuracy: accuracy ?? 50,
    speed: speed != null && speed >= 0 ? speed : null,
    course: heading != null && heading >= 0 ? heading : null,
    timestamp: loc.timestamp,
    receivedAt: Date.now(),
  };
}

export function TripProvider({ children }: { children: ReactNode }) {
  const { settings } = useAppState();
  const [controller] = useState(() => new TripController(baseEffects));
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [heading, setHeading] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [simActive, setSimActive] = useState(false);
  const [interference, setInterferenceState] = useState<SimInterference>('none');
  const sim = useRef<RouteSimulator | null>(null);

  useEffect(() => {
    controller.setSettings({
      voice: settings.voice,
      cameraAlerts: settings.cameraAlerts,
      overSpeedTolerance: settings.overSpeedTolerance,
    });
  }, [controller, settings.voice, settings.cameraAlerts, settings.overSpeedTolerance]);

  // GPS + compass.
  useEffect(() => {
    let cancelled = false;
    const subs: { remove: () => void }[] = [];
    const keep = (s: { remove: () => void }) => (cancelled ? s.remove() : subs.push(s));
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermission(status === 'granted' ? 'granted' : 'denied');
      if (status !== 'granted') return;
      // A cached fix may be hours old and far away: use it only to center the map,
      // never feed it to the engine (a fresh fix would then look like a jump).
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) setInitialCenter({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0, timeInterval: 1000 }, (loc) => {
        if (!sim.current) controller.ingest(toRaw(loc));
      })
        .then(keep)
        .catch(() => {});
      Location.watchHeadingAsync((h) => setHeading(Math.round(h.trueHeading >= 0 ? h.trueHeading : h.magHeading)))
        .then(keep)
        .catch(() => {});
    })().catch(() => !cancelled && setPermission('denied'));
    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
    };
  }, [controller]);

  // Pedometer for walking dead reckoning.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    Pedometer.isAvailableAsync()
      .then(async (ok) => {
        if (!ok || cancelled) return;
        const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
        if (cancelled || (perm && !perm.granted)) return;
        controller.setPedometerAvailable(true);
        sub = Pedometer.watchStepCount((r) => controller.setSteps(r.steps));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [controller]);

  // Connectivity.
  useEffect(() => {
    const apply = (s: Network.NetworkState) => setOnline(s.isConnected !== false && s.isInternetReachable !== false);
    Network.getNetworkStateAsync().then(apply).catch(() => {});
    const sub = Network.addNetworkStateListener(apply);
    return () => sub.remove();
  }, []);

  // Heartbeat: advances dead reckoning, signal state and the simulator.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (sim.current) {
        const fix = sim.current.step(now);
        if (fix) controller.ingest(fix);
        else controller.tick(now);
      } else {
        controller.tick(now);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [controller]);

  const value = useMemo<TripContext>(
    () => ({
      controller,
      permission,
      heading,
      online,
      initialCenter,
      setHandlers: (h) => controller.setEffects({ ...baseEffects, ...h }),
      sim: {
        active: simActive,
        interference,
        start: (route, kmh) => {
          controller.engine.reset();
          sim.current = new RouteSimulator(route, kmh / 3.6);
          sim.current.step(Date.now());
          setInterferenceState('none');
          setSimActive(true);
        },
        setInterference: (i) => {
          if (sim.current) sim.current.interference = i;
          setInterferenceState(i);
        },
        stop: () => {
          sim.current = null;
          controller.engine.reset();
          setSimActive(false);
          setInterferenceState('none');
        },
      },
    }),
    [controller, permission, heading, online, initialCenter, simActive, interference],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrip(): TripContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrip must be used inside TripProvider');
  return v;
}

export function useTripSnapshot(): TripSnapshot {
  const { controller } = useTrip();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
