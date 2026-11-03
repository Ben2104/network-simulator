import { memo, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ribbon } from './geometry';
import { C } from './palette';
import { ROAD_WIDTH, type Vec2 } from './world';

export type RoadState = 'idle' | 'path' | 'broken';

interface Props {
  id: string;
  curve: Vec2[];
  state: RoadState;
  canToggle: boolean;
  onToggle: (id: string) => void;
}

/** Dashed centre line as short ribbon pieces (stays crisp at any zoom, unlike GL lines). */
function dashes(curve: Vec2[]): Vec2[][] {
  const out: Vec2[][] = [];
  let carry = 0;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = carry; d < len; d += 3) {
      const t0 = d / len;
      const t1 = Math.min(1, (d + 1.2) / len);
      out.push([
        { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 },
        { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 },
      ]);
      carry = d + 3 - len;
    }
  }
  return out;
}

/** Slightly arched road between two stations. Click to break or restore it between sends. */
export const Road = memo(function Road({ id, curve, state, canToggle, onToggle }: Props) {
  const asphalt = useMemo(() => ribbon(curve, ROAD_WIDTH, 0.06), [curve]);
  const glow = useMemo(() => ribbon(curve, ROAD_WIDTH * 2.4, 0.04), [curve]);
  const hit = useMemo(() => ribbon(curve, ROAD_WIDTH * 5, 0.2), [curve]);
  const paint = useMemo(
    () => mergeGeometries(dashes(curve).map((seg) => ribbon(seg, 0.16, 0.08))),
    [curve],
  );
  const mid = curve[Math.floor(curve.length / 2)]!;
  const line = useMemo(
    () => curve.map((p) => [p.x, 0.3, p.z] as [number, number, number]),
    [curve],
  );
  const glowMat = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (glowMat.current && state === 'path')
      glowMat.current.emissiveIntensity = 0.55 + Math.sin(clock.elapsedTime * 3) * 0.2;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    // Ignore the click that ends an orbit drag.
    if (!canToggle || e.delta > 6) return;
    e.stopPropagation();
    onToggle(id);
  };

  return (
    <group>
      {state !== 'idle' && (
        <mesh geometry={glow}>
          <meshStandardMaterial
            ref={glowMat}
            color={state === 'path' ? C.route : C.danger}
            emissive={state === 'path' ? C.route : C.danger}
            emissiveIntensity={0.5}
            transparent
            opacity={state === 'path' ? 0.85 : 0.55}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* Screen-space line so the route and broken roads read at any zoom (Figma: 4 px route). */}
      {state !== 'idle' && (
        <Line
          points={line}
          color={state === 'path' ? C.route : C.danger}
          lineWidth={state === 'path' ? 4 : 3}
          dashed={state === 'broken'}
          dashSize={6}
          gapSize={4}
          depthWrite={false}
          transparent
          opacity={0.9}
        />
      )}
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial
          color={state === 'broken' ? '#7f1d1d' : C.asphalt}
          roughness={0.9}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      {state !== 'broken' && (
        <mesh geometry={paint}>
          <meshBasicMaterial color={state === 'path' ? '#fde68a' : C.paint} />
        </mesh>
      )}
      {state === 'broken' && <Barrier at={mid} />}
      <mesh
        geometry={hit}
        visible={false}
        onClick={click}
        onPointerOver={(e) => {
          if (!canToggle) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <meshBasicMaterial />
      </mesh>
    </group>
  );
});

/** Non-colour mark for a broken road: a striped barrier with a cross on top. */
function Barrier({ at }: { at: Vec2 }) {
  return (
    <group position={[at.x, 0, at.z]}>
      {[-1.4, 0, 1.4].map((dx) => (
        <mesh key={dx} position={[dx, 0.6, 0]} castShadow>
          <coneGeometry args={[0.45, 1.2, 8]} />
          <meshStandardMaterial color={dx === 0 ? C.paint : C.danger} />
        </mesh>
      ))}
      <group position-y={3} rotation-y={Math.PI / 4}>
        {[Math.PI / 4, -Math.PI / 4].map((r) => (
          <mesh key={r} rotation-z={r}>
            <boxGeometry args={[3.2, 0.55, 0.55]} />
            <meshStandardMaterial color={C.danger} emissive={C.danger} emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
