import { GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '../components/Icon';
import type { Place, Route, SpeedCamera } from '../lib/api';
import type { LatLng } from '../lib/geo';
import { useThemed, type Palette } from '../lib/theme';
import type { DisplayPosition } from '../positioning/controller';

const lngLat = (c: LatLng): [number, number] => [c.longitude, c.latitude];
const line = (coords: LatLng[], props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'LineString', coordinates: coords.map(lngLat) },
});
const point = (c: LatLng, props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Point', coordinates: lngLat(c) },
});
const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

const ROUTE_WIDTH = ['interpolate', ['exponential', 1.5], ['zoom'], 10, 4, 14, 8, 18, 18] as const;
const CASING_WIDTH = ['interpolate', ['exponential', 1.5], ['zoom'], 10, 6, 14, 11, 18, 23] as const;

/** Route options shown while planning; the selected one on top. */
export function RouteOptionsLayer({ routes, selected, onSelect }: { routes: Route[]; selected: number; onSelect: (i: number) => void }) {
  const { colors } = useThemed(makeStyles);
  const data = useMemo(
    () => collection(routes.map((r, i) => line(r.coordinates, { index: i, selected: i === selected ? 1 : 0 })).sort((a, b) => Number(a.properties!.selected) - Number(b.properties!.selected))),
    [routes, selected],
  );
  return (
    <GeoJSONSource
      id="route-options"
      data={data}
      hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}
      onPress={(e) => {
        const idx = e.nativeEvent.features?.[0]?.properties?.index;
        if (typeof idx === 'number') onSelect(idx);
      }}
    >
      <Layer
        id="route-options-casing"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'selected'] }}
        paint={{ 'line-color': ['case', ['==', ['get', 'selected'], 1], colors.routeCasing, '#2E3440'], 'line-width': CASING_WIDTH as never }}
      />
      <Layer
        id="route-options-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'selected'] }}
        paint={{ 'line-color': ['case', ['==', ['get', 'selected'], 1], colors.route, colors.routeAlt], 'line-width': ROUTE_WIDTH as never }}
      />
    </GeoJSONSource>
  );
}

/** Active route: passed part dimmed, remaining part bright. */
export function ActiveRouteLayer({ route, along, splitAt }: { route: Route; along: number; splitAt: LatLng | null }) {
  const { colors } = useThemed(makeStyles);
  const data = useMemo(() => {
    let i = 0;
    while (i < route.cumulative.length - 1 && route.cumulative[i + 1] <= along) i++;
    const cut = splitAt ?? route.coordinates[i];
    const behind = [...route.coordinates.slice(0, i + 1), cut];
    const ahead = [cut, ...route.coordinates.slice(i + 1)];
    return collection([line(behind, { part: 'behind' }), line(ahead, { part: 'ahead' })]);
  }, [route, along, splitAt]);
  return (
    <GeoJSONSource id="active-route" data={data}>
      <Layer
        id="active-route-casing"
        type="line"
        filter={['==', ['get', 'part'], 'ahead']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': colors.routeCasing, 'line-width': CASING_WIDTH as never }}
      />
      <Layer
        id="active-route-behind"
        type="line"
        filter={['==', ['get', 'part'], 'behind']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': colors.routePassed, 'line-width': ROUTE_WIDTH as never, 'line-opacity': 0.7 }}
      />
      <Layer
        id="active-route-ahead"
        type="line"
        filter={['==', ['get', 'part'], 'ahead']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': colors.route, 'line-width': ROUTE_WIDTH as never }}
      />
    </GeoJSONSource>
  );
}

/** Search / category results as dots with labels; tapping selects. */
export function PlacesLayer({ places, selectedId, onSelect }: { places: Place[]; selectedId: string | null; onSelect: (p: Place) => void }) {
  const { colors } = useThemed(makeStyles);
  const data = useMemo(() => collection(places.map((p, i) => point(p.coordinate, { i, name: p.name, sel: p.id === selectedId ? 1 : 0 }))), [places, selectedId]);
  return (
    <GeoJSONSource
      id="places"
      data={data}
      hitbox={{ top: 14, right: 14, bottom: 14, left: 14 }}
      onPress={(e) => {
        const i = e.nativeEvent.features?.[0]?.properties?.i;
        if (typeof i === 'number' && places[i]) onSelect(places[i]);
      }}
    >
      <Layer
        id="places-dot"
        type="circle"
        paint={{
          'circle-radius': ['case', ['==', ['get', 'sel'], 1], 9, 6.5],
          'circle-color': ['case', ['==', ['get', 'sel'], 1], colors.red, colors.accent],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="places-label"
        type="symbol"
        layout={{
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
        }}
        paint={{ 'text-color': colors.text, 'text-halo-color': colors.bg, 'text-halo-width': 1.4 }}
      />
    </GeoJSONSource>
  );
}

export function CamerasLayer({ cameras }: { cameras: SpeedCamera[] }) {
  const { s: styles } = useThemed(makeStyles);
  return (
    <>
      {cameras.map((c) => (
        <Marker key={`cam-${c.id}`} lngLat={lngLat(c.coordinate)} anchor="center">
          <View style={styles.camera}>
            <Icon name="camera.fill" size={12} color="#FFFFFF" />
          </View>
        </Marker>
      ))}
    </>
  );
}

export function PinMarker({ coordinate, kind = 'destination' }: { coordinate: LatLng; kind?: 'destination' | 'stop' | 'parking' | 'home' | 'work' }) {
  const { colors, s: styles } = useThemed(makeStyles);
  const color = { destination: colors.red, stop: colors.orange, parking: '#4B6BFF', home: colors.green, work: '#8C6CFF' }[kind];
  const icon = ({ destination: 'mappin', stop: 'flag.fill', parking: 'parkingsign', home: 'house.fill', work: 'briefcase.fill' } as const)[kind];
  return (
    <Marker lngLat={lngLat(coordinate)} anchor="bottom">
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.pin, { backgroundColor: color }]}>
          <Icon name={icon} size={14} color="#FFFFFF" weight="bold" />
        </View>
        <View style={[styles.pinTail, { borderTopColor: color }]} />
      </View>
    </Marker>
  );
}

/** Accuracy halo in meters; size follows zoom. */
export function AccuracyLayer({ position }: { position: DisplayPosition }) {
  const { colors } = useThemed(makeStyles);
  const data = useMemo(() => collection([point(position.coordinate)]), [position.coordinate]);
  const lat = position.coordinate.latitude;
  // MapLibre native uses 512 px tiles.
  const mpp0 = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 512;
  const r = Math.min(position.accuracy, 3000);
  const color = position.source === 'gps' ? colors.accent : colors.dr;
  return (
    <GeoJSONSource id="accuracy" data={data}>
      <Layer
        id="accuracy-halo"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, r / mpp0, 22, (r / mpp0) * 2 ** 22] as never,
          'circle-color': color,
          'circle-opacity': 0.12,
          'circle-stroke-color': color,
          'circle-stroke-opacity': 0.35,
          'circle-stroke-width': 1,
          'circle-pitch-alignment': 'map',
        }}
      />
    </GeoJSONSource>
  );
}

/**
 * User location puck. Arrow when moving/navigating (rotated relative to the map),
 * dot otherwise. Grey and dashed when the position is estimated (dead reckoning).
 */
export function UserPuck({ position, mapBearing, arrow }: { position: DisplayPosition; mapBearing: number; arrow: boolean }) {
  const { colors, s: styles } = useThemed(makeStyles);
  const estimated = position.source !== 'gps';
  const color = estimated ? colors.dr : colors.accent;
  const rotation = (position.course ?? 0) - mapBearing;
  return (
    <Marker lngLat={lngLat(position.coordinate)} anchor="center">
      <View style={styles.puckWrap}>
        {arrow && position.course != null ? (
          <View style={{ transform: [{ rotate: `${rotation}deg` }] }}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              <Circle cx={22} cy={22} r={20} fill="#FFFFFF" opacity={0.95} />
              <Path d="M22 7 L33 33 L22 27 L11 33 Z" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
            </Svg>
          </View>
        ) : (
          <View style={[styles.dot, { backgroundColor: color }, estimated && styles.dotDashed]} />
        )}
      </View>
    </Marker>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  camera: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  puckWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  dotDashed: { borderStyle: 'dashed' },
});
