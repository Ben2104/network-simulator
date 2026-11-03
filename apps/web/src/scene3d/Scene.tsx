import { memo, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Car, Network, RouteResponse } from '@netsim/shared';
import { BFS_STEP_SEC, type Timeline } from '../sim/timeline';
import type { Phase } from '../sim/useSimulation';
import { CameraRig, type CameraMode } from './CameraRig';
import { Cars } from './Cars';
import { Ground } from './Ground';
import { Labels, type LabelItem } from './Labels';
import { C } from './palette';
import { ParkingLot } from './ParkingLot';
import { Road, type RoadState } from './Road';
import { Station, type StationState } from './Station';
import { buildWorld, carPath, LOT_LENGTH, type Vec2 } from './world';

export interface SceneProps {
  network: Network;
  phase: Phase;
  cars: readonly Car[];
  route: RouteResponse | null;
  timeline: Timeline | null;
  clockRef: { readonly current: number };
  visitedNodeIds: ReadonlySet<string>;
  pathNodeIds: ReadonlySet<string>;
  pathLinkIds: ReadonlySet<string>;
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  canToggle: boolean;
  onToggleNode: (id: string) => void;
  onToggleLink: (id: string) => void;
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
}

/**
 * 3D renderer. Same inputs as the 2D view (network, sim sets, shared timeline), so the two views
 * never disagree. React props carry scene state; per-frame motion reads `clockRef` in `useFrame`.
 */
export const Scene = memo(function Scene(props: SceneProps) {
  const { network, route, timeline, clockRef, phase } = props;
  const world = useMemo(() => buildWorld(network), [network]);

  const paths = useMemo(
    () => (timeline ? timeline.plans.map((p) => carPath(world, network, p)) : null),
    [timeline, world, network],
  );

  const visit = useMemo(() => {
    const m = new Map<string, { at: number; depth: number }>();
    route?.visitOrder.forEach((s, i) => m.set(s.nodeId, { at: i * BFS_STEP_SEC, depth: s.depth }));
    return m;
  }, [route]);

  const roadsAt = useMemo(() => {
    const m = new Map<string, Vec2[][]>();
    for (const l of network.links) {
      const curve = world.roads.get(l.id)!;
      for (const id of [l.source, l.target]) (m.get(id) ?? m.set(id, []).get(id)!).push(curve);
    }
    return m;
  }, [network, world]);

  const { disabledNodeIds, pathNodeIds, visitedNodeIds } = props;
  const stationState = useCallback(
    (id: string): StationState =>
      disabledNodeIds.has(id)
        ? 'broken'
        : pathNodeIds.has(id)
          ? 'path'
          : visitedNodeIds.has(id)
            ? 'visited'
            : 'idle',
    [disabledNodeIds, pathNodeIds, visitedNodeIds],
  );

  const roadState = (id: string): RoadState =>
    props.disabledLinkIds.has(id) ? 'broken' : props.pathLinkIds.has(id) ? 'path' : 'idle';

  const carCount = props.cars.length;
  const labels = useMemo(
    (): LabelItem[] =>
      network.nodes.map((n): LabelItem => {
        const p = world.pos.get(n.id)!;
        if (n.kind !== 'router') {
          const lot = n.kind === 'client' ? world.client : world.server;
          return {
            id: n.id,
            text: n.kind === 'client' ? 'CSULB Parking Lot' : 'US-West Data Center, Oregon',
            sub:
              n.kind === 'client'
                ? `Sender · ${carCount} car${carCount === 1 ? '' : 's'}`
                : 'Destination (server)',
            x: lot.center.x,
            y: 9,
            z: lot.center.z,
            priority: 100,
            tone: 'lot',
          };
        }
        const state = stationState(n.id);
        const v = visit.get(n.id);
        return {
          id: n.id,
          text: n.label,
          sub:
            state === 'broken'
              ? '✕ Offline'
              : phase === 'searching' && v && state === 'visited'
                ? `BFS depth ${v.depth}`
                : undefined,
          x: p.x,
          y: 7,
          z: p.z,
          priority: { broken: 80, path: 60, visited: 40, idle: 20 }[state],
          tone: state,
        };
      }),
    [network, world, stationState, visit, phase, carCount],
  );

  const overview = useMemo(
    () => [
      ...world.pos.values(),
      { x: world.client.gate.x + LOT_LENGTH, z: world.client.gate.z },
      { x: world.server.gate.x + LOT_LENGTH, z: world.server.gate.z },
    ],
    [world],
  );

  const carsHome = phase !== 'driving' && phase !== 'delivered';

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.5, far: 9000, position: [0, 900, 900] }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      aria-label="3D West Coast network map"
      data-testid="scene3d"
    >
      <color attach="background" args={[C.sky]} />
      <fog attach="fog" args={[C.sky, 2200, 5200]} />
      <hemisphereLight args={['#ffffff', '#cfe3d4', 1.1]} />
      <ambientLight intensity={0.25} />

      <Ground world={world} />
      {network.links.map((l) => (
        <Road
          key={l.id}
          id={l.id}
          curve={world.roads.get(l.id)!}
          state={roadState(l.id)}
          canToggle={props.canToggle}
          onToggle={props.onToggleLink}
        />
      ))}
      {network.nodes
        .filter((n) => n.kind === 'router')
        .map((n) => (
          <Station
            key={n.id}
            id={n.id}
            pos={world.pos.get(n.id)!}
            state={stationState(n.id)}
            visitAt={visit.get(n.id)?.at ?? null}
            clockRef={clockRef}
            roads={roadsAt.get(n.id) ?? []}
            canToggle={props.canToggle}
            onToggle={props.onToggleNode}
          />
        ))}
      <ParkingLot lot={world.client} kind="client" active={carsHome && props.cars.length > 0} />
      <ParkingLot lot={world.server} kind="server" active={phase === 'delivered'} />
      <Cars cars={props.cars} paths={paths} world={world} clockRef={clockRef} />
      <Labels items={labels} />

      <CameraRig
        mode={props.cameraMode}
        onUserControl={() => props.onCameraMode('free')}
        phase={phase}
        overview={overview}
        client={world.client}
        server={world.server}
        paths={paths}
        clockRef={clockRef}
      />
    </Canvas>
  );
});

export default Scene;
