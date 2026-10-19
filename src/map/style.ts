import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * Navigation map style on top of OpenFreeMap vector tiles (OpenMapTiles schema).
 * Uses the same tile, glyph and sprite URLs as OpenFreeMap "liberty", so offline
 * packs downloaded with LIBERTY_STYLE_URL also cover this style.
 */
export const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const TILES_URL = 'https://tiles.openfreemap.org/planet';
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const SPRITE_URL = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';

export type MapPalette = {
  background: string;
  residential: string;
  industrial: string;
  park: string;
  wood: string;
  water: string;
  waterLabel: string;
  building: string;
  buildingOutline: string;
  buildingTop: string;
  roadMinor: string;
  roadMinorCasing: string;
  roadMajor: string;
  roadMajorCasing: string;
  motorway: string;
  motorwayCasing: string;
  service: string;
  path: string;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
  roadLabel: string;
  houseNumber: string;
  placeMajor: string;
  poiLabel: string;
};

/** Night: deep navy like big navigator apps, roads clearly lighter than blocks. */
export const NIGHT: MapPalette = {
  background: '#1B2130',
  residential: '#1E2433',
  industrial: '#202637',
  park: '#1C3A2E',
  wood: '#1A3529',
  water: '#123A66',
  waterLabel: '#6F9CCB',
  building: '#283043',
  buildingOutline: '#2F384D',
  buildingTop: '#2C3448',
  roadMinor: '#4A556B',
  roadMinorCasing: '#252C3C',
  roadMajor: '#6A7690',
  roadMajorCasing: '#2A3142',
  motorway: '#7A6A45',
  motorwayCasing: '#3B3424',
  service: '#3E485D',
  path: '#3A4458',
  rail: '#3E475B',
  boundary: '#56607A',
  label: '#C9D0DD',
  labelHalo: '#1B2130',
  roadLabel: '#C2C9D6',
  houseNumber: '#7D879C',
  placeMajor: '#E9EDF4',
  poiLabel: '#9AA4B8',
};

/** Day: warm light background, white roads with grey casing, soft greens and blues. */
export const DAY: MapPalette = {
  background: '#EFEDE7',
  residential: '#EAE7E0',
  industrial: '#EAE6E0',
  park: '#D3ECC4',
  wood: '#C8E5B8',
  water: '#A3D4F5',
  waterLabel: '#3F7DB0',
  building: '#E3DFD8',
  buildingOutline: '#D4CEC5',
  buildingTop: '#EAE6E0',
  roadMinor: '#FFFFFF',
  roadMinorCasing: '#CDC5B7',
  roadMajor: '#FFFFFF',
  roadMajorCasing: '#C2B7A3',
  motorway: '#FFD98A',
  motorwayCasing: '#E0B256',
  service: '#FFFFFF',
  path: '#C9C2B6',
  rail: '#C2BDB5',
  boundary: '#A8A2B6',
  label: '#3A3F48',
  labelHalo: '#FFFFFF',
  roadLabel: '#4B515C',
  houseNumber: '#9A958C',
  placeMajor: '#1E2228',
  poiLabel: '#6A707B',
};

const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];

const MINOR = ['minor', 'track'];
const MAJOR = ['primary', 'secondary', 'tertiary', 'trunk'];

// ---- Street name abbreviations ("улица Ленина" → "ул. Ленина") ---------------

// Some MapLibre Native versions count string length/offsets in UTF-8 bytes,
// others in characters. Measure a Cyrillic letter once to stay correct on both.
const CYR_UNIT = ['length', 'ж'];

/** Expression for the length of `s` in the engine's string units (s is Cyrillic + ASCII). */
function units(s: string): unknown {
  const cyr = [...s].filter((ch) => ch > '\u007f').length;
  const ascii = [...s].length - cyr;
  return ['+', ['*', cyr, CYR_UNIT], ascii];
}

const ABBREVIATIONS: [string, string][] = [
  ['улица', 'ул.'],
  ['проспект', 'пр-т'],
  ['проезд', 'пр.'],
  ['переулок', 'пер.'],
  ['бульвар', 'б-р'],
  ['шоссе', 'ш.'],
  ['площадь', 'пл.'],
  ['набережная', 'наб.'],
  ['тупик', 'туп.'],
];

/** Russian name with the street type shortened, as navigators show it. */
function shortStreetName(): unknown {
  const name = ['coalesce', ['get', 'name:ru'], ['get', 'name'], ''];
  const cases: unknown[] = ['case'];
  for (const [full, abbr] of ABBREVIATIONS) {
    // Prefix form: "улица Ленина".
    cases.push(['==', ['index-of', `${full} `, name], 0], ['concat', `${abbr} `, ['slice', name, units(`${full} `)]]);
    // Suffix form: "Тверская улица".
    const suffix = ` ${full}`;
    cases.push(
      ['all', ['>', ['length', name], units(suffix)], ['==', ['index-of', suffix, name], ['-', ['length', name], units(suffix)]]],
      ['concat', ['slice', name, 0, ['-', ['length', name], units(suffix)]], ` ${abbr}`],
    );
  }
  cases.push(name);
  return cases;
}

const NAME = ['coalesce', ['get', 'name:ru'], ['get', 'name']];

// Width ramps by zoom: [z, px] pairs.
const w = (...stops: number[]) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops];

export function buildMapStyle(p: MapPalette, opts: { buildings3d: boolean }): StyleSpecification {
  const notTunnel = ['!', ['match', ['get', 'brunnel'], ['tunnel'], true, false]];
  const classIn = (classes: string[]) => ['match', ['get', 'class'], classes, true, false];

  const road = (id: string, classes: string[], fill: string, casing: string, fillW: number[], casingW: number[], minzoom: number) => [
    {
      id: `${id}-casing`,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom,
      filter: ['all', classIn(classes), notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': w(...casingW) },
    },
    {
      id,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom,
      filter: ['all', classIn(classes), notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': fill, 'line-width': w(...fillW) },
    },
  ];

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': p.background } },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      filter: classIn(['residential', 'suburb', 'neighbourhood']),
      paint: { 'fill-color': p.residential },
    },
    {
      id: 'landuse-industrial',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      filter: classIn(['industrial', 'commercial', 'retail', 'railway', 'garages']),
      paint: { 'fill-color': p.industrial },
    },
    { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: classIn(['wood', 'forest']), paint: { 'fill-color': p.wood } },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: classIn(['grass', 'farmland', 'wetland', 'scrub']),
      paint: { 'fill-color': p.park, 'fill-opacity': 0.8 },
    },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': p.water, 'line-width': w(10, 0.6, 18, 7) } },
    {
      id: 'building-flat',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': p.building, 'fill-outline-color': p.buildingOutline, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1] },
    },
    {
      id: 'tunnel',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', ['==', ['get', 'brunnel'], 'tunnel'], classIn([...MINOR, ...MAJOR, 'motorway'])],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': p.roadMinorCasing, 'line-opacity': 0.6, 'line-dasharray': [1.2, 0.8], 'line-width': w(13, 1.5, 18, 12) },
    },
    {
      id: 'path',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 15,
      filter: classIn(['path', 'pedestrian']),
      paint: { 'line-color': p.path, 'line-width': w(15, 0.8, 18, 2.2), 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: classIn(['rail', 'transit']),
      paint: { 'line-color': p.rail, 'line-width': w(11, 0.7, 18, 2.5) },
    },
    ...road('road-service', ['service'], p.service, p.roadMinorCasing, [14, 0.8, 16, 3, 18, 9], [14, 1.4, 16, 4.4, 18, 11], 14),
    ...road('road-minor', MINOR, p.roadMinor, p.roadMinorCasing, [12, 0.8, 14, 2.6, 16, 6.5, 18, 17], [12, 1.4, 14, 3.8, 16, 8.5, 18, 20], 11),
    ...road('road-major', MAJOR, p.roadMajor, p.roadMajorCasing, [7, 0.8, 12, 3, 14, 6, 16, 11, 18, 26], [7, 1.2, 12, 4.4, 14, 8, 16, 14, 18, 30], 7),
    ...road('road-motorway', ['motorway'], p.motorway, p.motorwayCasing, [5, 1, 12, 3.6, 14, 7, 16, 12, 18, 28], [5, 1.5, 12, 5, 14, 9.5, 16, 15.5, 18, 32], 5),
    {
      id: 'boundary',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 4],
      paint: { 'line-color': p.boundary, 'line-dasharray': [3, 2], 'line-width': 1 },
    },
    ...(opts.buildings3d
      ? [
          {
            // Low, soft extrusion: gives depth without hiding the streets.
            id: 'building-3d',
            type: 'fill-extrusion',
            source: 'omt',
            'source-layer': 'building',
            minzoom: 15,
            paint: {
              'fill-extrusion-color': p.buildingTop,
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, ['*', 0.45, ['coalesce', ['get', 'render_height'], 8]]],
              'fill-extrusion-base': ['*', 0.45, ['coalesce', ['get', 'render_min_height'], 0]],
              'fill-extrusion-opacity': 0.55,
            },
          },
        ]
      : []),
    {
      id: 'water-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-size': 13, 'text-letter-spacing': 0.05 },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 },
    },
    {
      id: 'waterway-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 13,
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': REGULAR, 'text-size': 12, 'text-pitch-alignment': 'viewport' },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 },
    },
    {
      id: 'housenumber',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'housenumber',
      minzoom: 16,
      layout: { 'text-field': ['get', 'housenumber'], 'text-font': REGULAR, 'text-size': 11, 'text-padding': 4 },
      paint: { 'text-color': p.houseNumber, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: classIn([...MINOR, ...MAJOR, 'motorway', 'service']),
      layout: {
        'symbol-placement': 'line',
        'text-field': shortStreetName(),
        'text-font': REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 16, 13, 18, 15],
        'text-max-angle': 50,
        'symbol-spacing': 220,
        'text-padding': 2,
        'text-pitch-alignment': 'viewport',
        'text-rotation-alignment': 'map',
      },
      paint: { 'text-color': p.roadLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.6 },
    },
    {
      id: 'poi',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'poi',
      minzoom: 14.5,
      filter: ['<=', ['get', 'rank'], 20],
      layout: {
        'icon-image': ['coalesce', ['image', ['get', 'subclass']], ['image', ['get', 'class']]],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14.5, 0.85, 18, 1.15],
        'text-field': NAME,
        'text-font': REGULAR,
        'text-size': 11.5,
        'text-offset': [0, 1.15],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
        'text-pitch-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': p.poiLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.3 },
    },
    {
      id: 'place-minor',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: classIn(['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet']),
      minzoom: 11,
      layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 8 },
      paint: { 'text-color': p.label, 'text-opacity': 0.65, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-major',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: classIn(['city', 'town']),
      layout: { 'text-field': NAME, 'text-font': BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 12, 12, 18] },
      paint: { 'text-color': p.placeMajor, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.6 },
    },
  ];

  return {
    version: 8,
    name: 'Navigator',
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: { omt: { type: 'vector', url: TILES_URL } },
    layers: layers as unknown as StyleSpecification['layers'],
  };
}
