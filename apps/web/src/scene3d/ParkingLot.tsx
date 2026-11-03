import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { Object3D } from 'three';
import { C } from './palette';
import { LOT, LOT_DEPTH, LOT_LENGTH, type Lot } from './world';

interface Props {
  lot: Lot;
  kind: 'client' | 'server';
  /** Lights the lot up while cars are parked in it. */
  active: boolean;
}

/** Slot divider lines on both sides of the aisle. */
function SlotLines() {
  const lines = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let k = 0; k <= LOT.slotsPerRow; k++) {
      const x = -LOT_LENGTH / 2 + LOT.entry + k * LOT.slotPitch;
      out.push({ x, z: -LOT.rowOffset }, { x, z: LOT.rowOffset });
    }
    return out;
  }, []);
  return (
    <>
      {lines.map((l, i) => (
        <mesh key={i} position={[l.x, 0.33, l.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.12, 2.6]} />
          <meshBasicMaterial color={C.paint} />
        </mesh>
      ))}
      {/* Aisle arrows: a dashed line pointing into the lot. */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={`a${i}`}
          position={[-LOT_LENGTH / 2 + LOT.entry + 1 + i * 3.4, 0.33, 0]}
          rotation-x={-Math.PI / 2}
        >
          <planeGeometry args={[1.4, 0.14]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      ))}
    </>
  );
}

function Campus() {
  return (
    <group position={[2, 0, -LOT_DEPTH / 2 - 6]}>
      <mesh position-y={2} castShadow receiveShadow>
        <boxGeometry args={[14, 4, 6]} />
        <meshStandardMaterial color={C.building} roughness={0.7} />
      </mesh>
      <mesh position-y={4.2}>
        <boxGeometry args={[14.4, 0.4, 6.4]} />
        <meshStandardMaterial color={C.primary} />
      </mesh>
      {[-4.5, -1.5, 1.5, 4.5].map((x) => (
        <mesh key={x} position={[x, 2.2, 3.01]}>
          <planeGeometry args={[2, 1.6]} />
          <meshStandardMaterial color={C.glass} metalness={0.3} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[-9, 3, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 6, 6]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[-8.2, 5.4, 0]}>
        <boxGeometry args={[1.6, 1, 0.05]} />
        <meshStandardMaterial color={C.primary} emissive={C.primary} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

const LED_ROWS = 3;
const LED_COLS = 16;

/** Data center hall with blinking rack LEDs and rooftop cooling. */
function DataCenter() {
  const leds = useRef<InstancedMesh>(null);
  const positions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let r = 0; r < LED_ROWS; r++)
      for (let c = 0; c < LED_COLS; c++) out.push([-9 + c * 1.2, 1.3 + r * 1.1, 4.01]);
    return out;
  }, []);
  const o = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = leds.current;
    if (!mesh) return;
    positions.forEach((p, i) => {
      const on = Math.sin(clock.elapsedTime * (2 + (i % 5)) + i * 1.7) > -0.2;
      o.position.set(...p);
      o.scale.setScalar(on ? 1 : 0.001);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[1, 0, -LOT_DEPTH / 2 - 7.5]}>
      <mesh position-y={2.5} castShadow receiveShadow>
        <boxGeometry args={[22, 5, 8]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 2.5, 4.001]}>
        <planeGeometry args={[20, 4]} />
        <meshStandardMaterial color="#1f2937" roughness={0.4} />
      </mesh>
      <instancedMesh ref={leds} args={[undefined, undefined, positions.length]}>
        <boxGeometry args={[0.5, 0.18, 0.05]} />
        <meshBasicMaterial color="#4ade80" toneMapped={false} />
      </instancedMesh>
      {[-7, -2.5, 2, 6.5].map((x) => (
        <group key={x} position={[x, 5.4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3, 0.8, 3]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position-y={0.41} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[1.1, 16]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Parking lot at a gate: asphalt, painted slots, a gate arch and the building it belongs to. */
export const ParkingLot = memo(function ParkingLot({ lot, kind, active }: Props) {
  const accent = kind === 'client' ? C.primary : C.explore;
  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      <mesh position-y={0.15} receiveShadow>
        <boxGeometry args={[LOT_LENGTH, 0.3, LOT_DEPTH]} />
        <meshStandardMaterial color={C.asphaltLot} roughness={0.95} />
      </mesh>
      {/* Curb in the lot's accent colour so the two lots read differently. */}
      <mesh position-y={0.2}>
        <boxGeometry args={[LOT_LENGTH + 0.6, 0.25, LOT_DEPTH + 0.6]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={active ? 0.35 : 0.05}
        />
      </mesh>
      <mesh position-y={0.32}>
        <boxGeometry args={[LOT_LENGTH, 0.02, LOT_DEPTH]} />
        <meshStandardMaterial color={C.asphaltLot} roughness={0.95} />
      </mesh>
      <SlotLines />
      {/* Gate arch on the road side. */}
      <group position-x={-LOT_LENGTH / 2}>
        {[-1.8, 1.8].map((z) => (
          <mesh key={z} position={[0, 1.5, z]} castShadow>
            <boxGeometry args={[0.3, 3, 0.3]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        ))}
        <mesh position-y={3.1}>
          <boxGeometry args={[0.4, 0.5, 4]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
        </mesh>
      </group>
      {kind === 'client' ? <Campus /> : <DataCenter />}
    </group>
  );
});
