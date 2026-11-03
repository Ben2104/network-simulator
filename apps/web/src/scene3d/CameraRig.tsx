import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type DirectionalLight, type PerspectiveCamera } from 'three';
import type { Phase } from '../sim/useSimulation';
import { bounds, leadCar, poseAt, type CarPath, type Lot, type Vec2 } from './world';

/**
 * `auto` directs the camera by phase (lot close-up after Submit, overview while BFS searches,
 * follow the lead car while driving, Oregon lot on delivery). `overview` frames the whole network.
 * `follow` chases the lead car. Any drag or scroll switches to `free` so the user stays in control.
 */
export type CameraMode = 'auto' | 'overview' | 'follow' | 'free';

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
}

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
type Shot = { target: Vector3; eye: Vector3; rate: number };

/** View direction for wide shots: from the south-south-east, looking down at about 50°. */
const AZIMUTH = 0.32;
const ELEVATION = 0.9;

function overviewShot(points: readonly Vec2[], fov: number, aspect: number): Shot {
  const { center, radius } = bounds(points);
  const half = (fov * Math.PI) / 360;
  // Fit the bounding circle in the tighter of the two frustum dimensions.
  const fit = Math.min(Math.tan(half), Math.tan(half) * aspect);
  const d = (radius / fit) * 0.92;
  const target = new Vector3(center.x, 0, center.z - radius * 0.06);
  const eye = target
    .clone()
    .add(
      new Vector3(
        Math.sin(AZIMUTH) * Math.cos(ELEVATION),
        Math.sin(ELEVATION),
        Math.cos(AZIMUTH) * Math.cos(ELEVATION),
      ).multiplyScalar(d),
    );
  return { target, eye, rate: 1.6 };
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

  const followShot = (): Shot | null => {
    const paths = props.paths;
    if (!paths || paths.length === 0) return null;
    const t = props.clockRef.current;
    const i = leadCar(paths, t);
    if (i < 0) return t < paths[0]!.departAt ? clientShot : serverShot;
    const p = poseAt(paths[i]!, t);
    const fx = Math.cos(p.heading);
    const fz = -Math.sin(p.heading);
    scratch.target.set(p.x + fx * 6, 0, p.z + fz * 6);
    scratch.eye.set(p.x - fx * 26, 15, p.z - fz * 26);
    return { target: scratch.target, eye: scratch.eye, rate: 2.6 };
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

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const shot = shotFor();
    if (!shot) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * shot.rate);
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
