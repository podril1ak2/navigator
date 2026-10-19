import { distance, type LatLng } from './geo';
import { NetworkError, searchPlaces, reverseGeocode, type Place } from './api';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
const MAPILLARY = 'https://graph.mapillary.com/images';
const HEADERS = { 'User-Agent': 'iPhoneLab-Navigator/1.0', 'Accept-Language': 'ru' };

/** Free Mapillary client token (https://www.mapillary.com/dashboard/developers). Optional. */
const MAPILLARY_TOKEN = process.env.EXPO_PUBLIC_MAPILLARY_TOKEN ?? '';

/** `brand` photos show the chain in general, not this exact place — the UI labels them so. */
export type Photo = { url: string; source: 'Wikimedia Commons' | 'Mapillary' | 'OpenStreetMap'; kind: 'photo' | 'street' | 'brand' | 'logo' };

export type SocialLink = { kind: 'vk' | 'telegram' | 'ok' | 'instagram' | 'facebook' | 'youtube' | 'whatsapp'; url: string };

export type PlaceDetails = {
  brand?: string;
  operator?: string;
  address?: string;
  openingHours?: string;
  phones: string[];
  website?: string;
  email?: string;
  social: SocialLink[];
  /** Short human-readable features: "Оплата картой", "Wi‑Fi", "АИ-95"… */
  features: string[];
  cuisine?: string;
  description?: string;
  wikidata?: string;
  brandWikidata?: string;
  image?: string;
  commons?: string;
};

type NominatimLookup = {
  extratags?: Record<string, string>;
  address?: Record<string, string>;
  namedetails?: Record<string, string>;
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new NetworkError('Нет соединения с сервером');
  }
  if (!res.ok) throw new NetworkError(`Сервер ответил ${res.status}`);
  return (await res.json()) as T;
}

const CUISINE_RU: Record<string, string> = {
  coffee_shop: 'кофейня',
  italian: 'итальянская',
  japanese: 'японская',
  sushi: 'суши',
  pizza: 'пицца',
  burger: 'бургеры',
  russian: 'русская',
  georgian: 'грузинская',
  uzbek: 'узбекская',
  asian: 'азиатская',
  chinese: 'китайская',
  french: 'французская',
  american: 'американская',
  shawarma: 'шаурма',
  kebab: 'кебаб',
  regional: 'региональная',
  international: 'интернациональная',
  vegetarian: 'вегетарианская',
  bakery: 'выпечка',
  ice_cream: 'мороженое',
  chicken: 'курица',
  seafood: 'морепродукты',
};

const FUEL_RU: [string, string][] = [
  ['fuel:octane_92', 'АИ-92'],
  ['fuel:octane_95', 'АИ-95'],
  ['fuel:octane_98', 'АИ-98'],
  ['fuel:octane_100', 'АИ-100'],
  ['fuel:diesel', 'ДТ'],
  ['fuel:lpg', 'Газ (пропан)'],
  ['fuel:cng', 'Метан'],
];

const SOCIAL_KEYS: [string, SocialLink['kind']][] = [
  ['contact:vk', 'vk'],
  ['contact:telegram', 'telegram'],
  ['contact:ok', 'ok'],
  ['contact:instagram', 'instagram'],
  ['contact:facebook', 'facebook'],
  ['contact:youtube', 'youtube'],
  ['contact:whatsapp', 'whatsapp'],
];

const yes = (v?: string) => v === 'yes' || v === 'designated' || v === 'only';

function normalizeUrl(u: string): string {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

function socialUrl(kind: SocialLink['kind'], v: string): string {
  if (/^https?:\/\//.test(v)) return v;
  const handle = v.replace(/^@/, '');
  switch (kind) {
    case 'telegram':
      return `https://t.me/${handle}`;
    case 'vk':
      return `https://vk.com/${handle}`;
    case 'instagram':
      return `https://instagram.com/${handle}`;
    case 'whatsapp':
      return `https://wa.me/${handle.replace(/[^\d]/g, '')}`;
    default:
      return normalizeUrl(v);
  }
}

/** Extracts everything a place card can show from OSM tags. Pure, unit-testable. */
export function detailsFromTags(t: Record<string, string>, address?: Record<string, string>): PlaceDetails {
  const phones = [t.phone, t['contact:phone'], t['phone:mobile'], t['contact:mobile']]
    .filter(Boolean)
    .flatMap((p) => p!.split(';'))
    .map((p) => p.trim())
    .filter((p, i, a) => p && a.indexOf(p) === i);

  const features: string[] = [];
  const cards = yes(t['payment:cards']) || yes(t['payment:credit_cards']) || yes(t['payment:debit_cards']) || yes(t['payment:visa']) || yes(t['payment:mir']);
  if (cards) features.push('Оплата картой');
  if (yes(t['payment:sbp'])) features.push('СБП');
  if (t['payment:cash'] === 'no') features.push('Без наличных');
  if (t.internet_access === 'wlan' || t.internet_access === 'yes') features.push('Wi‑Fi');
  if (yes(t.outdoor_seating)) features.push('Летняя веранда');
  if (yes(t.takeaway)) features.push('Навынос');
  if (yes(t.delivery)) features.push('Доставка');
  if (yes(t.drive_through)) features.push('Авто-окно');
  if (t.wheelchair === 'yes') features.push('Доступно для колясок');
  if (yes(t.dispensing)) features.push('Рецептурный отдел');
  if (yes(t.air_conditioning)) features.push('Кондиционер');
  for (const [k, ru] of FUEL_RU) if (yes(t[k])) features.push(ru);
  if (yes(t.car_wash)) features.push('Мойка');
  if (yes(t.compressed_air)) features.push('Подкачка шин');

  const cuisine = t.cuisine
    ?.split(';')
    .map((c) => CUISINE_RU[c.trim()] ?? null)
    .filter(Boolean)
    .join(', ');

  const a = address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(', ');
  const city = a.city ?? a.town ?? a.village;

  const website = t.website ?? t['contact:website'] ?? t.url;
  return {
    brand: t['brand:ru'] ?? t.brand,
    operator: t.operator,
    address: [street, city].filter(Boolean).join(', ') || undefined,
    openingHours: t.opening_hours,
    phones,
    website: website ? normalizeUrl(website) : undefined,
    email: t.email ?? t['contact:email'],
    social: SOCIAL_KEYS.filter(([k]) => t[k]).map(([k, kind]) => ({ kind, url: socialUrl(kind, t[k]) })),
    features: features.filter((f, i) => features.indexOf(f) === i),
    cuisine: cuisine || undefined,
    description: t['description:ru'] ?? t.description,
    wikidata: t.wikidata,
    brandWikidata: t['brand:wikidata'],
    image: t.image,
    commons: t.wikimedia_commons,
  };
}

export async function fetchPlaceDetails(osmRef: string, signal?: AbortSignal): Promise<PlaceDetails> {
  const items = await getJson<NominatimLookup[]>(
    `${NOMINATIM}/lookup?osm_ids=${encodeURIComponent(osmRef)}&format=jsonv2&extratags=1&addressdetails=1`,
    signal,
  );
  const it = items[0];
  return detailsFromTags(it?.extratags ?? {}, it?.address);
}

const commonsUrl = (file: string, width = 800) => `${COMMONS_FILE}${encodeURIComponent(file.replace(/^File:/, ''))}?width=${width}`;

/**
 * Photos for a place from free sources: direct OSM `image`, Wikimedia Commons,
 * Wikidata (place and brand photo/logo) and, with a token, Mapillary street-level images.
 */
export async function fetchPhotos(d: PlaceDetails, at: LatLng, signal?: AbortSignal): Promise<Photo[]> {
  const photos: Photo[] = [];
  if (d.image && /^https?:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(d.image)) photos.push({ url: d.image, source: 'OpenStreetMap', kind: 'photo' });
  if (d.commons?.startsWith('File:')) photos.push({ url: commonsUrl(d.commons), source: 'Wikimedia Commons', kind: 'photo' });

  const ids = [d.wikidata, d.brandWikidata].filter((x): x is string => !!x && /^Q\d+$/.test(x));
  const tasks: Promise<void>[] = [];
  if (ids.length) {
    tasks.push(
      getJson<{ entities: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: string } } }[]> }> }>(
        `${WIKIDATA}?action=wbgetentities&ids=${ids.join('|')}&props=claims&format=json&origin=*`,
        signal,
      )
        .then((data) => {
          for (const id of ids) {
            const claims = data.entities[id]?.claims ?? {};
            const img = claims.P18?.[0]?.mainsnak?.datavalue?.value;
            const logo = claims.P154?.[0]?.mainsnak?.datavalue?.value;
            if (img) photos.push({ url: commonsUrl(img), source: 'Wikimedia Commons', kind: id === d.wikidata ? 'photo' : 'brand' });
            if (logo && id === d.brandWikidata) photos.push({ url: commonsUrl(logo, 400), source: 'Wikimedia Commons', kind: 'logo' });
          }
        })
        .catch(() => {}),
    );
  }
  if (MAPILLARY_TOKEN) {
    const dLat = 0.00035;
    const dLon = dLat / Math.cos((at.latitude * Math.PI) / 180);
    const bbox = [at.longitude - dLon, at.latitude - dLat, at.longitude + dLon, at.latitude + dLat].join(',');
    tasks.push(
      getJson<{ data: { thumb_1024_url?: string; computed_geometry?: { coordinates: [number, number] } }[] }>(
        `${MAPILLARY}?access_token=${MAPILLARY_TOKEN}&fields=thumb_1024_url,computed_geometry&bbox=${bbox}&limit=20`,
        signal,
      )
        .then((data) => {
          const near = data.data
            .filter((im) => im.thumb_1024_url && im.computed_geometry)
            .map((im) => ({ url: im.thumb_1024_url!, d: distance(at, { latitude: im.computed_geometry!.coordinates[1], longitude: im.computed_geometry!.coordinates[0] }) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 3);
          for (const im of near) photos.push({ url: im.url, source: 'Mapillary', kind: 'street' });
        })
        .catch(() => {}),
    );
  }
  await Promise.all(tasks);
  // Photos of this place first, then street-level, then the chain's photo and logo.
  const rank = { photo: 0, street: 1, brand: 2, logo: 3 } as const;
  return photos.filter((p, i) => photos.findIndex((q) => q.url === p.url) === i).sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export const hasStreetPhotos = !!MAPILLARY_TOKEN;

const POI_CLASS_RU: Record<string, string> = {
  pharmacy: 'Аптека',
  cafe: 'Кафе',
  restaurant: 'Ресторан',
  fast_food: 'Фастфуд',
  bar: 'Бар',
  beer: 'Пивной бар',
  fuel: 'АЗС',
  bank: 'Банк',
  atm: 'Банкомат',
  shop: 'Магазин',
  grocery: 'Продукты',
  supermarket: 'Супермаркет',
  convenience: 'Продукты',
  clothing_store: 'Одежда',
  hospital: 'Больница',
  doctors: 'Медицинский центр',
  dentist: 'Стоматология',
  parking: 'Парковка',
  lodging: 'Гостиница',
  museum: 'Музей',
  theatre: 'Театр',
  cinema: 'Кинотеатр',
  park: 'Парк',
  school: 'Школа',
  college: 'Колледж',
  library: 'Библиотека',
  post: 'Почта',
  police: 'Полиция',
  place_of_worship: 'Храм',
  railway: 'Станция',
  bus: 'Остановка',
  car: 'Автосервис',
  hairdresser: 'Парикмахерская',
  bakery: 'Пекарня',
  ice_cream: 'Мороженое',
  attraction: 'Достопримечательность',
  town_hall: 'Администрация',
  fitness: 'Фитнес',
  sports: 'Спорт',
  clinic: 'Поликлиника',
  veterinary: 'Ветклиника',
  kindergarten: 'Детский сад',
  mall: 'Торговый центр',
  department_store: 'Универмаг',
  marketplace: 'Рынок',
  hotel: 'Отель',
  hostel: 'Хостел',
  cosmetics: 'Косметика',
  electronics: 'Электроника',
  mobile_phone: 'Салон связи',
  florist: 'Цветы',
  optician: 'Оптика',
  books: 'Книги',
  shoes: 'Обувь',
  car_wash: 'Автомойка',
  charging_station: 'Зарядная станция',
  subway: 'Метро',
};

type LookupItem = { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; category?: string; type?: string; address?: Record<string, string> };

/**
 * OpenFreeMap (planetiler) encodes the OSM object in the vector tile feature id:
 * id = osmId * 10 + (1 node | 2 way | 3 relation).
 */
export function osmRefFromFeatureId(id: unknown): string | null {
  const n = typeof id === 'string' ? Number(id) : id;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 10) return null;
  const type = { 1: 'N', 2: 'W', 3: 'R' }[n % 10];
  return type ? `${type}${Math.floor(n / 10)}` : null;
}

/** Turns a tapped map icon (vector tile feature) into a Place for the card. */
export async function resolveMapFeature(
  feature: { id?: unknown; properties?: Record<string, unknown> | null },
  at: LatLng,
  signal?: AbortSignal,
): Promise<Place | null> {
  const props = feature.properties ?? {};
  const name = String(props['name:ru'] ?? props.name ?? '').trim();
  const category = POI_CLASS_RU[String(props.subclass ?? '')] ?? POI_CLASS_RU[String(props.class ?? '')];
  const osmRef = osmRefFromFeatureId(feature.id);

  if (osmRef) {
    const items = await getJson<LookupItem[]>(`${NOMINATIM}/lookup?osm_ids=${osmRef}&format=jsonv2&addressdetails=1`, signal).catch((e) => {
      if (e?.name === 'AbortError') throw e;
      return [] as LookupItem[];
    });
    const it = items[0];
    if (it) {
      const a = it.address ?? {};
      const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(', ');
      return {
        id: osmRef,
        osmRef,
        name: it.name || name || category || 'Без названия',
        address: [street, a.city ?? a.town ?? a.village].filter(Boolean).join(', '),
        coordinate: { latitude: Number(it.lat), longitude: Number(it.lon) },
        category,
      };
    }
  }
  if (name) {
    const found = await searchPlaces(name, at, signal).catch((e) => {
      if (e?.name === 'AbortError') throw e;
      return [] as Place[];
    });
    const best = found.map((p) => ({ p, d: distance(at, p.coordinate) })).sort((a, b) => a.d - b.d)[0];
    if (best && best.d < 150) return { ...best.p, category: best.p.category ?? category };
    return { id: osmRef ?? `poi-${at.latitude.toFixed(5)}-${at.longitude.toFixed(5)}`, osmRef: osmRef ?? undefined, name, address: '', coordinate: at, category };
  }
  const p = await reverseGeocode(at, signal).catch(() => null);
  return p ? { ...p, category: p.category ?? category } : null;
}
