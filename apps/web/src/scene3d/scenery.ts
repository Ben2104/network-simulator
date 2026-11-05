import westcoast from './westcoast.json';
import { distanceToLine, inLotArea, inRing, rng, toWorld, type Vec2, type World } from './world';

/**
 * Pure scenery layout: land biomes, mountain ranges, lakes and vegetation. No three.js imports, so
 * placement is unit-tested without WebGL. Everything is decorative and approximate (real regions,
 * hand-placed); BFS ignores terrain. Nothing may cover a road, station or parking lot.
 */

type Ring = number[][];
interface Feature {
  properties: { name: string; postal: string };
  geometry:
    { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

export const features = (westcoast as { features: Feature[] }).features;
export type { Feature, Ring };
export const polygons = (f: Feature): Ring[][] =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

/** States the network runs through (the east corridor crosses Nevada and Idaho). */
export const NETWORK_STATES = new Set(['CA', 'OR', 'WA', 'NV', 'ID']);

/** Outer rings of every state on the map, for "is this on land" checks. */
const landRings: Ring[] = features.flatMap((f) => polygons(f).map((r) => r[0]!));
export const onLand = (lat: number, lon: number) =>
  landRings.some((ring) => inRing(lon, lat, ring));

/** Geographic extent of the land data (see scripts/build-westcoast.mjs BBOX). */
export const LAND_BOUNDS = { minLat: 30, maxLat: 48, minLon: -127, maxLon: -104 } as const;

// ---------------------------------------------------------------------------------------------
// Noise

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------------------------------------
// Biomes

export type Biome =
  | 'forest'
  | 'coast'
  | 'chaparral'
  | 'valley'
  | 'desert'
  | 'basin'
  | 'steppe'
  | 'alpine'
  | 'redrock';

/** Pale tints so labels and the route stay the strongest marks on the map (light theme). */
export const BIOME_COLOR: Record<Biome, string> = {
  forest: '#d3e6d0',
  coast: '#dfeedb',
  chaparral: '#e7e8cf',
  valley: '#e6ebc4',
  desert: '#efe3c8',
  basin: '#e6e2cb',
  steppe: '#e0e4c9',
  alpine: '#dbe3db',
  redrock: '#ecd6bf',
};

/** Longitude of the Sierra Nevada / Cascade crest at `lat` (approximate). */
function crestLon(lat: number): number {
  if (lat < 35.5) return -118.6;
  if (lat < 40) return -118.3 - ((lat - 35.5) / 4.5) * 2.4; // −118.3 at 35.5° → −120.7 at 40°
  return -121.6;
}

/** Centre line of California's Central Valley, Bakersfield → Redding. */
function valleyCenterLon(lat: number): number {
  return -119.1 - ((lat - 35) / 5.6) * 3.1;
}

/** Rough biome for a land point. Noise jitters every boundary so none of them look ruled. */
export function biomeAt(lat: number, lon: number): Biome {
  const j = (noise2(lon * 1.7, lat * 1.7) - 0.5) * 0.7;
  const la = lat + j;
  const lo = lon - j;
  const crest = crestLon(la);

  if (lo > -107.4 && la > 36.8 && la < 41.5) return 'forest'; // Colorado Rockies
  if (lo > -112.3 && la < 41.8) return 'redrock';
  if (la >= 35 && la <= 40.6 && Math.abs(lo - valleyCenterLon(la)) < 0.55) return 'valley';
  if (Math.abs(lo - crest) < 0.35 && la > 36 && la < 46.8) return 'alpine';
  if (lo < crest) {
    // West of the crest: wet forest in the north, coast scrub and chaparral in the south.
    if (la > 39.5) return 'forest';
    if (lo < valleyCenterLon(la) - 0.9) return la > 36.5 ? 'coast' : 'chaparral';
    return la < 35.8 ? 'chaparral' : 'coast';
  }
  // East of the crest.
  if (la < 36.4 && lo > -118.4) return 'desert';
  if (la > 44.7 && lo > -116.6) return 'forest'; // Idaho and Montana Rockies
  if (la > 42) return 'steppe'; // high desert of eastern Oregon and southern Idaho
  return 'basin'; // Great Basin
}

// ---------------------------------------------------------------------------------------------
// Mountains

export interface Peak extends Vec2 {
  h: number;
  /** Base radius across the range; `stretch` lengthens it along the range. */
  r: number;
  stretch: number;
  /** Yaw so stretched peaks line up with their range. */
  yaw: number;
  snow: boolean;
  color: string;
}

interface Range {
  from: [number, number];
  to: [number, number];
  n: number;
  h: number;
  r: number;
  snow?: boolean;
  color?: string;
}

const ROCK = '#8b9a8f';
const DESERT_ROCK = '#b59f84';
const RED_ROCK = '#bd8a68';
const GREEN_HILL = '#8fae8e';

/** Single volcanoes and high peaks (Cascades, Sierra, Rockies). */
const VOLCANOES: { lat: number; lon: number; h: number; r: number }[] = [
  { lat: 41.41, lon: -122.19, h: 26, r: 13 }, // Shasta
  { lat: 40.49, lon: -121.51, h: 16, r: 10 }, // Lassen
  { lat: 45.37, lon: -121.7, h: 24, r: 11 }, // Hood
  { lat: 44.67, lon: -121.8, h: 18, r: 9 }, // Jefferson
  { lat: 44.1, lon: -121.77, h: 17, r: 10 }, // Three Sisters
  { lat: 46.2, lon: -122.19, h: 16, r: 10 }, // St Helens
  { lat: 46.2, lon: -121.49, h: 20, r: 10 }, // Adams
  { lat: 46.85, lon: -121.76, h: 28, r: 14 }, // Rainier
  { lat: 36.58, lon: -118.29, h: 22, r: 12 }, // Whitney
  { lat: 42.9, lon: -122.1, h: 14, r: 9 }, // Mazama (Crater Lake rim)
  { lat: 43.74, lon: -110.8, h: 22, r: 10 }, // Grand Teton
];

/** Ranges as a line of peaks, approximate. */
const RANGES: Range[] = [
  { from: [35.9, -118.4], to: [39.6, -120.5], n: 12, h: 18, r: 11, snow: true }, // Sierra Nevada
  { from: [35.6, -120.7], to: [39.8, -123.2], n: 10, h: 8, r: 8, color: GREEN_HILL }, // Coast Ranges
  { from: [40.9, -123.3], to: [42.6, -123.6], n: 5, h: 10, r: 8, color: GREEN_HILL }, // Klamath
  { from: [43.0, -123.8], to: [46.0, -123.6], n: 6, h: 7, r: 7, color: GREEN_HILL }, // Oregon Coast
  { from: [47.6, -123.9], to: [47.9, -123.3], n: 3, h: 14, r: 9, snow: true }, // Olympics
  { from: [47.2, -121.4], to: [47.95, -121.1], n: 3, h: 15, r: 9, snow: true }, // North Cascades
  { from: [34.35, -118.3], to: [34.15, -116.9], n: 5, h: 11, r: 8, color: DESERT_ROCK }, // Transverse
  { from: [33.4, -116.7], to: [32.8, -116.4], n: 3, h: 8, r: 7, color: DESERT_ROCK }, // Peninsular
  { from: [35.95, -115.75], to: [36.45, -115.6], n: 2, h: 12, r: 8, color: DESERT_ROCK }, // Spring Mts
  // Basin and Range: long north–south ridges across Nevada.
  { from: [38.8, -118.2], to: [40.4, -118.0], n: 4, h: 10, r: 7, color: DESERT_ROCK },
  { from: [38.5, -117.0], to: [40.3, -116.9], n: 4, h: 11, r: 7, color: DESERT_ROCK },
  { from: [38.8, -116.0], to: [40.6, -116.1], n: 4, h: 10, r: 7, color: DESERT_ROCK },
  { from: [40.0, -115.45], to: [41.1, -115.2], n: 3, h: 15, r: 8, snow: true, color: DESERT_ROCK }, // Ruby
  { from: [38.2, -114.6], to: [39.9, -114.5], n: 4, h: 13, r: 8, color: DESERT_ROCK }, // Snake Range
  { from: [36.8, -116.8], to: [37.9, -116.6], n: 3, h: 9, r: 7, color: DESERT_ROCK },
  { from: [41.3, -117.6], to: [41.9, -117.3], n: 2, h: 10, r: 7, color: DESERT_ROCK }, // Santa Rosa
  { from: [42.4, -118.9], to: [42.9, -118.6], n: 2, h: 11, r: 8, snow: true, color: DESERT_ROCK }, // Steens
  { from: [44.6, -118.7], to: [45.6, -117.9], n: 4, h: 10, r: 8, color: GREEN_HILL }, // Blue Mts
  { from: [45.05, -117.45], to: [45.35, -117.1], n: 2, h: 13, r: 8, snow: true }, // Wallowas
  { from: [43.8, -115.05], to: [44.4, -114.9], n: 3, h: 17, r: 8, snow: true }, // Sawtooth
  { from: [44.6, -115.6], to: [46.5, -115.2], n: 6, h: 13, r: 9 }, // Central Idaho
  { from: [45.5, -114.5], to: [46.9, -114.3], n: 4, h: 14, r: 8, snow: true }, // Bitterroot
  { from: [46.5, -113.4], to: [47.9, -113.6], n: 4, h: 15, r: 9, snow: true }, // Montana Rockies
  { from: [40.2, -111.65], to: [41.8, -111.75], n: 4, h: 16, r: 8, snow: true }, // Wasatch
  { from: [40.75, -110.9], to: [40.75, -109.9], n: 3, h: 15, r: 8, snow: true }, // Uintas
  { from: [37.4, -112.3], to: [38.4, -111.5], n: 3, h: 9, r: 8, color: RED_ROCK }, // Plateaus
  { from: [36.2, -113.6], to: [35.4, -112.4], n: 3, h: 6, r: 9, color: RED_ROCK }, // Grand Canyon rim
  { from: [33.6, -112.2], to: [34.6, -111.6], n: 3, h: 8, r: 8, color: DESERT_ROCK }, // Arizona
  { from: [37.3, -106.6], to: [40.6, -105.7], n: 6, h: 18, r: 9, snow: true }, // Colorado Front
  { from: [37.6, -108.0], to: [38.1, -107.2], n: 3, h: 16, r: 9, snow: true }, // San Juans
  { from: [41.0, -107.6], to: [42.9, -109.4], n: 4, h: 13, r: 8, snow: true }, // Wind River
  { from: [44.2, -107.4], to: [45.0, -107.0], n: 2, h: 13, r: 8 }, // Bighorns
  { from: [35.3, -106.6], to: [36.4, -105.7], n: 3, h: 12, r: 8, color: DESERT_ROCK }, // Sangre
  { from: [30.4, -108.6], to: [31.6, -109.3], n: 3, h: 11, r: 9, color: DESERT_ROCK }, // Sierra Madre
  { from: [30.6, -115.6], to: [32.2, -116.1], n: 3, h: 9, r: 7, color: DESERT_ROCK }, // Baja
];

const roadBoxes = new WeakMap<
  World,
  { line: Vec2[]; x0: number; x1: number; z0: number; z1: number }[]
>();

/** True if nothing on the network (roads, stations, lots) is within `margin` of `p`. */
export function clearOfNetwork(p: Vec2, world: World, margin: number): boolean {
  let boxes = roadBoxes.get(world);
  if (!boxes) {
    boxes = [...world.roads.values()].map((line) => ({
      line,
      x0: Math.min(...line.map((q) => q.x)),
      x1: Math.max(...line.map((q) => q.x)),
      z0: Math.min(...line.map((q) => q.z)),
      z1: Math.max(...line.map((q) => q.z)),
    }));
    roadBoxes.set(world, boxes);
  }
  for (const b of boxes) {
    if (p.x < b.x0 - margin || p.x > b.x1 + margin || p.z < b.z0 - margin || p.z > b.z1 + margin)
      continue;
    if (distanceToLine(p, b.line) < margin) return false;
  }
  for (const s of world.pos.values())
    if (Math.hypot(p.x - s.x, p.z - s.z) < margin + 4) return false;
  if (inLotArea(p, world.client, margin) || inLotArea(p, world.server, margin)) return false;
  return true;
}

/** Every peak that keeps clear of the network: volcanoes plus ranges, deterministic jitter. */
export function placePeaks(world: World): Peak[] {
  const rand = rng(1859);
  const out: Peak[] = [];
  for (const v of VOLCANOES) {
    out.push({
      ...toWorld(v.lat, v.lon),
      h: v.h,
      r: v.r,
      stretch: 1,
      yaw: rand() * Math.PI,
      snow: true,
      color: ROCK,
    });
  }
  for (const range of RANGES) {
    const a = toWorld(...range.from);
    const b = toWorld(...range.to);
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (let i = 0; i < range.n; i++) {
      const f = range.n === 1 ? 0.5 : i / (range.n - 1);
      const k = 0.75 + rand() * 0.5;
      out.push({
        x: a.x + (b.x - a.x) * f + (rand() - 0.5) * range.r * 0.8,
        z: a.z + (b.z - a.z) * f + (rand() - 0.5) * range.r * 0.8,
        h: range.h * k,
        r: range.r * (0.8 + rand() * 0.4),
        stretch: 1.3 + rand() * 0.6,
        yaw,
        snow: (range.snow ?? false) && k > 0.85,
        color: range.color ?? ROCK,
      });
    }
  }
  return out.filter((p) => clearOfNetwork(p, world, p.r * Math.max(1, p.stretch * 0.75) + 2));
}

// ---------------------------------------------------------------------------------------------
// Lakes

export interface Lake extends Vec2 {
  rx: number;
  rz: number;
  yaw: number;
}

const LAKES: { lat: number; lon: number; rx: number; rz: number; yaw?: number }[] = [
  { lat: 39.09, lon: -120.04, rx: 2.2, rz: 4 }, // Tahoe
  { lat: 40.0, lon: -119.55, rx: 1.8, rz: 4.2, yaw: 0.3 }, // Pyramid
  { lat: 38.0, lon: -119.0, rx: 2.4, rz: 2 }, // Mono
  { lat: 36.15, lon: -114.45, rx: 5, rz: 2, yaw: -0.3 }, // Mead
  { lat: 33.3, lon: -115.85, rx: 3, rz: 6, yaw: 0.6 }, // Salton Sea
  { lat: 42.94, lon: -122.1, rx: 1.8, rz: 1.8 }, // Crater
  { lat: 42.4, lon: -121.88, rx: 2, rz: 4.5, yaw: 0.2 }, // Upper Klamath
  { lat: 39.1, lon: -122.8, rx: 1.6, rz: 3.2, yaw: 0.5 }, // Clear Lake
  { lat: 41.1, lon: -112.55, rx: 12, rz: 18, yaw: 0.25 }, // Great Salt Lake
  { lat: 40.2, lon: -111.75, rx: 2.5, rz: 3.5 }, // Utah Lake
  { lat: 43.3, lon: -118.8, rx: 3, rz: 1.6 }, // Malheur
  { lat: 47.6, lon: -116.75, rx: 1.6, rz: 4 }, // Coeur d'Alene
  { lat: 43.0, lon: -111.4, rx: 2, rz: 3.2 }, // Palisades
  { lat: 44.45, lon: -110.4, rx: 5, rz: 5 }, // Yellowstone
];

/** Lakes that keep clear of the network. */
export function placeLakes(world: World): Lake[] {
  return LAKES.map((l) => ({
    ...toWorld(l.lat, l.lon),
    rx: l.rx,
    rz: l.rz,
    yaw: l.yaw ?? 0,
  })).filter((l) => clearOfNetwork(l, world, Math.max(l.rx, l.rz) + 2));
}

// ---------------------------------------------------------------------------------------------
// Vegetation and rocks

export type PropKind = 'pine' | 'broadleaf' | 'shrub' | 'cactus' | 'rock';

export interface Prop extends Vec2 {
  kind: PropKind;
  /** Uniform scale. */
  s: number;
  /** Yaw. */
  r: number;
  /** 0–1 colour variation; renderers mix two shades with it. */
  tint: number;
}

/** Chance a sample spawns each prop kind, per biome. Missing kinds never spawn there. */
const MIX: Record<Biome, Partial<Record<PropKind, number>>> = {
  forest: { pine: 0.75, broadleaf: 0.12 },
  alpine: { pine: 0.55, rock: 0.12 },
  coast: { broadleaf: 0.3, pine: 0.12, shrub: 0.12 },
  chaparral: { shrub: 0.35, broadleaf: 0.08, rock: 0.04 },
  valley: { broadleaf: 0.06 },
  desert: { shrub: 0.18, cactus: 0.1, rock: 0.07 },
  basin: { shrub: 0.34, rock: 0.05, pine: 0.05 }, // pinyon-juniper on the ranges
  steppe: { shrub: 0.35, pine: 0.05, rock: 0.03 },
  redrock: { rock: 0.12, shrub: 0.12, pine: 0.03 },
};

const SCALE: Record<PropKind, [number, number]> = {
  pine: [0.7, 1.6],
  broadleaf: [0.7, 1.4],
  shrub: [0.8, 1.6],
  cactus: [0.7, 1.3],
  rock: [0.6, 1.8],
};

/**
 * Deterministic scatter of `samples` candidate points over the land. Each candidate spawns at
 * most one prop, chosen from its biome's mix; network states are denser than the context states
 * around them. Props stay off roads, stations and lots, and out of lakes.
 */
export function scatterProps(world: World, lakes: readonly Lake[], samples = 24000): Prop[] {
  const rand = rng(39);
  const out: Prop[] = [];
  const { minLat, maxLat, minLon, maxLon } = LAND_BOUNDS;
  const networkRings = features
    .filter((f) => NETWORK_STATES.has(f.properties.postal))
    .flatMap((f) => polygons(f).map((r) => r[0]!));
  for (let i = 0; i < samples; i++) {
    const lat = minLat + rand() * (maxLat - minLat);
    const lon = minLon + rand() * (maxLon - minLon);
    const roll = rand();
    const pick = rand();
    const sizeRoll = rand();
    const yaw = rand() * Math.PI * 2;
    const tint = rand();
    const inNetwork = networkRings.some((ring) => inRing(lon, lat, ring));
    if (!inNetwork && (roll > 0.45 || !onLand(lat, lon))) continue;
    // Clumps: noise thins props into groves and open ground instead of an even sprinkle.
    if (noise2(lon * 4, lat * 4) < 0.35 * (pick + 0.5)) continue;
    const mix = MIX[biomeAt(lat, lon)];
    let acc = 0;
    let kind: PropKind | null = null;
    for (const [k, chance] of Object.entries(mix) as [PropKind, number][]) {
      acc += chance;
      if (pick < acc) {
        kind = k;
        break;
      }
    }
    if (!kind) continue;
    const p = toWorld(lat, lon);
    if (lakes.some((l) => Math.hypot(p.x - l.x, p.z - l.z) < Math.max(l.rx, l.rz) + 1)) continue;
    if (!clearOfNetwork(p, world, kind === 'rock' || kind === 'shrub' ? 2.2 : 3)) continue;
    const [lo, hi] = SCALE[kind];
    out.push({ ...p, kind, s: lo + sizeRoll * (hi - lo), r: yaw, tint });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Ground texture

/**
 * RGB of the ground at a land point: biome tint, broken up by low-frequency noise, with crop
 * fields in the Central Valley. Used to paint the land texture once at start-up.
 */
export function groundRgb(lat: number, lon: number): [number, number, number] {
  const biome = biomeAt(lat, lon);
  const hex = BIOME_COLOR[biome];
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const n = (noise2(lon * 6, lat * 6) - 0.5) * 14 + (noise2(lon * 22, lat * 22) - 0.5) * 6;
  if (biome === 'valley') {
    // Fields: a grid of plots aligned with the valley, each a shade of green or gold.
    const fx = Math.floor((lon + lat * 0.45) * 26);
    const fy = Math.floor((lat - lon * 0.2) * 30);
    const k = hash2(fx, fy);
    if (k < 0.33) [r, g, b] = [214, 230, 186];
    else if (k < 0.55) [r, g, b] = [236, 228, 182];
    else if (k < 0.7) [r, g, b] = [222, 232, 200];
  }
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + n)));
  return [c(r), c(g), c(b)];
}
