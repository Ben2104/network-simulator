import { MAP_HEIGHT, MAP_WIDTH, project, type Network } from '@netsim/shared';
import type { CarPlan } from '../sim/timeline';

/**
 * Pure 3D layout: where stations, roads, lots and cars sit in world space. No three.js imports, so
 * everything here is unit-tested without WebGL. World axes: x grows east, z grows south (the shared
 * projection's y), y is up. Origin is the centre of the projected map. Unlike the 2D view, 3D keeps
 * true geography (no rotation, no Los Angeles spread); the camera does the framing instead.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Pose extends Vec2 {
  /** Yaw in radians around +y; 0 faces +x (east). */
  heading: number;
  status: 'waiting' | 'driving' | 'arrived';
}

export function toWorld(lat: number, lon: number): Vec2 {
  const p = project(lat, lon);
  return { x: p.x - MAP_WIDTH / 2, z: p.y - MAP_HEIGHT / 2 };
}

export const ROAD_WIDTH = 1.6;
/** Cars drive this far right of the road centre line. */
export const LANE_OFFSET = 0.4;
/** Sideways bow of a road as a fraction of its length ("slightly arched"). */
const ROAD_BOW = 0.05;

/** Parking lot: one central aisle running east from the gate, a row of slots either side. */
export const LOT = {
  slotsPerRow: 12,
  slotPitch: 1.7,
  /** Gap between the gate (the station position) and the first slot. */
  entry: 3,
  /** Distance from the aisle centre line to a slot centre. */
  rowOffset: 2.6,
} as const;
export const LOT_LENGTH = LOT.entry + LOT.slotsPerRow * LOT.slotPitch + 1.5;
export const LOT_DEPTH = (LOT.rowOffset + 1.6) * 2;

export interface Lot {
  nodeId: string;
  /** Gate: where the lot meets the road network (the node's own position). */
  gate: Vec2;
  /** Unit vector from the gate along the aisle, into the lot. */
  dir: Vec2;
  center: Vec2;
}

export interface World {
  pos: ReadonlyMap<string, Vec2>;
  /** Sampled centre line of each road, source → target. */
  roads: ReadonlyMap<string, Vec2[]>;
  client: Lot;
  server: Lot;
}

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, z: a.z + b.z * k });
const dist = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.z - a.z);
const norm = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / l, z: v.z / l };
};
/** Right-hand perpendicular when looking along `v` (x east, z south). */
const right = (v: Vec2): Vec2 => ({ x: -v.z, z: v.x });

/** Small stable hash so a road always bows to the same side. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Quadratic curve from `a` to `b`, bowed sideways, sampled about every 3 units. */
export function roadCurve(a: Vec2, b: Vec2, linkId: string): Vec2[] {
  const len = dist(a, b);
  const side = hash(linkId) % 2 === 0 ? 1 : -1;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const ctrl = add(mid, right(norm({ x: b.x - a.x, z: b.z - a.z })), len * ROAD_BOW * side);
  const n = Math.max(6, Math.ceil(len / 3));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
      z: u * u * a.z + 2 * u * t * ctrl.z + t * t * b.z,
    };
  });
}

function makeLot(nodeId: string, gate: Vec2): Lot {
  // Both lots open to the west and extend inland (east): CSULB sits on the coast and the Oregon
  // data center's roads arrive from the west.
  const dir = { x: 1, z: 0 };
  return { nodeId, gate, dir, center: add(gate, dir, LOT_LENGTH / 2) };
}

export function buildWorld(network: Network): World {
  const pos = new Map(network.nodes.map((n) => [n.id, toWorld(n.lat, n.lon)]));
  const roads = new Map(
    network.links.map((l) => [l.id, roadCurve(pos.get(l.source)!, pos.get(l.target)!, l.id)]),
  );
  return {
    pos,
    roads,
    client: makeLot(network.clientId, pos.get(network.clientId)!),
    server: makeLot(network.serverId, pos.get(network.serverId)!),
  };
}

/**
 * Slot `seq` (0–23). Even seq parks north of the aisle, odd south, nearest the gate first. Returns
 * the slot centre and the aisle point in front of it.
 */
export function lotSlot(lot: Lot, seq: number): { slot: Vec2; aisle: Vec2 } {
  const along =
    LOT.entry + (Math.floor(seq / 2) % LOT.slotsPerRow) * LOT.slotPitch + LOT.slotPitch / 2;
  const side = seq % 2 === 0 ? -1 : 1;
  const aisle = add(lot.gate, lot.dir, along);
  return { aisle, slot: add(aisle, right(lot.dir), LOT.rowOffset * side) };
}

/** Heading for a direction in world space (yaw around +y; three.js rotates +x toward −z). */
export const headingOf = (d: Vec2) => Math.atan2(-d.z, d.x);

export interface CarPath {
  seq: number;
  pts: Vec2[];
  cum: number[];
  departAt: number;
  arriveAt: number;
}

/** Shifts a polyline sideways by `offset` (positive = right of travel). Ends stay put. */
function offsetLine(pts: Vec2[], offset: number): Vec2[] {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const d = norm({ x: pts[i + 1]!.x - pts[i - 1]!.x, z: pts[i + 1]!.z - pts[i - 1]!.z });
    return add(p, right(d), offset);
  });
}

/**
 * Full driving line for one car: slot → aisle → CSULB gate → every road on its route (curves
 * reversed when driven target → source) → Oregon gate → aisle → slot. Times come straight from the
 * shared timeline, so 3D and 2D cars leave and arrive together.
 */
export function carPath(world: World, network: Network, plan: CarPlan): CarPath {
  const linkById = new Map(network.links.map((l) => [l.id, l]));
  const road: Vec2[] = [];
  plan.route.linkIds.forEach((id, i) => {
    const curve = world.roads.get(id)!;
    const forward = linkById.get(id)!.source === plan.route.nodeIds[i];
    const seg = forward ? curve : [...curve].reverse();
    road.push(...(road.length ? seg.slice(1) : seg));
  });
  const start = lotSlot(world.client, plan.seq);
  const end = lotSlot(world.server, plan.seq);
  const pts = [start.slot, start.aisle, ...offsetLine(road, LANE_OFFSET), end.aisle, end.slot];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + dist(pts[i - 1]!, pts[i]!));
  return { seq: plan.seq, pts, cum, departAt: plan.departAt, arriveAt: plan.arriveAt };
}

function pointAt(path: CarPath, d: number): Vec2 {
  const { pts, cum } = path;
  const total = cum[cum.length - 1]!;
  const clamped = Math.min(Math.max(d, 0), total);
  let k = 1;
  while (k < cum.length - 1 && cum[k]! < clamped) k++;
  const seg = cum[k]! - cum[k - 1]!;
  const f = seg === 0 ? 0 : (clamped - cum[k - 1]!) / seg;
  return {
    x: pts[k - 1]!.x + (pts[k]!.x - pts[k - 1]!.x) * f,
    z: pts[k - 1]!.z + (pts[k]!.z - pts[k - 1]!.z) * f,
  };
}

/** Eased progress so cars pull away and roll in instead of starting at full speed. */
const ease = (f: number) => {
  const e = 0.04;
  if (f < e) return (f * f) / (2 * e) / (1 - e);
  if (f > 1 - e) return 1 - ((1 - f) * (1 - f)) / (2 * e) / (1 - e);
  return (f - e / 2) / (1 - e);
};

/** Where car `path` is at sim time `t`. */
export function poseAt(path: CarPath, t: number): Pose {
  const total = path.cum[path.cum.length - 1]!;
  const span = Math.max(path.arriveAt - path.departAt, 1e-6);
  const f = Math.min(Math.max((t - path.departAt) / span, 0), 1);
  const d = ease(f) * total;
  const p = pointAt(path, d);
  // Heading from a short look-ahead/behind window so corners turn smoothly.
  const a = pointAt(path, d - 0.8);
  const b = pointAt(path, d + 0.8);
  const dir = { x: b.x - a.x, z: b.z - a.z };
  const status = t < path.departAt ? 'waiting' : t >= path.arriveAt ? 'arrived' : 'driving';
  return { ...p, heading: headingOf(dir), status };
}

/** Pose of a car that is parked in `lot` with no plan (before Send, or unreachable). */
export function parkedPose(lot: Lot, seq: number): Pose {
  const { slot, aisle } = lotSlot(lot, seq);
  return {
    ...slot,
    heading: headingOf({ x: aisle.x - slot.x, z: aisle.z - slot.z }),
    status: 'waiting',
  };
}

/**
 * True if `p` falls on a lot or its building (campus / data center sits north of the asphalt),
 * plus a small margin. Scenery placement uses it to keep towns and trees out.
 */
export function inLotArea(p: Vec2, lot: Lot, margin = 1.5): boolean {
  const dx = p.x - lot.center.x;
  const dz = p.z - lot.center.z;
  return (
    Math.abs(dx) < LOT_LENGTH / 2 + margin + 2 &&
    dz > -LOT_DEPTH / 2 - 12 - margin &&
    dz < LOT_DEPTH / 2 + margin
  );
}

/** Index of the car to follow: the driving car furthest along, else -1. */
export function leadCar(paths: readonly CarPath[], t: number): number {
  let best = -1;
  let bestF = -1;
  paths.forEach((p, i) => {
    if (t < p.departAt || t >= p.arriveAt) return;
    const f = (t - p.departAt) / (p.arriveAt - p.departAt);
    if (f > bestF) {
      bestF = f;
      best = i;
    }
  });
  return best;
}

/** Bounding circle of points in the ground plane, for camera framing. */
export function bounds(points: readonly Vec2[]): { center: Vec2; radius: number } {
  if (points.length === 0) return { center: { x: 0, z: 0 }, radius: 1 };
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  return { center, radius: Math.max(1, ...points.map((p) => dist(center, p))) };
}

/** Shortest distance from `p` to the polyline `line`. */
export function distanceToLine(p: Vec2, line: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const l2 = abx * abx + abz * abz;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)));
  }
  return best;
}

/** Deterministic PRNG (mulberry32) for scenery placement. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ray-casting point-in-polygon on [lon, lat] rings. */
export function inRing(lon: number, lat: number, ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
