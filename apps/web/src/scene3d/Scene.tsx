import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Car, Network, RouteResponse } from '@netsim/shared';
import { BFS_STEP_SEC, carStatus, type Timeline } from '../sim/timeline';
import type { Phase } from '../sim/useSimulation';
import { CameraRig, type CameraMode, type RigApi } from './CameraRig';
import { Cars } from './Cars';
import { Ground } from './Ground';
import { LabelLayer, LabelTracker, type LabelEls, type LabelItem } from './Labels';
import { formatBytes } from '../ui/copy';
import { C } from './palette';
import { ParkingLot } from './ParkingLot';
import { Road, type RoadState } from './Road';
import { Station, type StationState } from './Station';
import { buildWorld, carPath, LOT_LENGTH, passTime, type Vec2 } from './world';

const NO_PASSES: readonly number[] = [];

export interface SceneProps {
  network: Network;
  previewRoadId: string | null;
  previewNodeId: string | null;
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  onToggleNode?: (id: string) => void;
  phase: Phase;
  counts: { waiting: number; blocked: number; arrived: number };
  cars: readonly Car[];
  route: RouteResponse | null;
  timeline: Timeline | null;
  clockRef: { readonly current: number };
  visitedNodeIds: ReadonlySet<string>;
  pathNodeIds: ReadonlySet<string>;
  pathLinkIds: ReadonlySet<string>;
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
  rigRef: { current: RigApi | null };
}

/**
 * 3D renderer. Same inputs as the 2D view (network, sim sets, shared timeline), so the two views
 * never disagree. React props carry scene state; per-frame motion reads `clockRef` in `useFrame`.
 */
export const Scene = memo(function Scene(props: SceneProps) {
  const { network, route, timeline, clockRef, phase } = props;
  const world = useMemo(() => buildWorld(network), [network]);
  const previewNodePos = props.previewNodeId ? world.pos.get(props.previewNodeId) : null;
  const lots = useMemo(() => [world.client, world.server], [world]);
  const labelEls = useRef<LabelEls>(new Map());
  const tipEl = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hovered = hover === null ? null : props.cars[hover];
  const { onCameraMode } = props;
  const toFree = useCallback(() => onCameraMode('free'), [onCameraMode]);

  const paths = useMemo(
    () => (timeline ? timeline.plans.map((p) => carPath(world, network, p)) : null),
    [timeline, world, network],
  );

  const visit = useMemo(() => {
    const m = new Map<string, { at: number; depth: number }>();
    route?.visitOrder.forEach((s, i) => m.set(s.nodeId, { at: i * BFS_STEP_SEC, depth: s.depth }));
    return m;
  }, [route]);

  /** Per station on any car's route, the sim times cars drive past it (ascending), for the pass effects. */
  const passes = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!timeline || !paths) return m;
    timeline.plans.forEach((plan, i) => {
      for (const [k, id] of plan.route.nodeIds.entries()) {
        const at = world.pos.get(id);
        if (at)
          (m.get(id) ?? m.set(id, []).get(id)!).push(
            plan.nodeTimes?.[k] ?? passTime(paths[i]!, at),
          );
      }
    });
    for (const times of m.values()) times.sort((a, b) => a - b);
    return m;
  }, [timeline, paths, world]);

  const roadsAt = useMemo(() => {
    const m = new Map<string, Vec2[][]>();
    for (const l of network.links) {
      const curve = world.roads.get(l.id)!;
      for (const id of [l.source, l.target]) (m.get(id) ?? m.set(id, []).get(id)!).push(curve);
    }
    return m;
  }, [network, world]);

  const { pathNodeIds, visitedNodeIds } = props;
  const stationState = useCallback(
    (id: string): StationState =>
      props.disabledNodeIds.has(id)
        ? 'offline'
        : pathNodeIds.has(id)
          ? 'path'
          : visitedNodeIds.has(id)
            ? 'visited'
            : 'idle',
    [pathNodeIds, visitedNodeIds, props.disabledNodeIds],
  );

  const roadState = (id: string): RoadState =>
    props.disabledLinkIds.has(id) ? 'offline' : props.pathLinkIds.has(id) ? 'path' : 'idle';

  const carCount = props.cars.length;
  const labels = useMemo(
    (): LabelItem[] =>
      network.nodes.map((n): LabelItem => {
        const p = world.pos.get(n.id)!;
        if (n.kind !== 'router') {
          const lot = n.kind === 'client' ? world.client : world.server;
          return {
            id: n.id,
            // Same wording as the 2D view and the Figma v2 frames.
            text:
              n.kind === 'client'
                ? 'Sender: CSULB parking lot'
                : 'Destination: US-West Data Center, Oregon',
            sub:
              n.kind === 'client'
                ? `client · ${props.counts.waiting + props.counts.blocked} groups at sender${props.counts.blocked ? ` · ${props.counts.blocked} no route` : ''}`
                : `server · ${props.counts.arrived} / ${carCount} delivered`,
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
          text: state === 'offline' ? `${n.label} · Offline` : n.label,
          sub:
            phase === 'searching' && v && state === 'visited'
              ? route?.algorithm === 'dijkstra'
                ? `Settled · cost ${route.visitOrder.find((step) => step.nodeId === n.id)?.cost?.toFixed(2) ?? '—'}`
                : `BFS depth ${v.depth}`
              : undefined,
          x: p.x,
          y: 7,
          z: p.z,
          priority: { offline: 80, path: 60, visited: 40, idle: 20 }[state],
          tone: state,
        };
      }),
    [network, world, stationState, visit, phase, carCount, props.counts, route],
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
    <>
      <Canvas
        shadows
        flat
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.5, far: 9000, position: [0, 900, 900] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        aria-label="3D West Coast network map"
        data-testid="scene3d"
        onCreated={(state) => {
          // Dev-only hook for debugging and the E2E smoke test.
          if (import.meta.env.DEV) (window as unknown as { __r3f?: unknown }).__r3f = state;
        }}
      >
        <color attach="background" args={[C.sky]} />
        <fog attach="fog" args={[C.sky, 2200, 5200]} />
        <hemisphereLight args={['#ffffff', '#cfe3d4', 1.1]} />
        <ambientLight intensity={0.25} />

        <Ground world={world} />
        {network.links.map((l) => (
          <Road
            key={l.id}
            curve={world.roads.get(l.id)!}
            state={roadState(l.id)}
            previewed={props.previewRoadId === l.id}
            id={l.id}
          />
        ))}
        {previewNodePos && (
          <group
            position={[previewNodePos.x, 0.4, previewNodePos.z]}
            userData={{ previewNodeId: props.previewNodeId }}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
              <ringGeometry args={[7, 13, 64]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
              <ringGeometry args={[8, 12, 64]} />
              <meshBasicMaterial
                color={
                  props.previewNodeId && props.disabledNodeIds.has(props.previewNodeId)
                    ? C.danger
                    : C.explore
                }
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        )}
        {network.nodes
          .filter((n) => n.kind === 'router')
          .map((n) => (
            <Station
              key={n.id}
              id={n.id}
              onToggle={props.onToggleNode ? () => props.onToggleNode?.(n.id) : undefined}
              pos={world.pos.get(n.id)!}
              state={stationState(n.id)}
              visitAt={visit.get(n.id)?.at ?? null}
              clockRef={clockRef}
              roads={roadsAt.get(n.id) ?? []}
              lots={lots}
              passes={passes.get(n.id) ?? NO_PASSES}
            />
          ))}
        <ParkingLot lot={world.client} kind="client" active={carsHome && props.cars.length > 0} />
        <ParkingLot lot={world.server} kind="server" active={phase === 'delivered'} />
        <Cars
          cars={props.cars}
          paths={paths}
          world={world}
          clockRef={clockRef}
          hover={hover}
          onHover={setHover}
          tipEl={tipEl}
        />
        <LabelTracker items={labels} els={labelEls} />

        <CameraRig
          mode={props.cameraMode}
          onUserControl={toFree}
          apiRef={props.rigRef}
          phase={phase}
          overview={overview}
          client={world.client}
          server={world.server}
          paths={paths}
          clockRef={clockRef}
        />
      </Canvas>
      <LabelLayer items={labels} els={labelEls} onToggle={props.onToggleNode} />
      {hovered && (
        <div ref={tipEl} className="car-tip" role="tooltip">
          <b>Car #{String(hovered.seq + 1).padStart(2, '0')}</b>
          <span>
            packets {hovered.firstPacket.toLocaleString('en-US')}–
            {hovered.lastPacket.toLocaleString('en-US')}
          </span>
          <span>{formatBytes(hovered.bytes)}</span>
          <span>
            {timeline?.plans.find((p) => p.carId === hovered.id)
              ? carStatus(
                  timeline.plans.find((p) => p.carId === hovered.id)!,
                  clockRef.current,
                ) === 'blocked'
                ? 'No route — waiting at sender'
                : carStatus(
                    timeline.plans.find((p) => p.carId === hovered.id)!,
                    clockRef.current,
                  )
              : 'At sender'}
          </span>
        </div>
      )}
    </>
  );
});

export default Scene;
