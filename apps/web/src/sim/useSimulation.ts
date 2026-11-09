import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  project,
  isBandwidthMbps,
  ROUTING,
  type BandwidthMbps,
  type RoutingAlgorithm,
  type Network,
  type PacketizeRequest,
  type PacketizeResponse,
  type RouteResponse,
} from '@netsim/shared';
import { api, ApiRequestError } from '../api/client';
import { packetize } from './packetize';
import { planRun } from './plan';
import { blockedTimeline, clockStop, retryTimeline } from './reroute';
import { BFS_STEP_SEC, bfsStepsShown, framesAt, type CarFrame, type Timeline } from './timeline';

/** Packetizing is synchronous here, so the architecture's `packetizing` state never shows. */
export type Phase =
  | 'idle'
  | 'loaded'
  | 'routing'
  | 'searching'
  | 'driving'
  | 'delivered'
  | 'noRoute'
  | 'blocked'
  | 'error';

export const SPEEDS = [0.25, 0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** Development-only clock inspection for deterministic browser regression tests. */
export interface SimulationDebug {
  readonly paused: boolean;
  readonly arrivals: readonly number[];
  seek: (seconds: number) => void;
}

export interface Upload {
  label: string;
  packets: PacketizeResponse;
  /** Set when the file really went to `POST /api/upload` (drag and drop or browse). */
  server?: {
    size: string;
    summary: string;
    sha256: string;
    /** Server hash equals the browser's own SHA-256 of the file. */
    verified: boolean;
  };
}

interface Run {
  route: RouteResponse;
  timeline: Timeline;
}

export function useSimulation(network: Network | null) {
  // Timing uses true projected distances, the same geography the 3D scene draws.
  const pos = useMemo(
    () => new Map(network?.nodes.map((n) => [n.id, project(n.lat, n.lon)]) ?? []),
    [network],
  );
  const [upload, setUpload] = useState<Upload | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState<RoutingAlgorithm>('bfs');
  const [linkBandwidthMbps, setLinkBandwidthMbps] = useState<Record<string, BandwidthMbps>>({});
  const [disabledNodeIds, setDisabledNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [disabledLinkIds, setDisabledLinkIds] = useState<ReadonlySet<string>>(new Set());
  const [rerouting, setRerouting] = useState(false);
  const [rerouteCount, setRerouteCount] = useState(0);
  const [routing, setRouting] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const speedRef = useRef<Speed>(1);
  const clockRef = useRef(0);
  /** Bumped by every Send and Reset so a late API reply cannot revive a cleared run. */
  const requestId = useRef(0);
  const recalculating = useRef(false);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Simulation clock: advances by real elapsed time x speed, so changing speed mid-flight is
  // smooth and Pause simply stops advancing it.
  useEffect(() => {
    if (!run || paused || rerouting || apiError) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // Clamp to [0, 0.1] s: a clock that jumps backwards must not rewind the simulation.
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      if (recalculating.current) return;
      const stop = clockStop(run.timeline);
      const next = Math.min(clockRef.current + dt * speedRef.current, stop);
      clockRef.current = next;
      setClock(next);
      if (next < clockStop(run.timeline)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, paused, rerouting, apiError]);

  // Excluded from production by Vite. Tests can inspect the real plan and seek only while
  // paused, rather than rendering hundreds of software-WebGL frames to reach a known state.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const target = window as Window & { __packetHighway?: SimulationDebug };
    const debug: SimulationDebug = {
      paused,
      arrivals: run?.timeline.plans.map((p) => p.arriveAt) ?? [],
      seek: (seconds) => {
        if (!run || !paused || routing || rerouting || apiError)
          throw new Error('Pause an active simulation before seeking');
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > clockStop(run.timeline))
          throw new RangeError('Seek time is outside the current simulation');
        clockRef.current = seconds;
        setClock(seconds);
      },
    };
    target.__packetHighway = debug;
    return () => {
      if (target.__packetHighway === debug) delete target.__packetHighway;
    };
  }, [run, paused, routing, rerouting, apiError]);

  const phase: Phase = useMemo(() => {
    if (apiError) return 'error';
    if (!upload) return 'idle';
    if (routing) return 'routing';
    if (!run) return 'loaded';
    if (run.route.status === 'unreachable' && rerouteCount === 0)
      return clock < run.timeline.driveStart ? 'searching' : 'noRoute';
    const states = framesAt(run.timeline, clock);
    if (
      states.some((f) => f.status === 'blocked') &&
      states.every((f) => f.status === 'blocked' || f.status === 'arrived')
    )
      return 'blocked';
    if (clock < run.timeline.driveStart) return 'searching';
    return clock < run.timeline.end ? 'driving' : 'delivered';
  }, [apiError, upload, routing, run, clock, rerouteCount]);

  const frames: CarFrame[] = useMemo(
    () => (run ? framesAt(run.timeline, clock) : []),
    [run, clock],
  );

  const visitedCount = !run
    ? 0
    : phase === 'searching'
      ? bfsStepsShown(clock, run.route.visitOrder.length)
      : run.route.visitOrder.length;

  const clearRun = useCallback(() => {
    requestId.current++;
    setRouting(false);
    setRerouting(false);
    recalculating.current = false;
    setRerouteCount(0);
    setRun(null);
    setApiError(null);
    clockRef.current = 0;
    setClock(0);
    setPaused(false);
  }, []);

  const loadRequest = useCallback(
    (req: PacketizeRequest, label: string) => {
      clearRun();
      try {
        setUpload({ label, packets: packetize(req) });
        setInputError(null);
      } catch (e) {
        setUpload(null);
        setInputError(e instanceof Error ? e.message : String(e));
      }
    },
    [clearRun],
  );

  const loadFile = useCallback(
    (fileName: string, sizeBytes: number) =>
      loadRequest({ source: 'file', fileName, sizeBytes }, fileName),
    [loadRequest],
  );
  /** A plan computed by the server for a real upload. */
  const loadUploaded = useCallback(
    (u: Upload) => {
      clearRun();
      setUpload(u);
      setInputError(null);
    },
    [clearRun],
  );
  const loadMessage = useCallback(
    (message: string) => loadRequest({ source: 'message', message }, 'Message'),
    [loadRequest],
  );

  const send = useCallback(async () => {
    if (!network || !upload) return;
    const id = ++requestId.current;
    setRouting(true);
    setApiError(null);
    setRun(null);
    clockRef.current = 0;
    setClock(0);
    setPaused(false);
    try {
      const route = await api.route({
        algorithm,
        ...(algorithm === 'dijkstra' ? { linkBandwidthMbps } : {}),
        disabledNodeIds: [...disabledNodeIds],
        disabledLinkIds: [...disabledLinkIds],
      });
      if (id !== requestId.current) return;
      const timeline =
        route.status === 'unreachable'
          ? blockedTimeline(
              network,
              upload.packets.cars,
              pos,
              route.visitOrder.length * BFS_STEP_SEC,
            )
          : planRun(upload.packets, route, pos, Math.random);
      setRerouteCount(0);
      setRun({ route, timeline });
    } catch (e) {
      if (id !== requestId.current) return;
      setApiError(e instanceof ApiRequestError ? e.message : 'Could not reach the route service.');
    } finally {
      if (id === requestId.current) setRouting(false);
    }
  }, [network, pos, upload, disabledNodeIds, disabledLinkIds, algorithm, linkBandwidthMbps]);

  const updateFailures = useCallback(
    async (nodes: ReadonlySet<string>, links: ReadonlySet<string>) => {
      if (!network || rerouting || routing) return;
      setDisabledNodeIds(nodes);
      setDisabledLinkIds(links);
      if (!run || phase === 'delivered') return;
      const id = ++requestId.current;
      const now = clockRef.current;
      recalculating.current = true;
      setRerouting(true);
      setApiError(null);
      try {
        const route = await api.route({
          fromNodeId: network.clientId,
          algorithm,
          ...(algorithm === 'dijkstra' ? { linkBandwidthMbps } : {}),
          disabledNodeIds: [...nodes],
          disabledLinkIds: [...links],
        });
        if (id !== requestId.current) return;
        const timeline = retryTimeline(network, run.timeline, now, nodes, links, route, pos);
        // The global route card can be unreachable while a group closer to the server still delivers.
        setRun({ route, timeline });
        setRerouteCount((n) => n + 1);
      } catch (e) {
        if (id === requestId.current)
          setApiError(e instanceof Error ? e.message : 'Reroute failed');
      } finally {
        if (id === requestId.current) {
          recalculating.current = false;
          setRerouting(false);
        }
      }
    },
    [network, rerouting, routing, run, phase, pos, algorithm, linkBandwidthMbps],
  );

  const toggleFailure = (kind: 'node' | 'link', id: string) => {
    const next = new Set(kind === 'node' ? disabledNodeIds : disabledLinkIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void updateFailures(
      kind === 'node' ? next : disabledNodeIds,
      kind === 'link' ? next : disabledLinkIds,
    );
  };

  /** Back to the file input. */
  const changeFile = useCallback(() => {
    clearRun();
    setUpload(null);
    setInputError(null);
  }, [clearRun]);

  const reset = useCallback(() => {
    clearRun();
    setUpload(null);
    setInputError(null);
    setDisabledNodeIds(new Set());
    setDisabledLinkIds(new Set());
  }, [clearRun]);

  const canConfigure =
    !routing && !rerouting && (!run || phase === 'delivered' || phase === 'noRoute');
  const configureBandwidth = (id: string, mbps: number) => {
    if (!canConfigure || !network?.links.some((l) => l.id === id)) return;
    if (!isBandwidthMbps(mbps)) throw new RangeError('Choose 10, 100 or 1000 Mbps');
    setLinkBandwidthMbps((old) => {
      const next = { ...old };
      if (mbps === ROUTING.defaultBandwidthMbps) delete next[id];
      else next[id] = mbps;
      return next;
    });
  };

  return {
    algorithm,
    linkBandwidthMbps,
    canConfigure,
    selectAlgorithm: (value: RoutingAlgorithm) => {
      if (canConfigure && value !== algorithm) {
        clearRun();
        setAlgorithm(value);
      }
    },
    configureBandwidth,
    resetBandwidths: () => {
      if (canConfigure) setLinkBandwidthMbps({});
    },
    phase,
    elapsed: clock,
    disabledNodeIds,
    disabledLinkIds,
    rerouting,
    rerouteCount,
    toggleFailure,
    restoreAll: () => void updateFailures(new Set(), new Set()),
    retry: () => (run ? void updateFailures(disabledNodeIds, disabledLinkIds) : void send()),
    upload,
    inputError,
    route: run?.route ?? null,
    timeline: run?.timeline ?? null,
    /**
     * Live sim clock for renderers that animate outside React (the 3D scene reads it in
     * `useFrame`). Read-only for consumers.
     */
    clockRef: clockRef as { readonly current: number },
    frames,
    visitedCount,
    apiError,
    paused,
    speed,
    setSpeed,
    togglePause: () => setPaused((p) => !p),
    loadFile,
    loadUploaded,
    loadMessage,
    changeFile,
    send,
    reset,
  };
}
