import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Shape,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  type Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C } from './palette';
import {
  features,
  groundRgb,
  LAND_BOUNDS,
  NETWORK_STATES,
  placeLakes,
  placePeaks,
  polygons,
  scatterProps,
  type Feature,
  type Lake,
  type Peak,
  type Prop,
  type PropKind,
  type Ring,
} from './scenery';
import { rng, toWorld, type World } from './world';

const LAND_DEPTH = 3;

/**
 * Land texture painted once from the biome map (`groundRgb`). Extruded shapes get their top-face
 * UVs from shape coordinates, which are world (x, −z); repeat/offset map that rectangle to 0–1.
 */
function useLandTexture(): CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const { minLat, maxLat, minLon, maxLon } = LAND_BOUNDS;
    const sw = toWorld(minLat, minLon);
    const ne = toWorld(maxLat, maxLon);
    const u0 = sw.x;
    const u1 = ne.x;
    const v0 = -sw.z;
    const v1 = -ne.z;
    const w = 640;
    const h = Math.round((w * (v1 - v0)) / (u1 - u0));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      const lat = maxLat - ((j + 0.5) / h) * (maxLat - minLat);
      for (let i = 0; i < w; i++) {
        const lon = minLon + ((i + 0.5) / w) * (maxLon - minLon);
        const [r, g, b] = groundRgb(lat, lon);
        const k = (j * w + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    tex.repeat.set(1 / (u1 - u0), 1 / (v1 - v0));
    tex.offset.set(-u0 / (u1 - u0), -v0 / (v1 - v0));
    return tex;
  }, []);
}

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

function State({ feature, map }: { feature: Feature; map: CanvasTexture | null }) {
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(polygons(feature).map(toShape), {
        depth: LAND_DEPTH,
        bevelEnabled: false,
      }),
    [feature],
  );
  const inNetwork = NETWORK_STATES.has(feature.properties.postal);
  // Context states (outside the network) are dimmed a touch so the network area reads first.
  const tint = inNetwork ? '#ffffff' : '#e3e8e4';
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-LAND_DEPTH} receiveShadow>
      <meshStandardMaterial
        attach="material-0"
        color={map ? tint : inNetwork ? C.mapGround : C.outside}
        map={map}
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

/** Writes matrices (and optional colours) into an instanced mesh after mount. */
function useInstances(
  ref: RefObject<InstancedMesh | null>,
  count: number,
  place: (o: Object3D, i: number) => void,
  color?: (i: number) => Color,
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    for (let i = 0; i < count; i++) {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      place(o, i);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (color) mesh.setColorAt(i, color(i));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, count, place, color]);
}

const unitCone = new ConeGeometry(1, 1, 7).translate(0, 0.5, 0);

/**
 * Mountain ranges and volcanoes as low-poly cones, stretched along their range (Sierra Nevada,
 * Cascades, Basin and Range, Rockies). Scenery only: BFS ignores terrain.
 */
function Mountains({ peaks }: { peaks: Peak[] }) {
  const rock = useRef<InstancedMesh>(null);
  const snow = useRef<InstancedMesh>(null);
  const snowy = useMemo(() => peaks.filter((p) => p.snow), [peaks]);
  const placeRock = useMemo(
    () => (o: Object3D, i: number) => {
      const p = peaks[i]!;
      o.position.set(p.x, 0, p.z);
      o.rotation.y = p.yaw;
      o.scale.set(p.r * p.stretch, p.h, p.r);
    },
    [peaks],
  );
  const rockColor = useMemo(() => (i: number) => new Color(peaks[i]!.color), [peaks]);
  const placeSnow = useMemo(
    () => (o: Object3D, i: number) => {
      const p = snowy[i]!;
      o.position.set(p.x, p.h * 0.64, p.z);
      o.rotation.y = p.yaw;
      o.scale.set(p.r * p.stretch * 0.37, p.h * 0.37, p.r * 0.37);
    },
    [snowy],
  );
  useInstances(rock, peaks.length, placeRock, rockColor);
  useInstances(snow, snowy.length, placeSnow);
  return (
    <>
      <instancedMesh
        ref={rock}
        args={[unitCone, undefined, peaks.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial flatShading roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={snow} args={[unitCone, undefined, snowy.length]} frustumCulled={false}>
        <meshStandardMaterial color={C.snow} flatShading roughness={0.8} />
      </instancedMesh>
    </>
  );
}

function Lakes({ lakes }: { lakes: Lake[] }) {
  return (
    <>
      {lakes.map((l, i) => (
        <group key={i} position={[l.x, 0.04, l.z]} rotation-y={l.yaw}>
          <mesh rotation-x={-Math.PI / 2} scale={[l.rx + 0.5, l.rz + 0.5, 1]}>
            <circleGeometry args={[1, 24]} />
            <meshStandardMaterial color="#d9ead0" roughness={1} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.02} scale={[l.rx, l.rz, 1]}>
            <circleGeometry args={[1, 24]} />
            <meshStandardMaterial color="#9fcbe0" roughness={0.3} metalness={0.1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** One instanced part of a prop kind (e.g. pine crowns), coloured per instance. */
interface PartSpec {
  geometry: BufferGeometry;
  /** Two shades mixed by each prop's `tint`. */
  colors: [string, string];
  shadow?: boolean;
}

function makeParts(): Record<PropKind, PartSpec[]> {
  const saguaro = mergeGeometries([
    new CylinderGeometry(0.22, 0.26, 2.4, 6).translate(0, 1.2, 0),
    new CylinderGeometry(0.15, 0.15, 0.7, 5).rotateZ(Math.PI / 2).translate(0.42, 1.1, 0),
    new CylinderGeometry(0.15, 0.15, 0.8, 5).translate(0.74, 1.5, 0),
    new CylinderGeometry(0.13, 0.13, 0.5, 5).rotateZ(Math.PI / 2).translate(-0.36, 1.5, 0),
    new CylinderGeometry(0.13, 0.13, 0.6, 5).translate(-0.6, 1.8, 0),
  ])!;
  return {
    pine: [
      {
        geometry: new ConeGeometry(0.9, 2.6, 6).translate(0, 1.6, 0),
        colors: [C.pine, C.pineDark],
        shadow: true,
      },
      {
        geometry: new CylinderGeometry(0.15, 0.2, 0.8, 5).translate(0, 0.4, 0),
        colors: [C.trunk, C.trunk],
      },
    ],
    broadleaf: [
      {
        geometry: new IcosahedronGeometry(1.05, 0).scale(1, 0.85, 1).translate(0, 2, 0),
        colors: ['#6aa35e', '#93b85c'],
        shadow: true,
      },
      {
        geometry: new CylinderGeometry(0.14, 0.2, 1.3, 5).translate(0, 0.65, 0),
        colors: [C.trunk, C.trunk],
      },
    ],
    shrub: [
      {
        geometry: new DodecahedronGeometry(0.55, 0).scale(1, 0.6, 1).translate(0, 0.28, 0),
        colors: ['#9caf86', '#bdb98c'],
      },
    ],
    cactus: [{ geometry: saguaro, colors: ['#5e8f5c', '#6f9d63'], shadow: true }],
    rock: [
      {
        geometry: new DodecahedronGeometry(0.6, 0).scale(1, 0.65, 1).translate(0, 0.2, 0),
        colors: ['#a8a29e', '#c7b49b'],
      },
    ],
  };
}

function PropPart({ items, spec }: { items: Prop[]; spec: PartSpec }) {
  const ref = useRef<InstancedMesh>(null);
  const place = useMemo(
    () => (o: Object3D, i: number) => {
      const p = items[i]!;
      o.position.set(p.x, 0, p.z);
      o.rotation.y = p.r;
      o.scale.setScalar(p.s);
    },
    [items],
  );
  const color = useMemo(() => {
    const a = new Color(spec.colors[0]);
    const b = new Color(spec.colors[1]);
    return (i: number) => a.clone().lerp(b, items[i]!.tint);
  }, [items, spec]);
  useInstances(ref, items.length, place, color);
  return (
    <instancedMesh
      ref={ref}
      args={[spec.geometry, undefined, items.length]}
      castShadow={spec.shadow}
      frustumCulled={false}
    >
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
  );
}

/** Trees, shrubs, cacti and rocks, each kind one or two instanced draw calls. */
function Vegetation({ props }: { props: Prop[] }) {
  const parts = useMemo(() => makeParts(), []);
  const byKind = useMemo(() => {
    const m = new Map<PropKind, Prop[]>();
    for (const p of props) (m.get(p.kind) ?? m.set(p.kind, []).get(p.kind)!).push(p);
    return m;
  }, [props]);
  return (
    <>
      {[...byKind].flatMap(([kind, items]) =>
        parts[kind].map((spec, i) => <PropPart key={`${kind}-${i}`} items={items} spec={spec} />),
      )}
    </>
  );
}

const CLOUDS = 16;

/**
 * Soft low-poly clouds drifting east. They fade out when the camera is high, so they never hide
 * the network in the overview, and they cast no shadows.
 */
function Clouds() {
  const group = useRef<Group>(null);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        flatShading: true,
      }),
    [],
  );
  const { geometry, clouds, span } = useMemo(() => {
    const rand = rng(77);
    const puff = (x: number, y: number, z: number, r: number) =>
      new IcosahedronGeometry(r, 1).scale(1, 0.6, 1).translate(x, y, z);
    const geometry = mergeGeometries([
      puff(0, 0, 0, 7),
      puff(6, -0.8, 1.5, 5),
      puff(-6, -1, -1, 5.5),
      puff(2, 1.5, -3, 4.5),
      puff(-2.5, 0.5, 3.5, 4),
    ])!;
    const sw = toWorld(LAND_BOUNDS.minLat, LAND_BOUNDS.minLon);
    const ne = toWorld(LAND_BOUNDS.maxLat, LAND_BOUNDS.maxLon);
    const clouds = Array.from({ length: CLOUDS }, () => ({
      x: sw.x + rand() * (ne.x - sw.x),
      y: 70 + rand() * 30,
      z: ne.z + rand() * (sw.z - ne.z),
      s: 0.8 + rand() * 1.1,
      speed: 2 + rand() * 3,
    }));
    return { geometry, clouds, span: { x0: sw.x - 60, x1: ne.x + 60 } };
  }, []);

  useFrame(({ camera }, delta) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      c.position.x += clouds[i]!.speed * Math.min(delta, 0.1);
      if (c.position.x > span.x1) c.position.x = span.x0;
    });
    // All clouds share one material; reach it through the scene graph, not the memo value.
    const fade = Math.min(1, Math.max(0, (camera.position.y - 250) / 900));
    const first = g.children[0] as Mesh | undefined;
    if (first) (first.material as MeshStandardMaterial).opacity = 0.75 - fade * 0.5;
  });

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={[c.x, c.y, c.z]}
          scale={c.s}
          rotation-y={i}
          renderOrder={2}
        />
      ))}
    </group>
  );
}

/**
 * West Coast land from Natural Earth (public domain) painted with biomes (forest, Central Valley
 * farmland, Mojave, Great Basin, high desert, red rock), plus ocean, ranges, lakes, vegetation
 * and clouds. Placement lives in `scenery.ts` (pure, unit-tested).
 */
export function Ground({ world }: { world: World }) {
  const map = useLandTexture();
  const peaks = useMemo(() => placePeaks(world), [world]);
  const lakes = useMemo(() => placeLakes(world), [world]);
  const props = useMemo(() => scatterProps(world, lakes), [world, lakes]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-1.2} receiveShadow>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={C.ocean} roughness={0.6} metalness={0.05} />
      </mesh>
      {features.map((f) => (
        <State key={f.properties.postal} feature={f} map={map} />
      ))}
      <Borders />
      <Lakes lakes={lakes} />
      <Mountains peaks={peaks} />
      <Vegetation props={props} />
      <Clouds />
    </group>
  );
}
