import { memo, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ribbon } from './geometry';
import { C } from './palette';
import { ROAD_WIDTH, type Vec2 } from './world';

export type RoadState = 'idle' | 'path' | 'offline';

interface Props {
  curve: Vec2[];
  previewed: boolean;
  id: string;
  state: RoadState;
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

/** Slightly arched road between two stations; glows in the route colour when on the path. */
export const Road = memo(function Road({ curve, state, previewed, id }: Props) {
  const asphalt = useMemo(() => ribbon(curve, ROAD_WIDTH, 0.06), [curve]);
  const glow = useMemo(() => ribbon(curve, ROAD_WIDTH * 2.4, 0.04), [curve]);
  const paint = useMemo(
    () => mergeGeometries(dashes(curve).map((seg) => ribbon(seg, 0.16, 0.08))),
    [curve],
  );
  const line = useMemo(
    () => curve.map((p) => [p.x, 0.3, p.z] as [number, number, number]),
    [curve],
  );
  // This overview-only stroke is lifted enough that its screen-space width does not sink
  // halfway into the ground at grazing angles. It fades away before close-up lane paint matters.
  const overviewLine = useMemo(
    () => curve.map((p) => [p.x, 3, p.z] as [number, number, number]),
    [curve],
  );
  const glowMat = useRef<MeshStandardMaterial>(null);
  const minimumLine = useRef<LineMaterial | null>(null);
  const middle = curve[Math.floor(curve.length / 2)]!;

  useFrame(({ clock, camera, size }) => {
    // At overview distance, a world-width ribbon becomes subpixel and shimmers while orbiting.
    // Fade in a one-pixel centre line only when the physical road is too small to resolve.
    if (minimumLine.current && state === 'idle') {
      const distance = Math.max(
        1,
        Math.hypot(camera.position.x - middle.x, camera.position.y, camera.position.z - middle.z),
      );
      const pixels =
        (ROAD_WIDTH * size.height * camera.projectionMatrix.elements[5]!) / (2 * distance);
      minimumLine.current.opacity = Math.max(0, Math.min(1, 2 - pixels));
    }
    if (glowMat.current && state === 'path')
      glowMat.current.emissiveIntensity = 0.55 + Math.sin(clock.elapsedTime * 3) * 0.2;
  });

  return (
    <group userData={{ roadId: id, previewed, state }}>
      {previewed && (
        <group>
          <Line
            points={line}
            color="#ffffff"
            lineWidth={11}
            depthTest={false}
            depthWrite={false}
            renderOrder={10}
          />
          <Line
            points={line}
            color={state === 'offline' ? C.danger : C.explore}
            lineWidth={6}
            depthTest={false}
            depthWrite={false}
            renderOrder={11}
            dashed={state === 'offline'}
            dashSize={3}
            gapSize={2}
          />
        </group>
      )}
      {state === 'idle' && (
        <Line
          points={overviewLine}
          color={C.asphalt}
          lineWidth={1.2}
          transparent
          opacity={0}
          depthWrite={false}
          onUpdate={(object: { material: LineMaterial }) => {
            minimumLine.current = object.material;
          }}
          userData={{ minimumRoadLine: true }}
        />
      )}
      {state === 'offline' && (
        <Line points={line} color={C.danger} lineWidth={4} dashed dashSize={3} gapSize={2} />
      )}
      {state === 'path' && (
        <mesh geometry={glow}>
          <meshStandardMaterial
            ref={glowMat}
            color={C.route}
            emissive={C.route}
            emissiveIntensity={0.5}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* Screen-space line so the route reads at any zoom (Figma: 4 px route). */}
      {state === 'path' && (
        <Line
          points={line}
          color={C.route}
          lineWidth={4}
          depthWrite={false}
          transparent
          opacity={0.9}
        />
      )}
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial
          color={state === 'offline' ? C.danger : C.asphalt}
          roughness={0.9}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh geometry={paint}>
        <meshBasicMaterial color={state === 'path' ? '#fde68a' : C.paint} />
      </mesh>
    </group>
  );
});
