import { memo, useMemo, useRef, useState } from 'react';
import { Html, Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  OctahedronGeometry,
  type BufferGeometry,
  type Group,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Car } from '@netsim/shared';
import { formatBytes } from '../ui/copy';
import { CAR_COLORS } from './palette';
import { parkedPose, poseAt, type CarPath, type Pose, type World } from './world';

/** Cars sit just above the road and lot surfaces. */
export const CAR_Y = 0.1;

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}

function tinted(g: BufferGeometry, hex: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const r = ((hex >> 16) & 255) / 255;
  const gg = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  for (let i = 0; i < n; i++) c.set([r, gg, b], i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

/** Low-poly hatchback facing +x, 2.4 long, wheels on y = 0. Parts share one transform. */
function carGeometries() {
  const body = mergeGeometries([
    box(2.4, 0.5, 1.1, 0, 0.45, 0),
    box(1.3, 0.46, 0.96, -0.2, 0.93, 0),
    box(0.5, 0.12, 1.0, 1.0, 0.72, 0),
  ])!;
  const glass = mergeGeometries([
    box(1.34, 0.3, 0.99, -0.2, 0.95, 0),
    box(0.06, 0.3, 0.86, 0.47, 0.93, 0),
  ])!;
  const wheels = mergeGeometries(
    [-0.75, 0.75].flatMap((x) =>
      [-0.5, 0.5].map((z) =>
        new CylinderGeometry(0.23, 0.23, 0.2, 12).rotateX(Math.PI / 2).translate(x, 0.23, z),
      ),
    ),
  )!;
  const lights = mergeGeometries([
    ...[-0.35, 0.35].map((z) => tinted(box(0.06, 0.14, 0.26, 1.21, 0.5, z), 0xfffbeb)),
    ...[-0.38, 0.38].map((z) => tinted(box(0.06, 0.12, 0.22, -1.21, 0.52, z), 0xef4444)),
  ])!;
  const beacon = new OctahedronGeometry(0.42, 0);
  return { body, glass, wheels, lights, beacon };
}

interface Props {
  cars: readonly Car[];
  /** One path per car once a route exists; null while parked before Send or with no route. */
  paths: readonly CarPath[] | null;
  world: World;
  clockRef: { readonly current: number };
}

type Ref = Object3D | null;

/**
 * Up to 24 packet cars. Each part (body, glass, wheels, lights, beacon) is one drei `<Instances>`
 * draw call. `useFrame` reads the sim clock and moves instances through refs; no React state is set
 * per frame. Beacons float above each car and grow with camera distance so cars stay visible in
 * the overview.
 */
export const Cars = memo(function Cars({ cars, paths, world, clockRef }: Props) {
  const geo = useMemo(carGeometries, []);
  const parts = useRef<Ref[][]>([[], [], [], []]);
  const beacons = useRef<Ref[]>([]);
  const tip = useRef<Group>(null);
  const [hover, setHover] = useState<number | null>(null);
  const poses = useRef<Pose[]>([]);

  useFrame(({ camera, clock }) => {
    const t = clockRef.current;
    cars.forEach((car, i) => {
      const path = paths?.[i];
      const pose = path ? poseAt(path, t) : parkedPose(world.client, car.seq);
      poses.current[i] = pose;
      for (const part of parts.current) {
        const o = part[i];
        if (!o) continue;
        o.position.set(pose.x, CAR_Y, pose.z);
        o.rotation.set(0, pose.heading, 0);
      }
      const b = beacons.current[i];
      if (b) {
        const d = camera.position.distanceTo(b.position);
        const s = Math.min(14, Math.max(1, d / 110));
        const bob = Math.sin(clock.elapsedTime * 3 + i) * 0.15 * s;
        b.position.set(pose.x, 2.2 + s * 0.9 + bob, pose.z);
        b.rotation.set(0, clock.elapsedTime * 2 + i, 0);
        b.scale.setScalar(s * (pose.status === 'driving' ? 1 : 0.7));
      }
    });
    if (tip.current && hover !== null && poses.current[hover]) {
      const p = poses.current[hover]!;
      tip.current.position.set(p.x, 3, p.z);
    }
  });

  const color = (seq: number) => CAR_COLORS[seq % CAR_COLORS.length]!;
  const instances = (k: number, extra?: (car: Car, i: number) => object) =>
    cars.map((car, i) => (
      <Instance
        key={car.id}
        ref={(el: Ref) => {
          parts.current[k]![i] = el;
        }}
        {...(extra?.(car, i) ?? {})}
      />
    ));

  const hovered = hover === null ? null : cars[hover];

  return (
    <group>
      <Instances limit={24} range={cars.length} castShadow>
        <primitive object={geo.body} attach="geometry" />
        <meshStandardMaterial roughness={0.35} metalness={0.25} />
        {instances(0, (car, i) => ({
          color: color(car.seq),
          onPointerOver: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            setHover(i);
          },
          onPointerOut: () => setHover((h) => (h === i ? null : h)),
        }))}
      </Instances>
      <Instances limit={24} range={cars.length}>
        <primitive object={geo.glass} attach="geometry" />
        <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.6} />
        {instances(1)}
      </Instances>
      <Instances limit={24} range={cars.length}>
        <primitive object={geo.wheels} attach="geometry" />
        <meshStandardMaterial color="#111827" roughness={0.8} />
        {instances(2)}
      </Instances>
      <Instances limit={24} range={cars.length}>
        <primitive object={geo.lights} attach="geometry" />
        <meshBasicMaterial vertexColors toneMapped={false} />
        {instances(3)}
      </Instances>
      <Instances limit={24} range={cars.length}>
        <primitive object={geo.beacon} attach="geometry" />
        <meshBasicMaterial toneMapped={false} />
        {cars.map((car, i) => (
          <Instance
            key={car.id}
            color={color(car.seq)}
            ref={(el: Ref) => {
              beacons.current[i] = el;
            }}
          />
        ))}
      </Instances>
      {hovered && (
        <group ref={tip}>
          <Html center className="car-tip" zIndexRange={[30, 20]}>
            <b>Car #{String(hovered.seq + 1).padStart(2, '0')}</b>
            <span>
              packets {hovered.firstPacket.toLocaleString('en-US')}–
              {hovered.lastPacket.toLocaleString('en-US')}
            </span>
            <span>{formatBytes(hovered.bytes)}</span>
          </Html>
        </group>
      )}
    </group>
  );
});
