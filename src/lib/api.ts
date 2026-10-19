import { cumulativeDistances, distance, snapToPolyline, type LatLng } from './geo';
import { instructionText, type Lane, type Maneuver } from './instructions';

// Free OpenStreetMap-based services:
// - Photon: fast search-as-you-type and reverse geocoding.
// - OSRM (routing.openstreetmap.de): car / bike / foot routes.
// - Overpass: speed limits and speed cameras along a route.
const PHOTON = 'https://photon.komoot.io';
const ROUTING = 'https://routing.openstreetmap.de';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const HEADERS = { 'User-Agent': 'iPhoneLab-Navigator/1.0', 'Accept-Language': 'ru' };

export class NetworkError extends Error {}

export type Place = {
  id: string;
  name: string;
  address: string;
  coordinate: LatLng;
  category?: string;
  /** OSM reference like "N123" for detail lookups. */
  osmRef?: string;
};

export type TravelMode = 'car' | 'bike' | 'foot';

export type RouteStep = {
  maneuver: Maneuver;
  location: LatLng;
  street: string;
  distance: number;
  duration: number;
  /** Meters along the route geometry where this maneuver happens. */
  along: number;
  text: string;
  lanes: Lane[];
  /** Street-name changes and "continue straight": shown in lists, not announced. */
  silent: boolean;
};

export type Route = {
  id: string;
  mode: TravelMode;
  distance: number;
  duration: number;
  summary: string;
  coordinates: LatLng[];
  cumulative: number[];
  steps: RouteStep[];
  /** Destination and intermediate stops in order. */
  stops: LatLng[];
  createdAt: number;
};

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new NetworkError('Нет соединения с сервером');
  }
  if (!res.ok) throw new NetworkError(`Сервер ответил ${res.status}`);
  return (await res.json()) as T;
}

// ---- Search ---------------------------------------------------------------

const CATEGORY_RU: Record<string, string> = {
  cafe: 'Кафе',
  restaurant: 'Ресторан',
  fast_food: 'Фастфуд',
  bar: 'Бар',
  pub: 'Паб',
  fuel: 'АЗС',
  charging_station: 'Зарядка',
  pharmacy: 'Аптека',
  atm: 'Банкомат',
  bank: 'Банк',
  supermarket: 'Супермаркет',
  convenience: 'Продукты',
  mall: 'Торговый центр',
  hospital: 'Больница',
  clinic: 'Клиника',
  parking: 'Парковка',
  hotel: 'Отель',
  museum: 'Музей',
  theatre: 'Театр',
  cinema: 'Кинотеатр',
  park: 'Парк',
  station: 'Станция',
  subway_entrance: 'Вход в метро',
  bus_stop: 'Остановка',
  school: 'Школа',
  university: 'Университет',
  car_wash: 'Автомойка',
  car_repair: 'Автосервис',
  toilets: 'Туалет',
  house: 'Дом',
  residential: 'Жилой дом',
  city: 'Город',
  town: 'Город',
  village: 'Посёлок',
  suburb: 'Район',
  square: 'Площадь',
  street: 'Улица',
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
  };
};

function fromPhoton(f: PhotonFeature): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const street = [p.street, p.housenumber].filter(Boolean).join(', ');
  const name = p.name || street || p.city || 'Без названия';
  const address = [street !== name ? street : '', p.city !== name ? p.city : ''].filter(Boolean).join(', ') || p.district || p.state || '';
  const osmRef = p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : undefined;
  return {
    id: osmRef ?? `${lat.toFixed(5)},${lon.toFixed(5)}`,
    name,
    address,
    coordinate: { latitude: lat, longitude: lon },
    category: (p.osm_value && CATEGORY_RU[p.osm_value]) || undefined,
    osmRef,
  };
}

/** Search-as-you-type, biased to `near`. */
export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '15' });
  if (near) {
    params.set('lat', String(near.latitude));
    params.set('lon', String(near.longitude));
  }
  const data = await getJson<{ features: PhotonFeature[] }>(`${PHOTON}/api/?${params}`, { signal });
  return data.features.map(fromPhoton);
}

export type Category = { id: string; title: string; icon: string; query: string; osmTag: string };

/** Places of an OSM tag (e.g. "amenity:pharmacy") within a few km of `near`. */
export async function searchNearby(cat: Category, near: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const d = 0.03;
  const params = new URLSearchParams({
    q: cat.query,
    limit: '40',
    lat: String(near.latitude),
    lon: String(near.longitude),
    osm_tag: cat.osmTag,
    bbox: [near.longitude - d * 1.8, near.latitude - d, near.longitude + d * 1.8, near.latitude + d].join(','),
  });
  const data = await getJson<{ features: PhotonFeature[] }>(`${PHOTON}/api/?${params}`, { signal });
  return data.features
    .map(fromPhoton)
    .map((p) => ({ ...p, category: p.category ?? cat.title }))
    .sort((a, b) => distance(near, a.coordinate) - distance(near, b.coordinate));
}

export async function reverseGeocode(c: LatLng, signal?: AbortSignal): Promise<Place | null> {
  const params = new URLSearchParams({ lat: String(c.latitude), lon: String(c.longitude), limit: '1' });
  const data = await getJson<{ features: PhotonFeature[] }>(`${PHOTON}/reverse?${params}`, { signal });
  const f = data.features[0];
  return f ? { ...fromPhoton(f), coordinate: c } : null;
}

// ---- Routing --------------------------------------------------------------

const PROFILE: Record<TravelMode, string> = { car: 'routed-car', bike: 'routed-bike', foot: 'routed-foot' };

type OsrmStep = {
  distance: number;
  duration: number;
  name: string;
  ref?: string;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] };
  intersections?: { lanes?: { valid: boolean; indications: string[] }[] }[];
};
type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { summary: string; steps: OsrmStep[] }[];
};

/** Routes from `from` through `stops` (last one is the destination). */
export async function fetchRoutes(from: LatLng, stops: LatLng[], mode: TravelMode, signal?: AbortSignal): Promise<Route[]> {
  const coords = [from, ...stops].map((c) => `${c.longitude.toFixed(6)},${c.latitude.toFixed(6)}`).join(';');
  // Alternatives are only available for A→B routes.
  const alt = stops.length === 1 ? 'true' : 'false';
  const url = `${ROUTING}/${PROFILE[mode]}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${alt}`;
  const data = await getJson<{ code: string; message?: string; routes?: OsrmRoute[] }>(url, { signal });
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.code === 'NoRoute' ? 'Маршрут не найден' : (data.message ?? 'Не удалось построить маршрут'));
  }
  return data.routes.map((r, i) => toRoute(r, mode, i, stops));
}

function isSilent(m: Maneuver): boolean {
  if (m.type === 'new name' || m.type === 'notification') return true;
  if (m.type === 'continue') return !m.modifier || m.modifier === 'straight' || m.modifier.startsWith('slight');
  return false;
}

function toRoute(r: OsrmRoute, mode: TravelMode, index: number, stops: LatLng[]): Route {
  const coordinates = r.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  const cumulative = cumulativeDistances(coordinates);
  const geomLength = cumulative[cumulative.length - 1] || 1;
  // OSRM step distances are on the road network; scale them to our geometry length
  // so maneuver positions line up with snapped positions.
  const scale = geomLength / (r.distance || 1);
  const steps: RouteStep[] = [];
  let along = 0;
  const legs = r.legs.length;
  r.legs.forEach((leg, legIndex) => {
    for (const s of leg.steps) {
      const street = s.name || s.ref || '';
      const isWaypoint = s.maneuver.type === 'arrive' && legIndex < legs - 1;
      const maneuver: Maneuver = {
        type: isWaypoint ? 'waypoint' : s.maneuver.type,
        modifier: s.maneuver.modifier,
        exit: s.maneuver.exit,
      };
      const lanes = (s.intersections?.[0]?.lanes ?? []).map((l) => ({ valid: l.valid, indications: l.indications }));
      steps.push({
        maneuver,
        location: { latitude: s.maneuver.location[1], longitude: s.maneuver.location[0] },
        street,
        distance: s.distance,
        duration: s.duration,
        along: Math.min(along, geomLength),
        text: instructionText(maneuver, street, mode),
        lanes: lanes.length > 1 ? lanes : [],
        silent: isSilent(maneuver),
      });
      along += s.distance * scale;
    }
  });
  return {
    id: `${mode}-${index}-${Math.round(r.distance)}-${Date.now()}`,
    mode,
    distance: r.distance,
    duration: r.duration,
    summary: r.legs.map((l) => l.summary).filter(Boolean)[0] ?? '',
    coordinates,
    cumulative,
    steps,
    stops,
    createdAt: Date.now(),
  };
}

// ---- Road info: speed limits & cameras -------------------------------------

export type SpeedCamera = { id: number; coordinate: LatLng; along: number; limit: number | null };
export type SpeedLimitSpan = { from: number; to: number; kmh: number };
export type RoadInfo = { cameras: SpeedCamera[]; limits: SpeedLimitSpan[] };

/** Parses OSM maxspeed values, including Russian implicit ones like "RU:urban". */
export function parseMaxspeed(v: string | undefined): number | null {
  if (!v) return null;
  const implicit: Record<string, number> = {
    'RU:urban': 60,
    'RU:rural': 90,
    'RU:motorway': 110,
    'RU:living_street': 20,
    'RU:zone20': 20,
    'RU:zone30': 30,
    'RU:zone40': 40,
  };
  if (implicit[v] != null) return implicit[v];
  const m = /^(\d+)\s*(mph)?$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] ? Math.round(n * 1.609) : n;
}

type OverpassElement =
  | { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
  | { type: 'way'; id: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> };

const ROAD_INFO_MAX_LENGTH = 60000;
const ROAD_INFO_SAMPLE = 120;

/** Loads speed limits and cameras along the first 60 km of a car route. Slow (10–40 s). */
export async function fetchRoadInfo(route: Route, signal?: AbortSignal): Promise<RoadInfo> {
  const total = Math.min(route.cumulative[route.cumulative.length - 1], ROAD_INFO_MAX_LENGTH);
  const samples: { along: number; c: LatLng }[] = [];
  for (let i = 0, next = 0; i < route.coordinates.length && route.cumulative[i] <= total; i++) {
    if (route.cumulative[i] >= next) {
      samples.push({ along: route.cumulative[i], c: route.coordinates[i] });
      next = route.cumulative[i] + ROAD_INFO_SAMPLE;
    }
  }
  const poly = samples.map((s) => `${s.c.latitude.toFixed(5)},${s.c.longitude.toFixed(5)}`).join(',');
  const query = `[out:json][timeout:45];(way(around:15,${poly})["highway"]["maxspeed"];way(around:15,${poly})["highway"]["zone:maxspeed"];node(around:40,${poly})["highway"="speed_camera"];);out tags geom;`;

  let data: { elements: OverpassElement[] } | null = null;
  let lastError: unknown = null;
  for (const endpoint of OVERPASS) {
    try {
      data = await getJson(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      });
      break;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      lastError = e;
    }
  }
  if (!data) throw lastError ?? new NetworkError('Нет данных о дорогах');
  return roadInfoFromElements(route, samples, data.elements);
}

export function roadInfoFromElements(route: Route, samples: { along: number; c: LatLng }[], elements: OverpassElement[]): RoadInfo {
  const ways = elements
    .filter((e): e is Extract<OverpassElement, { type: 'way' }> => e.type === 'way' && !!e.geometry?.length)
    .map((wy) => {
      const line = wy.geometry!.map((g) => ({ latitude: g.lat, longitude: g.lon }));
      return { line, cum: cumulativeDistances(line), kmh: parseMaxspeed(wy.tags?.maxspeed ?? wy.tags?.['zone:maxspeed']) };
    })
    .filter((wy) => wy.kmh != null);

  // Speed limit at each sample: the nearest way within 15 m.
  const limits: SpeedLimitSpan[] = [];
  for (let i = 0; i < samples.length; i++) {
    let best: number | null = null;
    let bestD = 15;
    for (const wy of ways) {
      const d = snapToPolyline(samples[i].c, wy.line, wy.cum).offset;
      if (d < bestD) {
        bestD = d;
        best = wy.kmh;
      }
    }
    if (best == null) continue;
    const from = samples[i].along;
    const to = samples[i + 1]?.along ?? from + ROAD_INFO_SAMPLE;
    const last = limits[limits.length - 1];
    if (last && last.kmh === best && Math.abs(last.to - from) < 1) last.to = to;
    else limits.push({ from, to, kmh: best });
  }

  const cameras: SpeedCamera[] = elements
    .filter((e): e is Extract<OverpassElement, { type: 'node' }> => e.type === 'node')
    .map((n) => {
      const c = { latitude: n.lat, longitude: n.lon };
      const snap = snapToPolyline(c, route.coordinates, route.cumulative);
      return { id: n.id, coordinate: c, along: snap.along, limit: parseMaxspeed(n.tags?.maxspeed), offset: snap.offset };
    })
    .filter((c) => c.offset < 40)
    .map(({ offset: _offset, ...c }) => c)
    .sort((a, b) => a.along - b.along);

  return { cameras, limits };
}

export function limitAt(info: RoadInfo | null, along: number): number | null {
  if (!info) return null;
  const span = info.limits.find((s) => along >= s.from && along < s.to);
  return span?.kmh ?? null;
}
