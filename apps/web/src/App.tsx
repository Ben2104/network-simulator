import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Network } from '@netsim/shared';
import { api } from './api/client';
import type { CameraMode, RigApi } from './scene3d/CameraRig';
import { SceneBoundary } from './scene3d/SceneBoundary';
import { hasWebGL } from './scene3d/webgl';
import { useSimulation } from './sim/useSimulation';
import { Banner, CameraControls, Footer, Header, Legend } from './ui/Chrome';
import { countCars, describePhase } from './ui/copy';
import { NetworkStatus, RouteCard, SendPlayback, YourFile } from './ui/Sidebar';

const EMPTY: ReadonlySet<string> = new Set();
const NO_CARS: readonly never[] = [];

// three.js loads in its own chunk so the page shell paints first.
const Scene = lazy(() => import('./scene3d/Scene'));

const NO_WEBGL =
  'The map needs WebGL, which this browser does not provide. Turn on hardware acceleration or try another browser. You can still submit files and toggle stations in the sidebar.';

export function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Why the 3D map cannot show (no WebGL, or the scene crashed); null when it can. */
  const [no3d, setNo3d] = useState<string | null>(() => (hasWebGL() ? null : NO_WEBGL));
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto');
  const rigRef = useRef<RigApi | null>(null);
  const on3dError = (message: string) =>
    setNo3d(`The 3D map stopped (${message}). Reload the page to try again.`);

  useEffect(() => {
    api
      .getNetwork()
      .then((n) => {
        setNetwork(n);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [attempt]);

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
    offlineStationLabels: network
      ? network.nodes.filter((n) => sim.disabledNodeIds.has(n.id)).map((n) => n.label)
      : [],
    paused: sim.paused,
  });
  const banner = loadError ? `Could not load the network: ${loadError}` : copy.banner;
  const retry = loadError ? () => setAttempt((a) => a + 1) : phase === 'error' ? sim.send : null;

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
              STATE: <b>{(loadError ? 'error' : phase).toUpperCase()}</b>
            </span>
          )
        }
      />
      <div className="body">
        <main className="canvas">
          {network && !no3d ? (
            <>
              <div className="scene3d">
                <SceneBoundary onError={on3dError}>
                  <Suspense fallback={<p className="canvas-note">Loading 3D scene…</p>}>
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
                      disabledNodeIds={sim.disabledNodeIds}
                      disabledLinkIds={sim.disabledLinkIds}
                      canToggle={sim.canToggleFailures}
                      onToggleNode={sim.toggleNode}
                      onToggleLink={sim.toggleLink}
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
            <p className="canvas-note">{loadError ? 'Network unavailable.' : 'Loading network…'}</p>
          )}
        </main>
        {network && (
          <aside className="sidebar">
            <YourFile
              phase={phase}
              upload={upload}
              inputError={sim.inputError}
              onFile={sim.loadFile}
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
            <NetworkStatus
              network={network}
              disabledNodeIds={sim.disabledNodeIds}
              disabledLinkIds={sim.disabledLinkIds}
              canToggle={sim.canToggleFailures}
              phase={phase}
              onToggleNode={sim.toggleNode}
              onToggleLink={sim.toggleLink}
            />
          </aside>
        )}
      </div>
      <Footer text={copy.footer} hint={copy.footerHint} tone={copy.tone} />
    </div>
  );
}
