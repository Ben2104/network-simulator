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
import { RoutingControls } from './ui/RoutingControls';
import { LiveNetwork } from './ui/LiveNetwork';
import { TransferTiming } from './ui/TransferTiming';
import { RouteCard, SendPlayback, YourFile } from './ui/Sidebar';

const EMPTY: ReadonlySet<string> = new Set();
const NO_CARS: readonly never[] = [];

// three.js loads in its own chunk so the page shell paints first. The download starts right away,
// in parallel with the network request, instead of waiting until the network has loaded.
const webgl = hasWebGL();
const sceneModule = webgl ? import('./scene3d/Scene') : null;
const Scene = lazy(() => sceneModule ?? import('./scene3d/Scene'));

const NO_WEBGL =
  'The map needs WebGL, which this browser does not provide. Turn on hardware acceleration or try another browser. You can still submit files and use playback and live network controls in the sidebar.';

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
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const previewNode = network?.nodes.find((n) => n.id === previewNodeId);
  const [previewRoadId, setPreviewRoadId] = useState<string | null>(null);
  const previewRoad = network?.links.find((l) => l.id === previewRoadId);
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
  const activeAlgorithm = route?.algorithm ?? sim.algorithm;

  const showPath = phase === 'driving' || phase === 'delivered' || phase === 'blocked';
  const pathLinkIds = useMemo(
    () =>
      showPath
        ? new Set(
            (sim.rerouteCount
              ? (sim.timeline?.plans.flatMap((p) => p.route.linkIds) ?? [])
              : (route?.linkPath ?? [])
            ).filter((id) => {
              const link = network?.links.find((l) => l.id === id);
              return (
                link &&
                !sim.disabledLinkIds.has(id) &&
                !sim.disabledNodeIds.has(link.source) &&
                !sim.disabledNodeIds.has(link.target)
              );
            }),
          )
        : EMPTY,
    [
      showPath,
      route,
      sim.disabledLinkIds,
      sim.disabledNodeIds,
      sim.timeline,
      sim.rerouteCount,
      network,
    ],
  );
  const pathNodeIds = useMemo(
    () =>
      showPath
        ? new Set(
            sim.rerouteCount
              ? (sim.timeline?.plans.flatMap((p) => p.route.nodeIds) ?? [])
              : (route?.path ?? []),
          )
        : EMPTY,
    [showPath, route, sim.timeline, sim.rerouteCount],
  );
  const visitedNodeIds = useMemo(
    () => new Set(route?.visitOrder.slice(0, sim.visitedCount).map((s) => s.nodeId)),
    [route, sim.visitedCount],
  );

  const carTotal = upload?.packets.cars.length ?? 0;
  const copy = describePhase({
    phase: loadError ? 'error' : phase,
    algorithm: activeAlgorithm,
    fileLabel: upload?.label ?? null,
    totalBytes: upload?.packets.totalBytes ?? 0,
    packetCount: upload?.packets.packetCount ?? 0,
    hops: route ? Math.max(0, route.path.length - 1) : 0,
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
  const retry = loadError ? retryLoad : phase === 'error' ? sim.retry : null;

  return (
    <div className="shell">
      <Header />
      <Banner
        tone={sim.frames.some((f) => f.status === 'blocked') ? 'danger' : copy.tone}
        text={
          sim.rerouting
            ? 'Retrying affected groups from the sender · Finding a route around offline connections'
            : loadError || phase === 'error'
              ? banner
              : sim.frames.some((f) => f.status === 'blocked')
                ? `No route — transfer incomplete · ${sim.frames.filter((f) => f.status === 'blocked').length} groups waiting at sender. Restore a connection to retry.`
                : phase === 'delivered' && sim.rerouteCount
                  ? 'Delivered · All packet groups arrived after live rerouting'
                  : banner
        }
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
                      previewRoadId={previewRoadId}
                      previewNodeId={previewNodeId}
                      disabledNodeIds={sim.disabledNodeIds}
                      disabledLinkIds={sim.disabledLinkIds}
                      onToggleNode={(id) => sim.toggleFailure('node', id)}
                      phase={phase}
                      counts={{
                        arrived: sim.frames.filter((f) => f.status === 'arrived').length,
                        blocked: sim.frames.filter((f) => f.status === 'blocked').length,
                        waiting: carTotal - sim.frames.filter((f) => f.status !== 'waiting').length,
                      }}
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
              <Legend algorithm={activeAlgorithm} />
              {previewNode && (
                <div className="road-map-preview" role="status" aria-label="Highlighted router">
                  <strong>{previewNode.label}</strong>
                  <span>
                    {sim.disabledNodeIds.has(previewNode.id) ? 'Offline router' : 'Router preview'}
                  </span>
                </div>
              )}
              {previewRoad && !previewNode && (
                <div className="road-map-preview" role="status" aria-label="Highlighted road">
                  <strong>
                    {network.nodes.find((n) => n.id === previewRoad.source)?.label} –{' '}
                    {network.nodes.find((n) => n.id === previewRoad.target)?.label}
                  </strong>
                  <span>
                    {sim.disabledLinkIds.has(previewRoad.id) ? 'Offline road' : 'Road preview'}
                  </span>
                </div>
              )}
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
            <RoutingControls
              algorithm={sim.algorithm}
              locked={!sim.canConfigure}
              onChange={sim.selectAlgorithm}
              onResetBandwidths={sim.resetBandwidths}
              customized={Object.keys(sim.linkBandwidthMbps).length}
            />
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
              onSend={() => (phase === 'error' ? sim.retry() : void sim.send())}
              busy={sim.rerouting}
              onPause={sim.togglePause}
              onReset={sim.reset}
              onSpeed={sim.setSpeed}
            />
            <LiveNetwork
              onRoadPreview={setPreviewRoadId}
              onNodePreview={setPreviewNodeId}
              network={network}
              algorithm={sim.algorithm}
              bandwidths={sim.linkBandwidthMbps}
              settingsLocked={!sim.canConfigure}
              onBandwidth={sim.configureBandwidth}
              routeLinks={route?.linkPath ?? []}
              nodes={sim.disabledNodeIds}
              links={sim.disabledLinkIds}
              busy={sim.rerouting || phase === 'routing'}
              changes={sim.rerouteCount}
              onToggle={sim.toggleFailure}
              onRestore={sim.restoreAll}
            />
            <TransferTiming
              timeline={sim.timeline}
              cars={upload?.packets.cars ?? NO_CARS}
              now={sim.elapsed}
              paused={sim.paused || sim.rerouting}
            />
            <RouteCard
              algorithm={sim.algorithm}
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
        <Footer
          text={
            sim.frames.some((f) => f.status === 'blocked')
              ? `${sim.frames.filter((f) => f.status === 'arrived').length} / ${carTotal} groups delivered · ${sim.frames.filter((f) => f.status === 'blocked').length} waiting for a route`
              : phase === 'blocked'
                ? 'No route — transfer incomplete. Restore a connection to retry.'
                : copy.footer
          }
          hint={
            sim.rerouteCount
              ? 'Affected groups are retried from the sender; delivered groups stay delivered'
              : copy.footerHint
          }
          tone={copy.tone}
        />
      ) : (
        <Footer text="Starting up · Loading the map and route server" hint="" tone="neutral" />
      )}
    </div>
  );
}
