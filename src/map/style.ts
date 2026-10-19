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
  water: string;
  waterLabel: string;
  park: string;
  wood: string;
  residential: string;
  industrial: string;
  building: string;
  buildingTop: string;
  roadMinor: string;
  roadMinorCasing: string;
  roadMajor: string;
  roadMajorCasing: string;
  motorway: string;
  motorwayCasing: string;
  path: string;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
  roadLabel: string;
  placeMajor: string;
  poi: string;
};

export const NIGHT: MapPalette = {
  background: '#11141A',
  water: '#0B2235',
  waterLabel: '#4D7FA3',
  park: '#13261C',
  wood: '#122319',
  residential: '#151920',
  industrial: '#181A21',
  building: '#1D222B',
  buildingTop: '#262C37',
  roadMinor: '#2A303B',
  roadMinorCasing: '#1A1F27',
  roadMajor: '#3B4351',
  roadMajorCasing: '#20252E',
  motorway: '#5A4A2E',
  motorwayCasing: '#2C2416',
  path: '#2F3540',
  rail: '#2E3440',
  boundary: '#4A4F5C',
  label: '#C9CED8',
  labelHalo: '#11141A',
  roadLabel: '#9AA2B1',
  placeMajor: '#E8EBF0',
  poi: '#8A93A3',
};

export const DAY: MapPalette = {
  background: '#F2F0EB',
  water: '#A9D3F0',
  waterLabel: '#3D7BAA',
  park: '#CFE8C8',
  wood: '#C3E0BA',
  residential: '#ECEAE4',
  industrial: '#E6E2DC',
  building: '#DCD8D1',
  buildingTop: '#E7E3DC',
  roadMinor: '#FFFFFF',
  roadMinorCasing: '#D8D4CC',
  roadMajor: '#FFE9A8',
  roadMajorCasing: '#E0C783',
  motorway: '#FFC870',
  motorwayCasing: '#D69A3C',
  path: '#C8C2B8',
  rail: '#BDB8B0',
  boundary: '#A9A3B5',
  label: '#3B3F47',
  labelHalo: '#FFFFFF',
  roadLabel: '#5B606A',
  placeMajor: '#1F2228',
  poi: '#6B7280',
};

const NAME = ['coalesce', ['get', 'name:ru'], ['get', 'name']];
const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];

const MINOR = ['minor', 'service', 'track'];
const MAJOR = ['primary', 'secondary', 'tertiary', 'trunk'];

// Width ramps by zoom: [z, px] pairs for casing and fill.
const w = (...stops: number[]) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];

export function buildMapStyle(p: MapPalette, opts: { buildings3d: boolean }): StyleSpecification {
  const roadFilter = (classes: string[], brunnel?: 'tunnel' | 'bridge') =>
    [
      'all',
      ['match', ['get', 'class'], classes, true, false],
      brunnel ? ['==', ['get', 'brunnel'], brunnel] : ['!', ['match', ['get', 'brunnel'], ['tunnel'], true, false]],
    ] as unknown as never;

  const roadPair = (id: string, classes: string[], fill: string, casing: string, fillW: number[], casingW: number[], minzoom = 0) => [
    {
      id: `${id}-casing`,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom,
      filter: roadFilter(classes),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': w(...casingW) },
    },
    {
      id,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom,
      filter: roadFilter(classes),
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
      filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood'], true, false],
      paint: { 'fill-color': p.residential },
    },
    {
      id: 'landuse-industrial',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['industrial', 'commercial', 'retail', 'railway'], true, false],
      paint: { 'fill-color': p.industrial },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['wood', 'forest'], true, false],
      paint: { 'fill-color': p.wood },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'farmland', 'wetland'], true, false],
      paint: { 'fill-color': p.park, 'fill-opacity': 0.7 },
    },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      paint: { 'line-color': p.water, 'line-width': w(10, 0.5, 18, 6) },
    },
    {
      id: 'tunnel',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ['==', ['get', 'brunnel'], 'tunnel'], ['match', ['get', 'class'], [...MINOR, ...MAJOR, 'motorway'], true, false]],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': p.roadMinor, 'line-opacity': 0.5, 'line-dasharray': [1.5, 1], 'line-width': w(12, 1, 18, 10) },
    },
    {
      id: 'path',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['match', ['get', 'class'], ['path', 'pedestrian'], true, false],
      paint: { 'line-color': p.path, 'line-width': w(14, 0.6, 18, 2.5), 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false],
      paint: { 'line-color': p.rail, 'line-width': w(11, 0.6, 18, 2) },
    },
    ...roadPair('road-minor', MINOR, p.roadMinor, p.roadMinorCasing, [12, 0.5, 14, 2.5, 18, 14], [12, 1, 14, 3.5, 18, 17], 11),
    ...roadPair('road-major', MAJOR, p.roadMajor, p.roadMajorCasing, [6, 0.6, 12, 2.5, 14, 5, 18, 22], [6, 1, 12, 3.5, 14, 7, 18, 26], 6),
    ...roadPair('road-motorway', ['motorway'], p.motorway, p.motorwayCasing, [5, 0.8, 12, 3, 14, 6, 18, 26], [5, 1.2, 12, 4.5, 14, 8, 18, 30], 5),
    {
      id: 'boundary',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 4],
      paint: { 'line-color': p.boundary, 'line-dasharray': [3, 2], 'line-width': 1 },
    },
    {
      id: 'building',
      type: opts.buildings3d ? 'fill-extrusion' : 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: opts.buildings3d
        ? {
            'fill-extrusion-color': p.building,
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['get', 'render_height']],
            'fill-extrusion-base': ['get', 'render_min_height'],
            'fill-extrusion-opacity': 0.85,
          }
        : { 'fill-color': p.building, 'fill-outline-color': p.buildingTop },
    },
    {
      id: 'water-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-size': 13, 'symbol-placement': 'point' },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['match', ['get', 'class'], [...MINOR, ...MAJOR, 'motorway'], true, false],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 14],
        'text-max-angle': 30,
        'symbol-spacing': 350,
      },
      paint: { 'text-color': p.roadLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.4 },
    },
    {
      id: 'housenumber',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'housenumber',
      minzoom: 17,
      layout: { 'text-field': ['get', 'housenumber'], 'text-font': REGULAR, 'text-size': 10 },
      paint: { 'text-color': p.poi, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 },
    },
    {
      id: 'poi',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'poi',
      minzoom: 15,
      filter: ['<=', ['get', 'rank'], 14],
      layout: {
        'icon-image': ['coalesce', ['image', ['get', 'subclass']], ['image', ['get', 'class']]],
        'icon-size': 0.8,
        'text-field': NAME,
        'text-font': REGULAR,
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
      },
      paint: { 'text-color': p.poi, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2, 'icon-opacity': 0.85 },
    },
    {
      id: 'place-minor',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet'], true, false],
      minzoom: 11,
      layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 },
      paint: { 'text-color': p.label, 'text-opacity': 0.7, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-major',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
      layout: {
        'text-field': NAME,
        'text-font': BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 12, 12, 18],
      },
      paint: { 'text-color': p.placeMajor, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5 },
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
