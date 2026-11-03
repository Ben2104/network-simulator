import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  project,
  type Network,
  type PacketizeRequest,
  type PacketizeResponse,
  type RouteResponse,
} from '@netsim/shared';
import { api, ApiRequestError } from '../api/client';
import { packetize } from './packetize';
import { planRun } from './plan';
import { bfsStepsShown, framesAt, type CarFrame, type Timeline } from './timeline';

/** Packetizing is synchronous here, so the architecture's `packetizing` state never shows. */
export type Phase =
  'idle' | 'loaded' | 'routing' | 'searching' | 'driving' | 'delivered' | 'noRoute' | 'error';

export const SPEEDS = [0.25, 0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export interface Upload {
  label: string;
  packets: PacketizeResponse;
}

interface Run {
  route: RouteResponse;
  timeline: Timeline;
}

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};

export function useSimulation(network: Network | null) {
  // Timing uses true projected distances, the same geography the 3D scene draws.
  const pos = useMemo(
    () => new Map(network?.nodes.map((n) => [n.id, project(n.lat, n.lon)]) ?? []),
    [network],
  );
  const [upload, setUpload] = useState<Upload | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [disabledNodeIds, setDisabledNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [disabledLinkIds, setDisabledLinkIds] = useState<ReadonlySet<string>>(new Set());
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

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Simulation clock: advances by real elapsed time x speed, so changing speed mid-flight is
  // smooth and Pause simply stops advancing it.
  useEffect(() => {
    if (!run || paused) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const next = Math.min(clockRef.current + dt * speedRef.current, run.timeline.end);
      clockRef.current = next;
      setClock(next);
      if (next < run.timeline.end) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, paused]);

  const phase: Phase = useMemo(() => {
    if (apiError) return 'error';
    if (!upload) return 'idle';
    if (routing) return 'routing';
    if (!run) return 'loaded';
    if (clock < run.timeline.driveStart) return 'searching';
    if (run.route.status === 'unreachable') return 'noRoute';
    return clock < run.timeline.end ? 'driving' : 'delivered';
  }, [apiError, upload, routing, run, clock]);

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
        disabledNodeIds: [...disabledNodeIds],
        disabledLinkIds: [...disabledLinkIds],
      });
      if (id !== requestId.current) return;
      const timeline = planRun(
        network,
        upload.packets,
        route,
        pos,
        disabledNodeIds,
        disabledLinkIds,
        Math.random,
      );
      setRun({ route, timeline });
    } catch (e) {
      if (id !== requestId.current) return;
      setApiError(e instanceof ApiRequestError ? e.message : 'Could not reach the route service.');
    } finally {
      if (id === requestId.current) setRouting(false);
    }
  }, [network, pos, upload, disabledNodeIds, disabledLinkIds]);

  /** Back to the file input, keeping any broken stations and roads. */
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

  const canToggleFailures =
    phase === 'idle' || phase === 'loaded' || phase === 'delivered' || phase === 'noRoute';

  // A route computed on the old network would be misleading, so a failure change clears the run.
  const toggleNode = useCallback(
    (id: string) => {
      if (!canToggleFailures) return;
      clearRun();
      setDisabledNodeIds((s) => toggle(s, id));
    },
    [canToggleFailures, clearRun],
  );
  const toggleLink = useCallback(
    (id: string) => {
      if (!canToggleFailures) return;
      clearRun();
      setDisabledLinkIds((s) => toggle(s, id));
    },
    [canToggleFailures, clearRun],
  );

  return {
    phase,
    upload,
    inputError,
    disabledNodeIds,
    disabledLinkIds,
    canToggleFailures,
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
    loadMessage,
    changeFile,
    send,
    reset,
    toggleNode,
    toggleLink,
  };
}
