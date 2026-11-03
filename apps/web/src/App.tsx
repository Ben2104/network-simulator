import { useEffect, useMemo, useState } from 'react';
import type { Network } from '@netsim/shared';
import { api } from './api/client';
import { useSimulation } from './sim/useSimulation';
import { Banner, Footer, Header, Legend, MapControls } from './ui/Chrome';
import { countCars, describePhase } from './ui/copy';
import { NetworkStatus, RouteCard, SendPlayback, YourFile } from './ui/Sidebar';
import { layoutNetwork } from './view2d/layout';
import { NetworkGraph } from './view2d/NetworkGraph';

const EMPTY: ReadonlySet<string> = new Set();

export function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    api
      .getNetwork()
      .then((n) => {
        setNetwork(n);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [attempt]);

  const layout = useMemo(() => (network ? layoutNetwork(network) : null), [network]);
  const sim = useSimulation(network, layout);
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
          {network && layout ? (
            <>
              <NetworkGraph
                network={network}
                layout={layout}
                carCount={carTotal}
                frames={sim.frames}
                disabledNodeIds={sim.disabledNodeIds}
                disabledLinkIds={sim.disabledLinkIds}
                pathLinkIds={pathLinkIds}
                pathNodeIds={pathNodeIds}
                visitedNodeIds={visitedNodeIds}
                canToggle={sim.canToggleFailures}
                zoom={zoom}
                onToggleNode={sim.toggleNode}
                onToggleLink={sim.toggleLink}
              />
              <MapControls zoom={zoom} onZoom={setZoom} />
              <Legend />
            </>
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
