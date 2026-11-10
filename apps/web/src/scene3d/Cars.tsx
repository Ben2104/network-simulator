import { memo, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  RingGeometry,
  OctahedronGeometry,
  BufferGeometry,
  Box3,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Car } from '@netsim/shared';
import { ModelOr, modelUrl } from './models';
import { CAR_COLORS, C } from './palette';
import { parkedPose, poseAt, type CarPath, type Pose, type World } from './world';

/** Cars sit just above the road and lot surfaces. */
export const CAR_Y = 0.1;
/** Index of the wheels in the per-part instance refs (body, glass, wheels, lights). */
const WHEELS = 2;
/** Car length in world units; the Kenney model is scaled to match the primitive hatchback. */
const CAR_LENGTH = 2.4;
/** Kenney Car Kit sedan. Every car shares it so each part stays one `<Instances>` draw call. */
const CAR_MODEL = modelUrl('car/sedan');

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
  // Pin stalk (unit height, base at y = 0) tying the beacon to its car, and a flat ground halo.
  const stalk = new CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0);
  const halo = new RingGeometry(1.5, 2.4, 32).rotateX(-Math.PI / 2);
  return { body, glass, wheels, lights, beacon, stalk, halo };
}

/**
 * Splits a Kenney car into instanceable parts, in the same frame as the primitive car (facing +x,
 * wheels on y = 0, CAR_LENGTH long). Kenney cars face +z and colour everything through one palette
 * texture; the body paint is the texture's second row (v in [0.25, 0.5)), so those triangles become
 * the `paint` part tinted per car, and the rest (windows, lights, trim) keeps the texture.
 */
export function carModelParts(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const paint: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];
  const wheels: BufferGeometry[] = [];
  let material: Material | null = null;
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    material ??= o.material as Material;
    const g = (o.geometry as BufferGeometry).toNonIndexed().applyMatrix4(o.matrixWorld);
    for (const name of ['tangent', 'color']) g.deleteAttribute(name);
    if (/wheel/i.test(o.name)) {
      wheels.push(g);
      return;
    }
    const [p, t] = splitByUv(g, (v) => v >= 0.25 && v < 0.5);
    paint.push(p);
    trim.push(t);
  });
  if (!material || !paint.length || !wheels.length)
    throw new Error('Car model needs a body and wheel meshes.');
  const merged = {
    paint: mergeGeometries(paint)!,
    trim: mergeGeometries(trim)!,
    wheels: mergeGeometries(wheels)!,
  };
  const all = mergeGeometries([merged.paint, merged.trim, merged.wheels])!;
  const box = new Box3().setFromBufferAttribute(all.getAttribute('position') as BufferAttribute);
  const s = CAR_LENGTH / (box.max.z - box.min.z);
  const cx = (box.max.x + box.min.x) / 2;
  const cz = (box.max.z + box.min.z) / 2;
  for (const g of Object.values(merged))
    g.translate(-cx, -box.min.y, -cz)
      .scale(s, s, s)
      .rotateY(Math.PI / 2);
  all.dispose();
  return { ...merged, material: material! };
}

/** Splits a non-indexed geometry into triangles whose UV centroid passes `test`, and the rest. */
function splitByUv(
  g: BufferGeometry,
  test: (v: number) => boolean,
): [BufferGeometry, BufferGeometry] {
  const uv = g.getAttribute('uv');
  const names = Object.keys(g.attributes);
  const keep: number[][] = [[], []];
  for (let i = 0; i < uv.count; i += 3) {
    const v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
    keep[test(v) ? 0 : 1]!.push(i);
  }
  return keep.map((tris) => {
    const out = new BufferGeometry();
    for (const name of names) {
      const a = g.getAttribute(name);
      const data = new Float32Array(tris.length * 3 * a.itemSize);
      tris.forEach((start, k) => {
        for (let j = 0; j < 3; j++)
          for (let c = 0; c < a.itemSize; c++)
            data[(k * 3 + j) * a.itemSize + c] = a.getComponent(start + j, c);
      });
      out.setAttribute(name, new BufferAttribute(data, a.itemSize));
    }
    return out;
  }) as [BufferGeometry, BufferGeometry];
}

/** Builds the model's parts once per loaded scene and hands them to `render`. */
function ModelCar({
  scene,
  render,
}: {
  scene: Object3D;
  render: (parts: ReturnType<typeof carModelParts>) => ReactNode;
}) {
  const parts = useMemo(() => carModelParts(scene), [scene]);
  return <>{render(parts)}</>;
}

/** Moves the DOM tooltip to a screen point (outside the component: it writes to the DOM). */
function placeTip(tip: HTMLElement, x: number, y: number) {
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -120%)`;
}

interface Props {
  cars: readonly Car[];
  /** One path per car once a route exists; null while parked before Send or with no route. */
  paths: readonly CarPath[] | null;
  world: World;
  clockRef: { readonly current: number };
  hover: number | null;
  onHover: (i: number | null) => void;
  /** DOM tooltip for the hovered car; positioned here each frame. */
  tipEl: RefObject<HTMLDivElement | null>;
}

type Ref = Object3D | null;

/**
 * Up to 24 packet cars. Each part (body, glass, wheels, lights, beacon) is one drei `<Instances>`
 * draw call. `useFrame` reads the sim clock and moves instances through refs; no React state is set
 * per frame. Beacons float above each car on a stalk and grow with camera distance so cars stay
 * visible in the overview; driving cars also get a pulsing ground halo in their colour.
 */
export const Cars = memo(function Cars(props: Props) {
  const { cars, paths, world, clockRef, hover, onHover, tipEl } = props;
  const geo = useMemo(() => carGeometries(), []);
  const parts = useRef<Ref[][]>([[], [], [], []]);
  const beacons = useRef<Ref[]>([]);
  const stalks = useRef<Ref[]>([]);
  const halos = useRef<Ref[]>([]);
  const poses = useRef<Pose[]>([]);
  const v = useMemo(() => new Vector3(), []);

  useFrame(({ camera, clock, size }) => {
    const t = clockRef.current;
    cars.forEach((car, i) => {
      const path = paths?.[i];
      const pose = path ? poseAt(path, t) : parkedPose(world.client, car.seq);
      poses.current[i] = pose;
      parts.current.forEach((part, k) => {
        const o = part[i];
        if (!o) return;
        o.position.set(pose.x, CAR_Y, pose.z);
        if (import.meta.env.DEV && k === 0) {
          o.userData.packetCarId = car.id;
          o.userData.packetStatus = pose.status;
        }
        // Yaw first, then lean around the car's own forward (x) axis and pitch around its z.
        // Wheels stay flat on the road; only the body, glass and lights lean.
        if (k === WHEELS) o.rotation.set(0, pose.heading, 0, 'YXZ');
        else o.rotation.set(pose.roll, pose.heading, pose.pitch, 'YXZ');
      });
      const b = beacons.current[i];
      const driving = pose.status === 'driving';
      const blocked = pose.status === 'blocked';
      if (b) {
        const d = camera.position.distanceTo(b.position);
        const s = Math.min(18, Math.max(1.4, d / 85));
        const bob = Math.sin(clock.elapsedTime * 3 + i) * 0.15 * s;
        const top = 2.2 + s * 1.2 + bob;
        b.position.set(pose.x, top, pose.z);
        b.rotation.set(0, clock.elapsedTime * 2 + i, 0);
        b.scale.setScalar(s * (driving || blocked ? 1 : 0.7));
        if ('color' in b)
          (b.color as { set: (value: string) => void }).set(
            blocked ? C.danger : CAR_COLORS[car.seq % CAR_COLORS.length]!,
          );
        const st = stalks.current[i];
        if (st) {
          st.position.set(pose.x, 1, pose.z);
          st.scale.set(driving ? s : 0, Math.max(0, top - 1), driving ? s : 0);
        }
        const h = halos.current[i];
        if (h) {
          h.position.set(pose.x, CAR_Y + 0.05, pose.z);
          const pulse = 1 + Math.sin(clock.elapsedTime * 5 + i) * 0.12;
          h.scale.setScalar(driving || blocked ? Math.max(1, s * 0.45) * pulse : 0);
          if ('color' in h)
            (h.color as { set: (value: string) => void }).set(
              blocked ? C.danger : CAR_COLORS[car.seq % CAR_COLORS.length]!,
            );
        }
      }
    });
    const tip = tipEl.current;
    if (tip && hover !== null && poses.current[hover]) {
      const p = poses.current[hover]!;
      v.set(p.x, 2, p.z).project(camera);
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      placeTip(tip, sx, sy);
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

  const bodyEvents = (car: Car, i: number) => ({
    color: color(car.seq),
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHover(i);
    },
    onPointerOut: () => onHover(null),
  });

  // Primitive hatchback: shown while the Kenney model loads and kept if it fails.
  const primitiveCar = (
    <>
      <Instances limit={24} range={cars.length} frustumCulled={false} castShadow>
        <primitive object={geo.body} attach="geometry" />
        <meshStandardMaterial roughness={0.35} metalness={0.25} />
        {instances(0, bodyEvents)}
      </Instances>
      <Instances limit={24} range={cars.length} frustumCulled={false}>
        <primitive object={geo.glass} attach="geometry" />
        <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.6} />
        {instances(1)}
      </Instances>
      <Instances limit={24} range={cars.length} frustumCulled={false}>
        <primitive object={geo.wheels} attach="geometry" />
        <meshStandardMaterial color="#111827" roughness={0.8} />
        {instances(2)}
      </Instances>
      <Instances limit={24} range={cars.length} frustumCulled={false}>
        <primitive object={geo.lights} attach="geometry" />
        <meshBasicMaterial vertexColors toneMapped={false} />
        {instances(3)}
      </Instances>
    </>
  );

  return (
    <group>
      <ModelOr url={CAR_MODEL} fallback={primitiveCar}>
        {(scene) => (
          <ModelCar
            scene={scene}
            render={(m) => (
              <>
                {/* Paint in the car's colour; trim and wheels keep the kit's palette texture. */}
                <Instances limit={24} range={cars.length} frustumCulled={false} castShadow>
                  <primitive object={m.paint} attach="geometry" />
                  <meshStandardMaterial roughness={0.35} metalness={0.25} />
                  {instances(0, bodyEvents)}
                </Instances>
                <Instances limit={24} range={cars.length} frustumCulled={false} castShadow>
                  <primitive object={m.trim} attach="geometry" />
                  <primitive object={m.material} attach="material" />
                  {instances(1)}
                </Instances>
                <Instances limit={24} range={cars.length} frustumCulled={false}>
                  <primitive object={m.wheels} attach="geometry" />
                  <primitive object={m.material} attach="material" />
                  {instances(2)}
                </Instances>
              </>
            )}
          />
        )}
      </ModelOr>
      <Instances limit={24} range={cars.length} frustumCulled={false}>
        <primitive object={geo.stalk} attach="geometry" />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} toneMapped={false} />
        {cars.map((car, i) => (
          <Instance
            key={car.id}
            ref={(el: Ref) => {
              stalks.current[i] = el;
            }}
          />
        ))}
      </Instances>
      <Instances limit={24} range={cars.length} frustumCulled={false}>
        <primitive object={geo.halo} attach="geometry" />
        <meshBasicMaterial transparent opacity={0.8} depthWrite={false} toneMapped={false} />
        {cars.map((car, i) => (
          <Instance
            key={car.id}
            color={color(car.seq)}
            ref={(el: Ref) => {
              halos.current[i] = el;
            }}
          />
        ))}
      </Instances>
      <Instances limit={24} range={cars.length} frustumCulled={false}>
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
    </group>
  );
});
