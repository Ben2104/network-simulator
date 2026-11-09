import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Network } from '@netsim/shared';
import { api } from './api/client';
import { withWake } from './api/wake';
import type { CameraMode, RigApi } from './scene3d/CameraRig';
import { SceneBoundary } from './scene3d/SceneBoundary';
import { hasWebGL } from './scene3d/webgl';
import { useSimulation } from './sim/useSimulation';
import { Banner, CameraControls, Footer, Header, Legend } from './ui/Chrome';
import { LoadingScreen } from './ui/LoadingScreen';
import { countCars, describePhase } from './ui/copy';
import { RouteCard, SendPlayback, YourFile } from './ui/Sidebar';

const EMPTY: ReadonlySet<string> = new Set();
const NO_CARS: readonly never[] = [];

// three.js loads in its own chunk so the page shell paints first. The download starts right away,
// in parallel with the network request, instead of waiting until the network has loaded.
const webgl = hasWebGL();
const sceneModule = webgl ? import('./scene3d/Scene') : null;
const Scene = lazy(() => sceneModule ?? import('./scene3d/Scene'));

const NO_WEBGL =
  'The map needs WebGL, which this browser does not provide. Turn on hardware acceleration or try another browser. You can still submit files and toggle stations in the sidebar.';

export function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Try number while the sleeping API wakes up (1 = first request). */
  const [wakeTry, setWakeTry] = useState(1);
  /** The 3D map chunk has downloaded (true when there is no map to load). */
  const [mapReady, setMapReady] = useState(!sceneModule);
  /** Why the 3D map cannot show (no WebGL, or the scene crashed); null when it can. */
  const [no3d, setNo3d] = useState<string | null>(() => (webgl ? null : NO_WEBGL));
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto');
  const rigRef = useRef<RigApi | null>(null);
  const on3dError = (message: string) =>
    setNo3d(`The 3D map stopped (${message}). Reload the page to try again.`);

  useEffect(() => {
    let live = true;
    sceneModule?.then(
      () => live && setMapReady(true),
      () => live && setMapReady(true), // the SceneBoundary reports the failure
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    withWake(() => api.getNetwork(), { signal: ctrl.signal, onRetry: setWakeTry })
      .then((n) => {
        if (ctrl.signal.aborted) return;
        setNetwork(n);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [attempt]);

  const loading = !loadError && (!network || (!no3d && !mapReady));

  const sim = useSimulation(network);
  const { phase, route, upload } = sim;

  const showPath = route?.status === 'routed' && (phase === 'driving' || phase === 'delivered');
  const pathLinkIds = useMemo(
    () => (showPath ? new Set(route.linkPath) : EMPTY),
    [showPath, route],
  );
  const pathNodeIds = useMemo(() => (showPath ? new Set(route.path) : EMPTY), [showPath, route]);
  const visitedNodeIds = useMemo(
    () => new Set(route?.visitOrder.slice(0, sim.visitedCount).map((s) => s.nodeId)),
    [route, sim.visitedCount],
  );

  const carTotal = upload?.packets.cars.length ?? 0;
  const copy = describePhase({
    phase: loadError ? 'error' : phase,
    fileLabel: upload?.label ?? null,
    totalBytes: upload?.packets.totalBytes ?? 0,
    packetCount: upload?.packets.packetCount ?? 0,
    hops: route ? route.path.length - 1 : 0,
    visitedCount: sim.visitedCount,
    stationCount: network?.nodes.length ?? 0,
    cars: countCars(
      carTotal,
      sim.frames.map((f) => f.status),
    ),
    paused: sim.paused,
  });
  const banner = loadError
    ? `Could not load the network: ${loadError}`
    : !network
      ? wakeTry > 1
        ? 'Waking the route server · The free host sleeps when idle; this can take up to a minute'
        : 'Connecting to the route server…'
      : copy.banner;
  const retryLoad = () => {
    setLoadError(null);
    setWakeTry(1);
    setAttempt((a) => a + 1);
  };
  const retry = loadError ? retryLoad : phase === 'error' ? sim.send : null;

  return (
    <div className="shell">
      <Header />
      <Banner
        tone={copy.tone}
        text={banner}
        right={
          retry ? (
            <button type="button" className="btn danger-solid" onClick={retry}>
              ↻ Retry Connection
            </button>
          ) : (
            <span className="state-chip">
              STATE: <b>{(loadError ? 'error' : !network ? 'loading' : phase).toUpperCase()}</b>
            </span>
          )
        }
      />
      <div className="body">
        <main className="canvas">
          {loading ? (
            <LoadingScreen mapReady={mapReady} serverReady={network !== null} attempt={wakeTry} />
          ) : network && !no3d ? (
            <>
              <div className="scene3d">
                <SceneBoundary onError={on3dError}>
                  <Suspense fallback={<LoadingScreen mapReady={false} serverReady attempt={1} />}>
                    <Scene
                      network={network}
                      phase={phase}
                      cars={upload?.packets.cars ?? NO_CARS}
                      route={route}
                      timeline={sim.timeline}
                      clockRef={sim.clockRef}
                      visitedNodeIds={visitedNodeIds}
                      pathNodeIds={pathNodeIds}
                      pathLinkIds={pathLinkIds}
                      cameraMode={cameraMode}
                      onCameraMode={setCameraMode}
                      rigRef={rigRef}
                    />
                  </Suspense>
                </SceneBoundary>
              </div>
              <CameraControls mode={cameraMode} onMode={setCameraMode} rigRef={rigRef} />
              <Legend />
            </>
          ) : network && no3d ? (
            <p className="canvas-note" role="alert">
              {no3d}
            </p>
          ) : (
            <p className="canvas-note">Network unavailable.</p>
          )}
        </main>
        {network && (
          <aside className="sidebar">
            <YourFile
              phase={phase}
              upload={upload}
              inputError={sim.inputError}
              onFile={sim.loadFile}
              onUploaded={sim.loadUploaded}
              onMessage={sim.loadMessage}
              onClear={sim.changeFile}
            />
            <SendPlayback
              phase={phase}
              paused={sim.paused}
              speed={sim.speed}
              onSend={() => void sim.send()}
              onPause={sim.togglePause}
              onReset={sim.reset}
              onSpeed={sim.setSpeed}
            />
            <RouteCard
              phase={phase}
              network={network}
              route={route}
              visitedCount={sim.visitedCount}
              apiError={sim.apiError}
            />
          </aside>
        )}
      </div>
      {network || loadError ? (
        <Footer text={copy.footer} hint={copy.footerHint} tone={copy.tone} />
      ) : (
        <Footer text="Starting up · Loading the map and route server" hint="" tone="neutral" />
      )}
    </div>
  );
}
