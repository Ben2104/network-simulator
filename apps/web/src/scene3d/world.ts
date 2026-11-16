import { MAP_HEIGHT, MAP_WIDTH, project, type Network } from '@netsim/shared';
import { carStatus, movementTime, type CarPlan } from '../sim/timeline';

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
  /** Body lean around the car's forward axis (radians, positive leans to the car's right). */
  roll: number;
  /** Nose up (positive) when accelerating, down when braking (radians). */
  pitch: number;
  status: 'waiting' | 'driving' | 'arrived' | 'blocked';
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
  previous?: CarPath;
  switchAt?: number;
  blocked?: boolean;
  seq: number;
  pts: Vec2[];
  /** Distance from the start at each point. */
  cum: number[];
  /** Relative cruising speed at each point (1 on straights, lower in turns). */
  speed: number[];
  /** Cumulative travel "time" (distance / relative speed) at each point. */
  tcum: number[];
  departAt: number;
  arriveAt: number;
  bottleneck?: CarPlan['bottleneck'];
}

/** Corner radius for turns at stations, lot aisles and gates (a car is 2.4 long). */
export const TURN_RADIUS = 3;
/** Slowest relative speed in the tightest turn. */
const MIN_TURN_SPEED = 0.4;
/** How strongly curvature (radians per unit) slows a car. */
const TURN_BRAKE = 2.2;
/** Max change in relative speed per unit driven, so cars brake before and accelerate after turns. */
const SPEED_SLEW = 0.06;

/**
 * Rounds every corner of a polyline with a quadratic fillet of up to `radius` (never more than
 * 45 % of either neighbouring segment), so heading changes continuously instead of snapping.
 * Nearly straight joints are left alone.
 */
export function smoothCorners(pts: readonly Vec2[], radius = TURN_RADIUS): Vec2[] {
  if (pts.length < 3) return [...pts];
  const out: Vec2[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const a = pts[i - 1]!;
    const b = pts[i + 1]!;
    const lin = dist(a, p);
    const lout = dist(p, b);
    if (lin < 1e-6 || lout < 1e-6) continue;
    const din = { x: (p.x - a.x) / lin, z: (p.z - a.z) / lin };
    const dout = { x: (b.x - p.x) / lout, z: (b.z - p.z) / lout };
    const turn = Math.acos(Math.min(1, Math.max(-1, din.x * dout.x + din.z * dout.z)));
    if (turn < 0.12) {
      out.push(p);
      continue;
    }
    const r = Math.min(radius, lin * 0.45, lout * 0.45);
    const s0 = add(p, din, -r);
    const s1 = add(p, dout, r);
    const n = Math.max(3, Math.ceil(turn * 6));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      out.push({
        x: u * u * s0.x + 2 * u * t * p.x + t * t * s1.x,
        z: u * u * s0.z + 2 * u * t * p.z + t * t * s1.z,
      });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Signed heading change per unit at each point (positive = turning left, x east z south). */
function curvatures(pts: readonly Vec2[], cum: readonly number[]): number[] {
  const n = pts.length;
  return pts.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const a = pts[i - 1]!;
    const p = pts[i]!;
    const b = pts[i + 1]!;
    const h0 = Math.atan2(-(p.z - a.z), p.x - a.x);
    const h1 = Math.atan2(-(b.z - p.z), b.x - p.x);
    let d = h1 - h0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const span = (cum[i + 1]! - cum[i - 1]!) / 2;
    return span > 1e-6 ? d / span : 0;
  });
}

/**
 * Relative speed along a path: slower the tighter the turn, and rate-limited both ways so a car
 * brakes before a corner and accelerates out of it instead of changing speed instantly.
 */
function speedProfile(pts: readonly Vec2[], cum: readonly number[]): number[] {
  const v = curvatures(pts, cum).map((k) =>
    Math.max(MIN_TURN_SPEED, 1 / (1 + TURN_BRAKE * Math.abs(k))),
  );
  for (let i = 1; i < v.length; i++)
    v[i] = Math.min(v[i]!, v[i - 1]! + SPEED_SLEW * (cum[i]! - cum[i - 1]!));
  for (let i = v.length - 2; i >= 0; i--)
    v[i] = Math.min(v[i]!, v[i + 1]! + SPEED_SLEW * (cum[i + 1]! - cum[i]!));
  return v;
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
  if (plan.blocked) {
    const at = lotSlot(world.client, plan.seq).slot;
    return {
      seq: plan.seq,
      pts: [at, at],
      cum: [0, 0],
      speed: [1, 1],
      tcum: [0, 0],
      departAt: plan.departAt,
      arriveAt: plan.arriveAt,
      blocked: true,
    };
  }
  const previous = plan.handoff ? carPath(world, network, plan.handoff.plan) : undefined;
  const fromIndex = plan.handoff?.nodeIndex ?? 0;
  const linkById = new Map(network.links.map((l) => [l.id, l]));
  const road: Vec2[] = [];
  plan.route.linkIds.slice(fromIndex).forEach((id, j) => {
    const i = j + fromIndex;
    const curve = world.roads.get(id)!;
    const forward = linkById.get(id)!.source === plan.route.nodeIds[i];
    const seg = forward ? curve : [...curve].reverse();
    road.push(...(road.length ? seg.slice(1) : seg));
  });
  const start = lotSlot(world.client, plan.seq);
  const end = lotSlot(world.server, plan.seq);
  const pts = smoothCorners([
    ...(previous && plan.handoff ? [poseAt(previous, plan.handoff.at)] : [start.slot, start.aisle]),
    ...offsetLine(road, LANE_OFFSET),
    end.aisle,
    end.slot,
  ]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + dist(pts[i - 1]!, pts[i]!));
  const speed = speedProfile(pts, cum);
  const tcum = [0];
  for (let i = 1; i < pts.length; i++)
    tcum.push(tcum[i - 1]! + (cum[i]! - cum[i - 1]!) / ((speed[i - 1]! + speed[i]!) / 2));
  return {
    seq: plan.seq,
    pts,
    cum,
    speed,
    tcum,
    previous,
    switchAt: plan.handoff?.at,
    departAt: plan.handoff?.at ?? plan.departAt,
    arriveAt: plan.arriveAt,
    bottleneck: plan.bottleneck,
  };
}

function pointAt(path: CarPath, d: number): Vec2 {
  const { pts, cum } = path;
  const total = cum[cum.length - 1]!;
  const clamped = Math.min(Math.max(d, 0), total);
  const k = segmentAt(cum, clamped);
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

/** Index k with arr[k - 1] <= x <= arr[k] (binary search on a non-decreasing array). */
function segmentAt(arr: readonly number[], x: number): number {
  let lo = 1;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Distance driven after `f` (0–1) of the trip's time, following the speed profile. */
function distanceAt(path: CarPath, f: number): number {
  const { cum, tcum } = path;
  const t = f * tcum[tcum.length - 1]!;
  const k = segmentAt(tcum, t);
  const span = tcum[k]! - tcum[k - 1]!;
  const g = span === 0 ? 0 : (t - tcum[k - 1]!) / span;
  return cum[k - 1]! + (cum[k]! - cum[k - 1]!) * g;
}

function speedAt(path: CarPath, d: number): number {
  const { cum, speed } = path;
  const total = cum[cum.length - 1]!;
  const k = segmentAt(cum, Math.min(Math.max(d, 0), total));
  const seg = cum[k]! - cum[k - 1]!;
  const g = seg === 0 ? 0 : (Math.min(Math.max(d, 0), total) - cum[k - 1]!) / seg;
  return speed[k - 1]! + (speed[k]! - speed[k - 1]!) * g;
}

/** Signed heading change from `a` to `b` in (−π, π]. */
function turnBetween(a: Vec2, b: Vec2): number {
  let d = headingOf(b) - headingOf(a);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Largest body lean and pitch (radians); small, so the effect reads as weight, not a wobble. */
const MAX_ROLL = 0.07;
const MAX_PITCH = 0.035;

/**
 * Where car `path` is at sim time `t`. Time maps to distance through the path's speed profile,
 * so the car slows into turns and speeds up out of them while still leaving and arriving on the
 * shared timeline. Heading points from the rear axle to the front axle (a short look-ahead), and
 * the body leans out of turns and pitches with acceleration.
 */
export function poseAt(path: CarPath, t: number): Pose {
  if (path.previous && path.switchAt !== undefined && t < path.switchAt)
    return poseAt(path.previous, t);
  if (path.blocked) return { ...path.pts[0]!, heading: 0, roll: 0, pitch: 0, status: 'blocked' };
  const total = path.cum[path.cum.length - 1]!;
  const span = Math.max(movementTime(path, path.arriveAt) - path.departAt, 1e-6);
  const f = Math.min(Math.max((movementTime(path, t) - path.departAt) / span, 0), 1);
  const d = distanceAt(path, ease(f));
  const p = pointAt(path, d);
  const rear = pointAt(path, d - 0.6);
  const front = pointAt(path, d + 1);
  const dir = { x: front.x - rear.x, z: front.z - rear.z };
  const status = carStatus(path, t);
  if (status !== 'driving' || total === 0)
    return { ...p, heading: headingOf(dir), roll: 0, pitch: 0, status };

  // Lean: lateral acceleration ~ speed² × curvature. A left turn (positive) throws the body to
  // the right, which is positive roll around the forward axis.
  const a0 = pointAt(path, d - 2);
  const b0 = pointAt(path, d + 2);
  const turn = turnBetween({ x: p.x - a0.x, z: p.z - a0.z }, { x: b0.x - p.x, z: b0.z - p.z });
  const v = speedAt(path, d);
  const roll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, turn * v * v * 0.25));
  // Pitch: nose up while speeding up (squat), down while braking (dive).
  const accel = speedAt(path, d + 3) - speedAt(path, d - 3);
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, accel * 0.12));
  return { ...p, heading: headingOf(dir), roll, pitch, status };
}

/** Pose of a car that is parked in `lot` with no plan (before Send, or unreachable). */
export function parkedPose(lot: Lot, seq: number): Pose {
  const { slot, aisle } = lotSlot(lot, seq);
  return {
    ...slot,
    heading: headingOf({ x: aisle.x - slot.x, z: aisle.z - slot.z }),
    roll: 0,
    pitch: 0,
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

/**
 * Sim time at which car `path` drives past `at` (its closest point on the path), consistent with
 * `poseAt`. Time maps to distance monotonically there, so bisection inverts it.
 */
export function passTime(path: CarPath, at: Vec2): number {
  let best = Infinity;
  let d = 0;
  path.pts.forEach((p, i) => {
    const e = dist(p, at);
    if (e < best) {
      best = e;
      d = path.cum[i]!;
    }
  });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (distanceAt(path, ease(mid)) < d) lo = mid;
    else hi = mid;
  }
  return path.departAt + lo * (path.arriveAt - path.departAt);
}

/** Index of the car to follow: the driving car furthest along, else -1. */
export function leadCar(paths: readonly CarPath[], t: number): number {
  let best = -1;
  let bestF = -1;
  paths.forEach((path, i) => {
    let p = path;
    while (p.previous && p.switchAt !== undefined && t < p.switchAt) p = p.previous;
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
