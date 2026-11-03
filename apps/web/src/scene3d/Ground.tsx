import { useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { ExtrudeGeometry, Object3D, Shape, type InstancedMesh } from 'three';
import { C } from './palette';
import westcoast from './westcoast.json';
import { distanceToLine, inRing, rng, toWorld, type Vec2, type World } from './world';

type Ring = number[][];
interface Feature {
  properties: { name: string; postal: string };
  geometry:
    { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

/** States the network runs through; neighbours are drawn a shade darker for context. */
const NETWORK_STATES = new Set(['CA', 'OR', 'WA']);
const LAND_DEPTH = 3;

const features = (westcoast as { features: Feature[] }).features;
const polygons = (f: Feature): Ring[][] =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

function toShape(rings: Ring[]): Shape {
  // Shape space (x, y) → world (x, −z) after the −90° X rotation below.
  const pts = (r: Ring) =>
    r.map(([lon, lat]) => {
      const w = toWorld(lat!, lon!);
      return [w.x, -w.z] as const;
    });
  const [outer, ...holes] = rings;
  const shape = new Shape();
  pts(outer!).forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  for (const h of holes) {
    const hole = new Shape();
    pts(h).forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    shape.holes.push(hole);
  }
  return shape;
}

function State({ feature }: { feature: Feature }) {
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(polygons(feature).map(toShape), {
        depth: LAND_DEPTH,
        bevelEnabled: false,
      }),
    [feature],
  );
  const inNetwork = NETWORK_STATES.has(feature.properties.postal);
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-LAND_DEPTH} receiveShadow>
      <meshStandardMaterial
        attach="material-0"
        color={inNetwork ? C.mapGround : C.outside}
        roughness={1}
      />
      <meshStandardMaterial attach="material-1" color={C.groundSide} roughness={1} />
    </mesh>
  );
}

function Borders() {
  const lines = useMemo(
    () =>
      features.flatMap((f) =>
        polygons(f).map((rings) =>
          rings[0]!.map(([lon, lat]) => {
            const w = toWorld(lat!, lon!);
            return [w.x, 0.05, w.z] as [number, number, number];
          }),
        ),
      ),
    [],
  );
  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color={C.stateLine} lineWidth={1.2} />
      ))}
    </>
  );
}

/**
 * Decorative peaks (Cascades and Sierra Nevada), approximate positions. Scenery only: BFS ignores
 * terrain. A peak too close to a road or station is skipped so it never covers the network.
 */
const PEAKS: { lat: number; lon: number; h: number; r: number }[] = [
  { lat: 41.41, lon: -122.19, h: 26, r: 13 },
  { lat: 40.49, lon: -121.51, h: 16, r: 10 },
  { lat: 45.37, lon: -121.7, h: 24, r: 11 },
  { lat: 44.67, lon: -121.8, h: 18, r: 9 },
  { lat: 46.2, lon: -122.19, h: 16, r: 10 },
  { lat: 36.58, lon: -118.29, h: 22, r: 12 },
  { lat: 37.2, lon: -118.9, h: 18, r: 11 },
  { lat: 37.75, lon: -119.4, h: 17, r: 11 },
  { lat: 38.3, lon: -119.8, h: 15, r: 10 },
  { lat: 36.1, lon: -118.4, h: 14, r: 10 },
  { lat: 39.9, lon: -120.9, h: 13, r: 9 },
  { lat: 42.9, lon: -122.1, h: 14, r: 9 },
];

function clear(p: Vec2, world: World, margin: number): boolean {
  for (const line of world.roads.values()) if (distanceToLine(p, line) < margin) return false;
  for (const s of world.pos.values())
    if (Math.hypot(p.x - s.x, p.z - s.z) < margin + 4) return false;
  return true;
}

function Mountains({ world }: { world: World }) {
  const peaks = useMemo(
    () =>
      PEAKS.map((p) => ({ ...p, ...toWorld(p.lat, p.lon) })).filter((p) =>
        clear(p, world, p.r + 2),
      ),
    [world],
  );
  return (
    <>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation-y={i * 1.3}>
          <mesh position-y={p.h / 2} castShadow receiveShadow>
            <coneGeometry args={[p.r, p.h, 7]} />
            <meshStandardMaterial color={C.rock} flatShading roughness={0.95} />
          </mesh>
          <mesh position-y={p.h * 0.83}>
            <coneGeometry args={[p.r * 0.36, p.h * 0.34, 7]} />
            <meshStandardMaterial color={C.snow} flatShading roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}

const TREE_COUNT = 1400;

/** Instanced low-poly pines, denser in the wet north, kept off roads, stations and lots. */
function Forest({ world }: { world: World }) {
  const crowns = useRef<InstancedMesh>(null);
  const trunks = useRef<InstancedMesh>(null);
  const trees = useMemo(() => {
    const rand = rng(39);
    const land = features
      .filter((f) => NETWORK_STATES.has(f.properties.postal))
      .flatMap((f) => polygons(f).map((r) => r[0]!));
    const out: { x: number; z: number; s: number; r: number }[] = [];
    for (let tries = 0; out.length < TREE_COUNT && tries < TREE_COUNT * 30; tries++) {
      const lat = 33 + rand() * 13.4;
      const lon = -124.6 + rand() * 8.5;
      // More forest north of ~39°, sparse desert in the far south-east.
      const density = Math.min(1, Math.max(0.06, (lat - 35.5) / 6)) * (lon > -117.8 ? 0.3 : 1);
      if (rand() > density) continue;
      if (!land.some((ring) => inRing(lon, lat, ring))) continue;
      const p = toWorld(lat, lon);
      if (!clear(p, world, 3)) continue;
      if (Math.abs(p.x - world.client.center.x) < 20 && Math.abs(p.z - world.client.center.z) < 12)
        continue;
      if (Math.abs(p.x - world.server.center.x) < 24 && Math.abs(p.z - world.server.center.z) < 16)
        continue;
      out.push({ ...p, s: 0.7 + rand() * 0.9, r: rand() * Math.PI });
    }
    return out;
  }, [world]);

  useLayoutEffect(() => {
    const o = new Object3D();
    trees.forEach((t, i) => {
      o.position.set(t.x, 1.6 * t.s, t.z);
      o.rotation.set(0, t.r, 0);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      crowns.current?.setMatrixAt(i, o.matrix);
      o.position.y = 0.4 * t.s;
      o.updateMatrix();
      trunks.current?.setMatrixAt(i, o.matrix);
    });
    if (crowns.current) crowns.current.instanceMatrix.needsUpdate = true;
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
  }, [trees]);

  return (
    <>
      <instancedMesh ref={crowns} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[0.9, 2.6, 6]} />
        <meshStandardMaterial color={C.pine} flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.15, 0.2, 0.8, 5]} />
        <meshStandardMaterial color={C.trunk} roughness={1} />
      </instancedMesh>
    </>
  );
}

/** West Coast land from Natural Earth (public domain), ocean, peaks and forest. */
export function Ground({ world }: { world: World }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-1.2} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={C.ocean} roughness={0.6} metalness={0.05} />
      </mesh>
      {features.map((f) => (
        <State key={f.properties.postal} feature={f} />
      ))}
      <Borders />
      <Mountains world={world} />
      <Forest world={world} />
    </group>
  );
}
