import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Clone } from '@react-three/drei';
import { type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { ModelOr, modelUrl } from './models';
import { C } from './palette';
import { distanceToLine, inLotArea, rng, type Lot, type Vec2 } from './world';

export type StationState = 'idle' | 'visited' | 'path' | 'offline';

interface Props {
  id: string;
  onToggle?: () => void;
  pos: Vec2;
  state: StationState;
  /** Sim time this station is reached in the BFS replay, or null if it is not visited. */
  visitAt: number | null;
  /** Sim times at which cars drive past this station, ascending; empty when none do. */
  passes: readonly number[];
  clockRef: { readonly current: number };
  /** Roads touching this station, so its little town keeps them clear. */
  roads: readonly Vec2[][];
  /** Parking lots, kept clear of the town as well. */
  lots: readonly Lot[];
}

/** Stations are drawn this much larger than their 1-unit design so they read in the overview. */
const STATION_SCALE = 1.5;
/** Sim seconds a "car just passed" burst lasts. */
const PASS_SEC = 0.9;

/** Kenney City Kit (Suburban) houses used for station towns; the primitive box is the fallback. */
const HOUSES = ['a', 'c', 'f', 'h', 'k', 'n'].map((t) => modelUrl(`city/building-type-${t}`));
/** Kenney houses are about 1.2 units across; scale them to the town's footprint. */
const HOUSE_SIZE = 1.2;

const STATE_COLOR: Record<StationState, string> = {
  offline: C.danger,
  idle: C.primary,
  visited: C.explore,
  path: C.route,
};

/** A few deterministic buildings around the station, kept off its roads. */
function useTown(id: string, pos: Vec2, roads: readonly Vec2[][], lots: readonly Lot[]) {
  return useMemo(() => {
    let seed = 0;
    for (const ch of id) seed = seed * 31 + ch.charCodeAt(0);
    const rand = rng(seed);
    const out: {
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      alt: boolean;
      house: string;
      rot: number;
    }[] = [];
    for (let tries = 0; out.length < 9 && tries < 80; tries++) {
      const a = rand() * Math.PI * 2;
      const r = 6 + rand() * 6;
      const p = { x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r };
      if (roads.some((line) => distanceToLine(p, line) < 2.6)) continue;
      if (lots.some((lot) => inLotArea(p, lot))) continue;
      if (out.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 2.4)) continue;
      out.push({
        x: p.x - pos.x,
        z: p.z - pos.z,
        w: 1.2 + rand() * 1.4,
        d: 1.2 + rand() * 1.4,
        h: 1 + rand() * rand() * 5,
        alt: rand() > 0.5,
        // Picked from the seed, not rand(), so the primitive layout stays exactly as before.
        house: HOUSES[Math.abs(seed + out.length) % HOUSES.length]!,
        rot: (Math.abs(seed + out.length * 7) % 4) * (Math.PI / 2),
      });
    }
    return out;
  }, [id, pos, roads, lots]);
}

/**
 * Router station: a pad, a tower with a status beacon, and a small town. State drives colour; the
 * BFS replay sends an expanding ring at `visitAt`.
 * Once the first car drives past (`passes`), a route station lights up with a glowing column, and
 * every passing car sends a burst (shockwave ring, beacon flash) so the traversed route stands out.
 */
export const Station = memo(function Station(props: Props) {
  const { id, pos, state, visitAt, clockRef } = props;
  const color = STATE_COLOR[state];
  const town = useTown(id, pos, props.roads, props.lots);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const beacon = useRef<MeshStandardMaterial>(null);
  const column = useRef<Mesh>(null);
  const columnMat = useRef<MeshBasicMaterial>(null);
  const burst = useRef<Mesh>(null);
  const burstMat = useRef<MeshBasicMaterial>(null);
  const beaconMesh = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const glowMat = useRef<MeshBasicMaterial>(null);
  const { passes } = props;

  useFrame(({ camera, clock }) => {
    const t = clockRef.current;
    const age = visitAt === null ? -1 : t - visitAt;
    if (ring.current && ringMat.current) {
      const active = age >= 0 && age < 1.4;
      ring.current.visible = active;
      if (active) {
        ring.current.scale.setScalar(1 + age * 7);
        ringMat.current.opacity = 0.75 * (1 - age / 1.4);
      }
    }
    // Most recent car to drive past, if any.
    let last = -1;
    for (let i = passes.length - 1; i >= 0; i--) {
      if (passes[i]! <= t) {
        last = passes[i]!;
        break;
      }
    }
    const lit = last >= 0 && state !== 'offline';
    const passAge = lit ? t - last : Infinity;
    const passing = passAge < PASS_SEC ? 1 - passAge / PASS_SEC : 0;
    if (beacon.current) {
      const flash = age >= 0 && age < 0.5 ? 1.6 * (1 - age / 0.5) : 0;
      beacon.current.emissiveIntensity =
        (lit ? 1.6 : 0.7) + flash + passing * 2.5 + Math.sin(clock.elapsedTime * 4) * 0.15;
    }
    beaconMesh.current?.scale.setScalar(1 + passing * 0.8);
    // Lit marks grow with camera distance so a lit route still reads in the overview.
    const far = Math.min(
      8,
      Math.max(
        1,
        Math.hypot(camera.position.x - pos.x, camera.position.y, camera.position.z - pos.z) / 160,
      ),
    );
    if (column.current && columnMat.current) {
      column.current.visible = lit;
      columnMat.current.opacity = 0.35 + passing * 0.4 + Math.sin(clock.elapsedTime * 3) * 0.05;
    }
    if (glow.current && glowMat.current) {
      glow.current.visible = lit;
      glow.current.scale.setScalar(far * (1 + passing * 0.35));
      glowMat.current.opacity = 0.5 + passing * 0.4;
    }
    if (burst.current && burstMat.current) {
      burst.current.visible = passing > 0;
      burst.current.scale.setScalar(far * (1 + (1 - passing) * 3.2));
      burstMat.current.opacity = 0.95 * passing;
    }
  });

  return (
    <group position={[pos.x, 0, pos.z]}>
      {/* Lit once a car has driven past: a column of light over the station. */}
      <mesh ref={column} position-y={9} visible={false} renderOrder={3}>
        <cylinderGeometry args={[1.6, 2.4, 18, 24, 1, true]} />
        <meshBasicMaterial
          ref={columnMat}
          color={C.route}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Lit once a car has driven past: a route-coloured disc under the station. */}
      <mesh ref={glow} position-y={0.1} rotation-x={-Math.PI / 2} visible={false}>
        <circleGeometry args={[5.2, 40]} />
        <meshBasicMaterial
          ref={glowMat}
          color={C.route}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* "A car just passed" shockwave. */}
      <mesh ref={burst} position-y={0.2} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[4.4, 5.6, 48]} />
        <meshBasicMaterial
          ref={burstMat}
          color="#fde68a"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {town.map((b, i) => (
        <ModelOr
          key={i}
          url={b.house}
          fallback={
            <mesh position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
              <boxGeometry args={[b.w, b.h, b.d]} />
              <meshStandardMaterial color={b.alt ? C.building : C.buildingAlt} roughness={0.8} />
            </mesh>
          }
        >
          {(scene) => (
            <Clone
              object={scene}
              position={[b.x, 0, b.z]}
              rotation-y={b.rot}
              scale={(b.w + b.d) / 2 / HOUSE_SIZE}
              castShadow
              receiveShadow
            />
          )}
        </ModelOr>
      ))}

      <group scale={STATION_SCALE}>
        <group
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle?.();
          }}
        >
          {/* Pad */}
          <mesh position-y={0.15} receiveShadow castShadow>
            <cylinderGeometry args={[2.6, 2.9, 0.3, 24]} />
            <meshStandardMaterial color="#ffffff" roughness={0.6} />
          </mesh>
          <mesh position-y={0.31} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[2.0, 2.5, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
          </mesh>
          {/* Router cabinet */}
          <mesh position-y={1.3} castShadow>
            <boxGeometry args={[1.6, 2, 1.6]} />
            <meshStandardMaterial color="#e5ece7" roughness={0.5} />
          </mesh>
          {[0.7, 1.2, 1.7].map((y) => (
            <mesh key={y} position={[0.81, y, 0]}>
              <boxGeometry args={[0.02, 0.18, 1.2]} />
              <meshBasicMaterial color="#22c55e" />
            </mesh>
          ))}
          {/* Mast + beacon */}
          <mesh position-y={3.6} castShadow>
            <cylinderGeometry args={[0.1, 0.16, 2.8, 6]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh ref={beaconMesh} position-y={5.2}>
            <sphereGeometry args={[0.55, 16, 12]} />
            <meshStandardMaterial
              ref={beacon}
              color={color}
              emissive={color}
              emissiveIntensity={0.8}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* Persistent halo once visited, plus the expanding BFS ring. */}
        {(state === 'visited' || state === 'path') && (
          <mesh position-y={0.09} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[3.1, 3.6, 40]} />
            <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        )}
        <mesh ref={ring} position-y={0.12} rotation-x={-Math.PI / 2} visible={false}>
          <ringGeometry args={[2.6, 3.0, 48]} />
          <meshBasicMaterial
            ref={ringMat}
            color={C.explore}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});
