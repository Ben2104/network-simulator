import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3, type DirectionalLight } from 'three';
import type { Phase } from '../sim/useSimulation';
import { bounds, leadCar, poseAt, type CarPath, type Lot, type Vec2 } from './world';

/**
 * `auto` directs the camera by phase (lot close-up after Submit, overview while BFS searches,
 * follow the lead car while driving, Oregon lot on delivery). `overview` frames the whole network.
 * `follow` chases the lead car. Any drag or scroll switches to `free` so the user stays in control.
 */
export type CameraMode = 'auto' | 'overview' | 'follow' | 'free';

/** Imperative handle for the zoom buttons outside the canvas. */
export interface RigApi {
  /** Multiplies the camera's distance to its target (< 1 zooms in). Switches to free. */
  zoom: (factor: number) => void;
}

interface Props {
  mode: CameraMode;
  onUserControl: () => void;
  phase: Phase;
  /** Points the overview must keep in frame (stations and lots). */
  overview: readonly Vec2[];
  client: Lot;
  server: Lot;
  paths: readonly CarPath[] | null;
  clockRef: { readonly current: number };
  apiRef: { current: RigApi | null };
}

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
type Shot = {
  target: Vector3;
  eye: Vector3;
  rate: number;
  /** Follow shots: the car being chased, so the camera can ride along with it exactly. */
  lead?: number;
};

/** View direction for wide shots: from the south-south-east, looking down at about 50°. */
const AZIMUTH = 0.32;
const ELEVATION = 0.9;

/**
 * Frames every point: projects them through a camera looking from the wide-shot direction, then
 * binary-searches the distance and re-centres the target until the projected box fits inside
 * the view with margins (more at the top, where the camera bar sits). Tilt makes the near
 * (south) side take more screen space, which a bounding circle alone misjudges.
 */
function overviewShot(points: readonly Vec2[], fov: number, aspect: number): Shot {
  const cam = new PerspectiveCamera(fov, aspect, 1, 50000);
  const dir = new Vector3(
    Math.sin(AZIMUTH) * Math.cos(ELEVATION),
    Math.sin(ELEVATION),
    Math.cos(AZIMUTH) * Math.cos(ELEVATION),
  );
  const { center, radius } = bounds(points);
  const target = new Vector3(center.x, 0, center.z);
  const v = new Vector3();
  const box = (d: number) => {
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      v.set(p.x, 0, p.z).project(cam);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    return { x0, x1, y0, y1 };
  };
  let d = radius * 3;
  for (let round = 0; round < 4; round++) {
    // Re-centre: aim at the ground point under the projected box's centre.
    const b = box(d);
    v.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0.5).unproject(cam);
    const ray = v.sub(cam.position).normalize();
    const t = -cam.position.y / ray.y;
    target.set(cam.position.x + ray.x * t, 0, cam.position.z + ray.z * t);
    let lo = radius * 0.2;
    let hi = radius * 12;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const b = box(mid);
      // Extra room at the top for the camera bar and the Oregon label.
      if (Math.max(-b.x0 / 0.88, b.x1 / 0.88, -b.y0 / 0.9, b.y1 / 0.74) > 1) lo = mid;
      else hi = mid;
    }
    d = hi;
  }
  return { target, eye: target.clone().addScaledVector(dir, d), rate: 1.6 };
}

function lotShot(lot: Lot): Shot {
  const target = new Vector3(lot.center.x - 2, 0, lot.center.z);
  return { target, eye: target.clone().add(new Vector3(-12, 17, 24)), rate: 1.8 };
}

export function CameraRig(props: Props) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const overview = useMemo(
    () => overviewShot(props.overview, camera.fov, aspect),
    [props.overview, camera.fov, aspect],
  );
  const clientShot = useMemo(() => lotShot(props.client), [props.client]);
  const serverShot = useMemo(() => lotShot(props.server), [props.server]);
  const scratch = useMemo(() => ({ target: new Vector3(), eye: new Vector3() }), []);
  const placed = useRef(false);

  // Start on the overview without a fly-in.
  useEffect(() => {
    if (placed.current) return;
    placed.current = true;
    camera.position.copy(overview.eye);
    controls.current?.target.copy(overview.target);
    controls.current?.update();
  }, [camera, overview]);

  const { apiRef, onUserControl } = props;
  useEffect(() => {
    apiRef.current = {
      zoom: (factor) => {
        const c = controls.current;
        if (!c) return;
        onUserControl();
        const offset = camera.position.clone().sub(c.target).multiplyScalar(factor);
        const len = Math.min(3000, Math.max(6, offset.length()));
        camera.position.copy(c.target).add(offset.setLength(len));
        c.update();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, camera, onUserControl]);

  const followShot = (): Shot | null => {
    const paths = props.paths;
    if (!paths || paths.length === 0) return null;
    const t = props.clockRef.current;
    const i = leadCar(paths, t);
    if (i < 0) return t < paths[0]!.departAt ? clientShot : serverShot;
    const p = poseAt(paths[i]!, t);
    const fx = Math.cos(p.heading);
    const fz = -Math.sin(p.heading);
    scratch.target.set(p.x + fx * 8, 0, p.z + fz * 8);
    scratch.eye.set(p.x - fx * 34, 19, p.z - fz * 34);
    return { target: scratch.target, eye: scratch.eye, rate: 2.2, lead: i };
  };

  const shotFor = (): Shot | null => {
    switch (props.mode) {
      case 'free':
        return null;
      case 'overview':
        return overview;
      case 'follow':
        return followShot() ?? clientShot;
      case 'auto':
        switch (props.phase) {
          case 'loaded':
          case 'routing':
            return clientShot;
          case 'driving':
            return followShot() ?? overview;
          case 'delivered':
            return serverShot;
          case 'error':
            return null;
          default:
            return overview;
        }
    }
  };

  const ride = useRef<{ lead: number; at: Vector3 } | null>(null);
  const delta = useMemo(() => new Vector3(), []);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const shot = shotFor();
    // Easing alone lags far behind a fast car, so while chasing the same car the camera first
    // moves with it, then eases toward the chase angle.
    const prev = ride.current;
    if (shot?.lead !== undefined && prev?.lead === shot.lead) {
      delta.subVectors(shot.target, prev.at);
      camera.position.add(delta);
      c.target.add(delta);
      prev.at.copy(shot.target);
    } else {
      ride.current = shot?.lead !== undefined ? { lead: shot.lead, at: shot.target.clone() } : null;
    }
    if (!shot) return;
    // Clamp: timers can jump (tab sleep, clock changes); a negative dt would fling the camera.
    const k = 1 - Math.exp(-Math.min(Math.max(dt, 0), 0.1) * shot.rate);
    camera.position.lerp(shot.eye, k);
    c.target.lerp(shot.target, k);
    c.update();
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={3000}
        maxPolarAngle={1.42}
        onStart={props.onUserControl}
      />
      <Sun />
    </>
  );
}

/** Sunlight whose shadow box follows the orbit target, so shadows stay crisp wherever you look. */
function Sun() {
  const light = useRef<DirectionalLight>(null);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useFrame(({ camera }) => {
    const l = light.current;
    if (!l || !controls) return;
    const t = controls.target;
    // Widen the shadow box when zoomed out, keep it tight (sharp) up close.
    const span = Math.min(260, Math.max(40, camera.position.distanceTo(t) * 0.7));
    const cam = l.shadow.camera;
    if (cam.right !== span) {
      cam.left = -span;
      cam.right = span;
      cam.top = span;
      cam.bottom = -span;
      cam.updateProjectionMatrix();
    }
    l.position.set(t.x - 60, 120, t.z + 40);
    l.target.position.copy(t);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={2.2}
      color="#fff7e6"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
      shadow-camera-near={1}
      shadow-camera-far={400}
    />
  );
}
