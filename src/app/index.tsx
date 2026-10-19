import { Camera, Map, type CameraRef, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type SFSymbol } from '../components/Icon';
import { CameraAlert, ManeuverBanner, NavFooter, SignalPill, SimulationBar, SpeedCluster } from '../components/NavigationHud';
import { PlaceCard } from '../components/PlaceCard';
import { RoutePanel } from '../components/RoutePanel';
import { SearchOverlay } from '../components/SearchOverlay';
import { Glass, GroupButton, MapButtonGroup, tap } from '../components/ui';
import { fetchRoadInfo, fetchRoutes, reverseGeocode, type Place, type Route, type SpeedCamera, type TravelMode } from '../lib/api';
import type { LatLng } from '../lib/geo';
import { resolveMapFeature } from '../lib/places';
import { type Palette, font, radius, useThemed } from '../lib/theme';
import { AccuracyLayer, ActiveRouteLayer, CamerasLayer, ManeuverArrowLayer, ManeuverBubble, PinMarker, PlacesLayer, RouteOptionsLayer, UserPuck } from '../map/MapLayers';
import { buildMapStyle, DAY, NIGHT } from '../map/style';
import { useTrip, useTripSnapshot } from '../positioning/TripProvider';
import { useAppState, type MapTheme } from '../state/AppState';

type Mode = 'browse' | 'search' | 'place' | 'route' | 'nav';
type Follow = 'off' | 'follow' | 'heading';
type CategoryResults = { title: string; places: Place[]; index: number };

const MOSCOW: LatLng = { latitude: 55.7558, longitude: 37.6173 };
const NEXT_THEME: Record<MapTheme, MapTheme> = { auto: 'night', night: 'day', day: 'auto' };
const THEME_ICON: Record<MapTheme, SFSymbol> = { auto: 'circle.lefthalf.filled', night: 'moon.fill', day: 'sun.max.fill' };
const SIM_SPEED_KMH: Record<TravelMode, number> = { car: 45, bike: 18, foot: 5.5 };
const NAV_ZOOM: Record<TravelMode, number> = { car: 16.6, bike: 17.2, foot: 17.8 };
const KEEP_AWAKE_TAG = 'navigation';

const ll = (c: LatLng): [number, number] => [c.longitude, c.latitude];

function boundsOf(points: LatLng[]): LngLatBounds {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.longitude);
    e = Math.max(e, p.longitude);
    s = Math.min(s, p.latitude);
    n = Math.max(n, p.latitude);
  }
  return [w, s, e, n];
}

export default function MapScreen() {
  const { colors, s } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const camera = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const poiAbort = useRef<AbortController | null>(null);
  const app = useAppState();
  const { settings, updateSettings } = app;
  const { controller, permission, heading, online, sim, setHandlers, initialCenter } = useTrip();
  const trip = useTripSnapshot();
  const position = trip.position;
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const [mode, setMode] = useState<Mode>('browse');
  const [follow, setFollow] = useState<Follow>('off');
  const [mapBearing, setMapBearing] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [category, setCategory] = useState<CategoryResults | null>(null);
  /** Search was opened from the route panel to pick an extra stop. */
  const [searchForStop, setSearchForStop] = useState(false);

  const [stops, setStops] = useState<Place[]>([]);
  const [pickedMode, setPickedMode] = useState<TravelMode | null>(null);
  const travelMode = pickedMode ?? settings.defaultMode;
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeAbort = useRef<AbortController | null>(null);

  const [navRoute, setNavRoute] = useState<Route | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [cameras, setCameras] = useState<SpeedCamera[]>([]);
  const tripStart = useRef<{ startedAt: number; to: Place; arrived: boolean } | null>(null);
  const centeredOnUser = useRef(false);

  // ---- Map theme: follows the app theme (auto / day / night) -----------------
  const day = colors.scheme === 'light';
  const mapStyle = useMemo(() => buildMapStyle(day ? DAY : NIGHT, { buildings3d: settings.buildings3d }), [day, settings.buildings3d]);

  // ---- Camera helpers ----------------------------------------------------
  const flyTo = useCallback((c: LatLng, zoom = 16) => {
    setFollow('off');
    camera.current?.flyTo({ center: ll(c), zoom, bearing: 0, pitch: 0, duration: 800 });
  }, []);

  const fit = useCallback(
    (points: LatLng[], bottom: number) => {
      if (points.length === 0) return;
      setFollow('off');
      camera.current?.fitBounds(boundsOf(points), {
        padding: { top: insets.top + 70, right: 50, bottom, left: 50 },
        bearing: 0,
        pitch: 0,
        duration: 800,
      });
    },
    [insets.top],
  );

  // First trusted position: center once.
  useEffect(() => {
    if (position && !centeredOnUser.current && mode === 'browse') {
      centeredOnUser.current = true;
      camera.current?.flyTo({ center: ll(position.coordinate), zoom: 15, duration: 900 });
    }
  }, [position, mode]);

  // Follow the user.
  useEffect(() => {
    if (!position || follow === 'off') return;
    if (mode === 'nav') {
      const speed = position.speed ?? 0;
      // Zoom out a little at higher speeds to see further ahead.
      const zoom = NAV_ZOOM[navRoute?.mode ?? 'car'] - Math.min(1.4, Math.max(0, (speed - 10) / 15));
      camera.current?.easeTo({
        center: ll(position.coordinate),
        zoom,
        bearing: position.course ?? 0,
        pitch: 55,
        padding: { top: screenH * 0.42, bottom: 100, left: 0, right: 0 },
        duration: 1000,
        easing: 'linear',
      });
      return;
    }
    camera.current?.easeTo({
      center: ll(position.coordinate),
      ...(follow === 'heading' && heading != null ? { bearing: heading, pitch: 40 } : {}),
      duration: 600,
      easing: 'ease',
    });
    // Compass heading only matters in heading-follow mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, follow, mode, navRoute, screenH, follow === 'heading' ? heading : null]);

  // ---- Places --------------------------------------------------------------
  const openPlace = useCallback(
    (p: Place, opts: { keepCategory?: boolean } = {}) => {
      setPlace(p);
      setPlaceLoading(false);
      if (!opts.keepCategory) setCategory(null);
      setMode((m) => (m === 'route' ? 'route' : 'place'));
      app.addRecent(p);
      flyTo(p.coordinate);
    },
    [app, flyTo],
  );

  const onLongPress = async (c: LatLng) => {
    if (mode === 'nav') return;
    tap();
    setCategory(null);
    const pin: Place = { id: `pin-${c.latitude.toFixed(5)}-${c.longitude.toFixed(5)}`, name: 'Точка на карте', address: '', coordinate: c };
    setPlace(pin);
    setPlaceLoading(online);
    if (mode !== 'route') setMode('place');
    if (!online) return;
    try {
      const p = await reverseGeocode(c);
      if (p) setPlace((cur) => (cur?.id === pin.id ? { ...p, id: pin.id, osmRef: p.osmRef } : cur));
    } catch {
      // Keep the unnamed pin.
    } finally {
      setPlaceLoading(false);
    }
  };

  /** Tap on a map icon (shop, pharmacy, cafe…) or a place label opens its card. */
  const onMapPress = async (point: [number, number], lngLat: [number, number]) => {
    if (mode === 'nav' || mode === 'search') return;
    const [x, y] = point;
    const features = await mapRef.current
      ?.queryRenderedFeatures(
        [
          [x - 14, y - 14],
          [x + 14, y + 14],
        ],
        { layers: ['poi', 'place-major', 'place-minor'] },
      )
      .catch(() => [] as GeoJSON.Feature[]);
    const f = features?.find((ft) => ft.properties?.name || ft.properties?.['name:ru']);
    if (!f) return;
    tap();
    const at: LatLng =
      f.geometry.type === 'Point'
        ? { longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1] }
        : { longitude: lngLat[0], latitude: lngLat[1] };
    const name = String(f.properties?.['name:ru'] ?? f.properties?.name);
    poiAbort.current?.abort();
    const ctrl = new AbortController();
    poiAbort.current = ctrl;
    setCategory(null);
    setPlace({ id: `tap-${at.latitude.toFixed(5)}-${at.longitude.toFixed(5)}`, name, address: '', coordinate: at });
    setPlaceLoading(false);
    if (mode !== 'route') setMode('place');
    camera.current?.easeTo({ center: ll(at), duration: 500 });
    if (!online) return;
    try {
      const p = await resolveMapFeature({ id: f.id, properties: f.properties }, at, ctrl.signal);
      if (p && !ctrl.signal.aborted) setPlace(p);
    } catch {
      // Keep the name-only card.
    }
  };

  const showCategory = (title: string, places: Place[]) => {
    setCategory({ title, places, index: 0 });
    setPlace(places[0]);
    setMode('place');
    fit(
      places.map((p) => p.coordinate),
      380,
    );
  };

  const pageCategory = (delta: number) => {
    if (!category) return;
    const index = Math.max(0, Math.min(category.places.length - 1, category.index + delta));
    setCategory({ ...category, index });
    setPlace(category.places[index]);
    camera.current?.easeTo({ center: ll(category.places[index].coordinate), duration: 500 });
  };

  useFocusEffect(
    useCallback(() => {
      const p = app.consumePendingPlace();
      if (p) openPlace(p);
    }, [app, openPlace]),
  );

  // ---- Routing -------------------------------------------------------------
  const requestRoutes = async (to: Place[], travel: TravelMode) => {
    routeAbort.current?.abort();
    const ctrl = new AbortController();
    routeAbort.current = ctrl;
    setRoutes([]);
    setSelectedRoute(0);
    setRouteLoading(true);
    setRouteError(null);
    try {
      const from = positionRef.current?.coordinate;
      if (!from) throw new Error(permission === 'denied' ? 'Геолокация выключена' : 'Ждём ваше местоположение — повторите через пару секунд');
      if (!online) throw new Error('Нет интернета. Маршрут построить нельзя, но уже начатое ведение работает офлайн');
      const r = await fetchRoutes(
        from,
        to.map((p) => p.coordinate),
        travel,
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setRoutes(r);
      fit([from, ...r.flatMap((x) => x.coordinates.filter((_, i) => i % 8 === 0)), ...to.map((p) => p.coordinate)], 440);
    } catch (e) {
      if (!ctrl.signal.aborted) setRouteError(e instanceof Error ? e.message : 'Нет соединения');
    } finally {
      if (!ctrl.signal.aborted) setRouteLoading(false);
    }
  };

  const routeTo = (p: Place) => {
    const next = [p];
    setStops(next);
    setPlace(p);
    setCategory(null);
    setMode('route');
    requestRoutes(next, travelMode);
  };

  const addStop = (p: Place) => {
    // New stop goes before the destination.
    const next = [...stops.slice(0, -1), p, stops[stops.length - 1]];
    setStops(next);
    setPlace(next[next.length - 1]);
    setCategory(null);
    setMode('route');
    requestRoutes(next, travelMode);
  };

  const removeStop = (i: number) => {
    const next = stops.filter((_, j) => j !== i);
    setStops(next);
    requestRoutes(next, travelMode);
  };

  const changeTravelMode = (m: TravelMode) => {
    setPickedMode(m);
    if (stops.length) requestRoutes(stops, m);
  };

  const closeRoutePanel = () => {
    routeAbort.current?.abort();
    setRoutes([]);
    setRouteLoading(false);
    setMode(place ? 'place' : 'browse');
  };

  // ---- Navigation ------------------------------------------------------------
  const beginNavigation = (r: Route) => {
    controller.setRoute(r, { announce: true, now: Date.now() });
    setNavRoute(r);
    setCameras([]);
    setMode('nav');
    setFollow('follow');
    tripStart.current = { startedAt: Date.now(), to: stops[stops.length - 1], arrived: false };
    if (r.mode === 'car' && online) {
      fetchRoadInfo(r)
        .then((info) => {
          controller.setRoadInfo(info, Date.now());
          setCameras(info.cameras);
        })
        .catch(() => {});
    }
  };

  const startNavigation = () => {
    const r = routes[selectedRoute];
    if (r) beginNavigation(r);
  };

  const startSimulation = () => {
    const r = routes[selectedRoute];
    if (!r) return;
    sim.start(r, SIM_SPEED_KMH[r.mode]);
    beginNavigation(r);
  };

  const endNavigation = useCallback(() => {
    const t = tripStart.current;
    const snap = controller.getSnapshot();
    if (t && navRoute) {
      app.addTrip({
        id: String(t.startedAt),
        mode: navRoute.mode,
        to: t.to,
        startedAt: t.startedAt,
        endedAt: Date.now(),
        distance: snap.progress?.along ?? 0,
        arrived: t.arrived,
      });
      if (navRoute.mode === 'car' && settings.autoParking && snap.position && !sim.active) {
        app.setParking({ coordinate: snap.position.coordinate, savedAt: Date.now() });
      }
    }
    tripStart.current = null;
    controller.setRoute(null, { announce: false, now: Date.now() });
    if (sim.active) sim.stop();
    setNavRoute(null);
    setRoutes([]);
    setCameras([]);
    setRerouting(false);
    setMode(place ? 'place' : 'browse');
    setFollow('off');
    camera.current?.setStop({ pitch: 0, bearing: 0, duration: 500 }).catch(() => {});
  }, [app, controller, navRoute, place, settings.autoParking, sim]);

  const reroute = useCallback(
    (from: LatLng) => {
      if (!navRoute || !online) return;
      const along = controller.getSnapshot().progress?.along ?? 0;
      const passed = navRoute.steps.filter((s) => s.maneuver.type === 'waypoint' && s.along <= along).length;
      const remaining = stops.slice(passed);
      if (!remaining.length) return;
      setRerouting(true);
      fetchRoutes(
        from,
        remaining.map((p) => p.coordinate),
        navRoute.mode,
      )
        .then((r) => {
          controller.setRoute(r[0], { announce: false, now: Date.now() });
          setNavRoute(r[0]);
        })
        .catch(() => {})
        .finally(() => setRerouting(false));
    },
    [controller, navRoute, online, stops],
  );

  useEffect(() => {
    setHandlers({
      reroute,
      arrived: () => {
        const t = tripStart.current;
        if (!t) return;
        t.arrived = true;
        // End automatically unless the user already ended or started another trip.
        setTimeout(() => tripStart.current === t && endNavigation(), 5000);
      },
    });
  }, [setHandlers, reroute, endNavigation]);

  useEffect(() => {
    if (mode === 'nav' && settings.keepAwake) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      return () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
  }, [mode, settings.keepAwake]);

  const overview = () => {
    if (!navRoute) return;
    const along = trip.progress?.along ?? 0;
    const ahead = navRoute.coordinates.filter((_, i) => navRoute.cumulative[i] >= along && i % 4 === 0);
    fit([...(position ? [position.coordinate] : []), ...ahead, navRoute.coordinates[navRoute.coordinates.length - 1]], 200);
  };

  const onLocateButton = () => {
    if (!position) {
      if (permission === 'denied') Linking.openSettings();
      return;
    }
    if (follow === 'off') {
      setFollow('follow');
      camera.current?.flyTo({ center: ll(position.coordinate), zoom: 16, duration: 600 });
    } else if (follow === 'follow') {
      setFollow('heading');
    } else {
      setFollow('follow');
      camera.current?.setStop({ bearing: 0, pitch: 0, duration: 400 }).catch(() => {});
    }
  };

  // ---- Render ---------------------------------------------------------------
  const home = app.favorites.find((f) => f.label === 'home');
  const work = app.favorites.find((f) => f.label === 'work');
  const navigating = mode === 'nav' && !!navRoute;
  const nextStep = trip.progress?.next ?? null;
  const showPlaces = !!category && (mode === 'place' || mode === 'search');

  return (
    <View style={s.root}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        onPress={(e) => onMapPress(e.nativeEvent.point, e.nativeEvent.lngLat)}
        logo={false}
        compass={false}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        onLongPress={(e) => onLongPress({ longitude: e.nativeEvent.lngLat[0], latitude: e.nativeEvent.lngLat[1] })}
        onRegionWillChange={(e) => {
          if (e.nativeEvent.userInteraction && follow !== 'off') setFollow('off');
        }}
        onRegionDidChange={(e) => setMapBearing(e.nativeEvent.bearing)}
      >
        <Camera ref={camera} initialViewState={{ center: ll(initialCenter ?? MOSCOW), zoom: 12 }} />

        {mode === 'route' && routes.length ? <RouteOptionsLayer routes={routes} selected={selectedRoute} onSelect={setSelectedRoute} /> : null}
        {navigating && navRoute ? (
          <ActiveRouteLayer route={navRoute} along={trip.progress?.along ?? 0} splitAt={trip.progress?.point ?? null} />
        ) : null}
        {navigating && navRoute && nextStep && (trip.progress?.distanceToNext ?? Infinity) < 600 ? <ManeuverArrowLayer route={navRoute} step={nextStep} /> : null}
        {navigating && nextStep && nextStep.maneuver.type !== 'arrive' && (trip.progress?.distanceToNext ?? Infinity) < 450 ? (
          <ManeuverBubble step={nextStep} distance={trip.progress!.distanceToNext} />
        ) : null}
        {showPlaces && category ? <PlacesLayer places={category.places} selectedId={place?.id ?? null} onSelect={(p) => openPlace(p, { keepCategory: true })} /> : null}
        {navigating ? <CamerasLayer cameras={cameras} /> : null}

        {mode === 'browse' && app.parking ? <PinMarker coordinate={app.parking.coordinate} kind="parking" /> : null}
        {mode === 'browse' && home ? <PinMarker coordinate={home.coordinate} kind="home" /> : null}
        {mode === 'browse' && work ? <PinMarker coordinate={work.coordinate} kind="work" /> : null}
        {(mode === 'route' || navigating) &&
          stops.map((st, i) => <PinMarker key={`stop-${st.id}-${i}`} coordinate={st.coordinate} kind={i === stops.length - 1 ? 'destination' : 'stop'} />)}
        {mode === 'place' && place && !category ? <PinMarker coordinate={place.coordinate} /> : null}

        {position ? <AccuracyLayer position={position} /> : null}
        {position ? <UserPuck position={position} mapBearing={mapBearing} arrow={navigating || (position.speed ?? 0) > 1.5} /> : null}
      </Map>

      {/* Top area */}
      {navigating ? (
        <ManeuverBanner
          trip={trip}
          topInset={insets.top}
          rerouting={rerouting}
          right={<SpeedCluster trip={trip} show={settings.showSpeed && navRoute?.mode !== 'foot'} />}
        >
          <SignalPill trip={trip} online={online} navigating />
          <CameraAlert trip={trip} />
        </ManeuverBanner>
      ) : null}

      {mode !== 'search' && !navigating ? (
        <View style={[s.topLeft, { top: insets.top + 10 }]} pointerEvents="box-none">
          <SignalPill trip={trip} online={online} navigating={false} />
          {permission === 'denied' ? (
            <Pressable onPress={() => Linking.openSettings()}>
              <Glass radius={16}>
                <View style={s.permission}>
                  <Icon name="location.slash.fill" size={13} color={colors.orange} />
                  <Text style={s.permissionText}>Разрешите геолокацию</Text>
                </View>
              </Glass>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {mode !== 'search' && !navigating ? (
        <View style={[s.mapButtons, { top: insets.top + 10 }]}>
          <MapButtonGroup>
            <GroupButton label="Тема карты" icon={THEME_ICON[settings.mapTheme]} onPress={() => updateSettings({ mapTheme: NEXT_THEME[settings.mapTheme] })} />
            <GroupButton
              label="Моё местоположение"
              divider
              icon={follow === 'heading' ? 'location.north.line.fill' : follow === 'follow' ? 'location.fill' : 'location'}
              active={follow !== 'off'}
              onPress={onLocateButton}
            />
          </MapButtonGroup>
          {Math.abs(mapBearing) > 2 && follow !== 'heading' ? (
            <Pressable onPress={() => (tap(), camera.current?.setStop({ bearing: 0, pitch: 0, duration: 400 }).catch(() => {}))}>
              <Glass radius={23} style={s.compass}>
                <View style={{ transform: [{ rotate: `${-mapBearing}deg` }] }}>
                  <Icon name="location.north.fill" size={18} color={colors.red} />
                </View>
              </Glass>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Bottom area */}
      {navigating && follow === 'off' ? (
        <Pressable style={[s.recenter, { bottom: insets.bottom + 84 }]} onPress={() => (tap(), setFollow('follow'))}>
          <Icon name="location.north.fill" size={15} color={colors.onAccent} />
          <Text style={s.recenterText}>Продолжить</Text>
        </Pressable>
      ) : null}

      {navigating && sim.active ? (
        <View style={[s.simBar, { bottom: insets.bottom + 140 }]}>
          <SimulationBar value={sim.interference} onChange={sim.setInterference} />
        </View>
      ) : null}

      {mode === 'browse' ? (
        <Glass style={s.dock} radius={radius.xl}>
          <View style={[s.dockInner, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable style={s.searchField} onPress={() => (tap(), setMode('search'))}>
              <Icon name="magnifyingglass" size={16} color={colors.textSecondary} />
              <Text style={s.searchPlaceholder}>Куда едем?</Text>
            </Pressable>
            <View style={s.shortcuts}>
              <Shortcut icon="house.fill" color={colors.green} title="Дом" sub={home ? undefined : 'Добавить'} onPress={() => (home ? routeTo(home) : router.push('/favorites'))} />
              <Shortcut icon="briefcase.fill" color="#8C6CFF" title="Работа" sub={work ? undefined : 'Добавить'} onPress={() => (work ? routeTo(work) : router.push('/favorites'))} />
              <Shortcut
                icon="car.fill"
                color="#4B6BFF"
                title="Машина"
                sub={app.parking ? undefined : 'Нет'}
                onPress={() =>
                  app.parking
                    ? openPlace({ id: 'parking', name: 'Моя машина', address: 'Место парковки', coordinate: app.parking.coordinate })
                    : router.push('/history')
                }
              />
              <Shortcut icon="star.fill" color={colors.yellow} title="Избранное" onPress={() => router.push('/favorites')} />
              <Shortcut icon="ellipsis" color="#8E8E93" title="Ещё" onPress={() => router.push('/settings')} />
            </View>
          </View>
        </Glass>
      ) : null}

      {mode === 'place' && place ? (
        <PlaceCard
          key={place.id}
          place={place}
          near={position?.coordinate ?? null}
          bottomInset={insets.bottom}
          loading={placeLoading}
          online={online}
          onRoute={() => routeTo(place)}
          onClose={() => {
            setPlace(null);
            setCategory(null);
            setMode('browse');
          }}
          pager={category ? { index: category.index, total: category.places.length, onPrev: () => pageCategory(-1), onNext: () => pageCategory(1) } : undefined}
        />
      ) : null}

      {mode === 'route' && place && !stops.some((st) => st.id === place.id) ? (
        // A place picked while planning: offer it as destination or extra stop.
        <PlaceCard
          key={`plan-${place.id}`}
          place={place}
          near={position?.coordinate ?? null}
          bottomInset={insets.bottom}
          online={online}
          onRoute={() => routeTo(place)}
          onAddStop={() => addStop(place)}
          onClose={() => setPlace(stops[stops.length - 1] ?? null)}
        />
      ) : mode === 'route' && stops.length ? (
        <RoutePanel
          stops={stops}
          onRemoveStop={removeStop}
          onAddStop={() => {
            setSearchForStop(true);
            setMode('search');
          }}
          mode={travelMode}
          onModeChange={changeTravelMode}
          routes={routes}
          selected={selectedRoute}
          onSelect={setSelectedRoute}
          loading={routeLoading}
          error={routeError}
          canStart={!!position}
          onStart={startNavigation}
          onSimulate={startSimulation}
          onRetry={() => requestRoutes(stops, travelMode)}
          onClose={closeRoutePanel}
          bottomInset={insets.bottom}
        />
      ) : null}

      {navigating && navRoute ? (
        <NavFooter
          trip={trip}
          totalDistance={navRoute.cumulative[navRoute.cumulative.length - 1]}
          bottomInset={insets.bottom}
          voice={settings.voice}
          onToggleVoice={() => updateSettings({ voice: !settings.voice })}
          onOverview={overview}
          onEnd={endNavigation}
        />
      ) : null}

      {mode === 'search' ? (
        <SearchOverlay
          topInset={insets.top}
          near={position?.coordinate ?? null}
          online={online}
          onClose={() => {
            setSearchForStop(false);
            setMode(searchForStop ? 'route' : place ? 'place' : 'browse');
          }}
          onPick={(p) => {
            if (searchForStop) {
              setSearchForStop(false);
              setMode('route');
              addStop(p);
            } else openPlace(p);
          }}
          onCategoryResults={showCategory}
        />
      ) : null}
    </View>
  );
}

function Shortcut({ icon, color, title, sub, onPress }: { icon: SFSymbol; color: string; title: string; sub?: string; onPress: () => void }) {
  const { s } = useThemed(makeStyles);
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => [s.shortcut, pressed && { opacity: 0.6 }]}>
      <View style={[s.shortcutIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={18} color="#FFFFFF" />
      </View>
      <Text style={s.shortcutTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={s.shortcutSub} numberOfLines={1}>
        {sub ?? ' '}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topLeft: { position: 'absolute', left: 12, right: 72, gap: 8, alignItems: 'flex-start' },
  mapButtons: { position: 'absolute', right: 12, gap: 10, alignItems: 'center' },
  compass: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  permission: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8 },
  permissionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  recenter: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
  },
  recenterText: { ...font.headline, color: colors.onAccent, fontSize: 16 },
  simBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dockInner: { paddingHorizontal: 16, paddingTop: 14 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
  },
  searchPlaceholder: { flex: 1, color: colors.textSecondary, fontSize: 17 },
  shortcuts: { flexDirection: 'row', marginTop: 14, marginBottom: 2 },
  shortcut: { flex: 1, alignItems: 'center', gap: 4 },
  shortcutIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  shortcutTitle: { color: colors.text, fontSize: 12, fontWeight: '600' },
  shortcutSub: { color: colors.textTertiary, fontSize: 11, marginTop: -2 },
});
