import { memo, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { C } from './palette';
import { distanceToLine, inLotArea, rng, type Lot, type Vec2 } from './world';

export type StationState = 'idle' | 'visited' | 'path' | 'broken';

interface Props {
  id: string;
  pos: Vec2;
  state: StationState;
  /** Sim time this station is reached in the BFS replay, or null if it is not visited. */
  visitAt: number | null;
  clockRef: { readonly current: number };
  /** Roads touching this station, so its little town keeps them clear. */
  roads: readonly Vec2[][];
  /** Parking lots, kept clear of the town as well. */
  lots: readonly Lot[];
  canToggle: boolean;
  onToggle: (id: string) => void;
}

const STATE_COLOR: Record<StationState, string> = {
  idle: C.primary,
  visited: C.explore,
  path: C.route,
  broken: C.danger,
};

/** A few deterministic buildings around the station, kept off its roads. */
function useTown(id: string, pos: Vec2, roads: readonly Vec2[][], lots: readonly Lot[]) {
  return useMemo(() => {
    let seed = 0;
    for (const ch of id) seed = seed * 31 + ch.charCodeAt(0);
    const rand = rng(seed);
    const out: { x: number; z: number; w: number; d: number; h: number; alt: boolean }[] = [];
    for (let tries = 0; out.length < 9 && tries < 80; tries++) {
      const a = rand() * Math.PI * 2;
      const r = 4.5 + rand() * 6;
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
      });
    }
    return out;
  }, [id, pos, roads, lots]);
}

/**
 * Router station: a pad, a tower with a status beacon, and a small town. State drives colour; the
 * BFS replay sends an expanding ring at `visitAt`. Broken stations add a red cross (non-colour mark).
 */
export const Station = memo(function Station(props: Props) {
  const { id, pos, state, visitAt, clockRef } = props;
  const color = STATE_COLOR[state];
  const town = useTown(id, pos, props.roads, props.lots);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const beacon = useRef<MeshStandardMaterial>(null);
  const cross = useRef<Group>(null);

  useFrame(({ clock }) => {
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
    if (beacon.current) {
      const flash = age >= 0 && age < 0.5 ? 1.6 * (1 - age / 0.5) : 0;
      beacon.current.emissiveIntensity = 0.7 + flash + Math.sin(clock.elapsedTime * 4) * 0.15;
    }
    if (cross.current) cross.current.rotation.y = clock.elapsedTime * 1.2;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!props.canToggle || e.delta > 6) return;
    e.stopPropagation();
    props.onToggle(id);
  };

  return (
    <group position={[pos.x, 0, pos.z]}>
      {town.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.alt ? C.building : C.buildingAlt} roughness={0.8} />
        </mesh>
      ))}

      <group
        onClick={click}
        onPointerOver={(e) => {
          if (!props.canToggle) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
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
          <meshStandardMaterial
            color={state === 'broken' ? '#4b1d1d' : '#e5ece7'}
            roughness={0.5}
          />
        </mesh>
        {[0.7, 1.2, 1.7].map((y) => (
          <mesh key={y} position={[0.81, y, 0]}>
            <boxGeometry args={[0.02, 0.18, 1.2]} />
            <meshBasicMaterial color={state === 'broken' ? C.danger : '#22c55e'} />
          </mesh>
        ))}
        {/* Mast + beacon */}
        <mesh position-y={3.6} castShadow>
          <cylinderGeometry args={[0.1, 0.16, 2.8, 6]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position-y={5.2}>
          <sphereGeometry args={[0.55, 16, 12]} />
          <meshStandardMaterial
            ref={beacon}
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            toneMapped={false}
          />
        </mesh>
        {/* Larger invisible target so stations are easy to click from far away. */}
        <mesh position-y={2.5} visible={false}>
          <cylinderGeometry args={[4, 4, 5, 8]} />
          <meshBasicMaterial />
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

      {state === 'broken' && (
        <group ref={cross} position-y={8}>
          {[Math.PI / 4, -Math.PI / 4].map((r) => (
            <mesh key={r} rotation-z={r} castShadow>
              <boxGeometry args={[4, 0.8, 0.8]} />
              <meshStandardMaterial color={C.danger} emissive={C.danger} emissiveIntensity={0.5} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
});
