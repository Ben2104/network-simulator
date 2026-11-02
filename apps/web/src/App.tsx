import { useCallback, useEffect, useMemo, useState } from 'react';
import { LIMITS, type Network, type RouteResponse } from '@netsim/shared';
import { api, ApiRequestError } from './api/client';
import { NetworkGraph } from './components/NetworkGraph';
import { SendBar } from './ui/SendBar';
import { StatusBanner } from './ui/StatusBanner';
import { ViewToggle, type NetworkView } from './ui/ViewToggle';

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};

export function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(true);
  const [disabledNodeIds, setDisabledNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [disabledLinkIds, setDisabledLinkIds] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState('Hello, server!');
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [view, setView] = useState<NetworkView>('2d');

  const loadNetwork = useCallback(async () => {
    setLoadingNetwork(true);
    setLoadError(null);
    try {
      setNetwork(await api.getNetwork());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingNetwork(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getNetwork()
      .then((loadedNetwork) => {
        if (active) setNetwork(loadedNetwork);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoadingNetwork(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const pathLinkIds = useMemo(() => new Set(result?.linkPath), [result]);
  const visitedNodeIds = useMemo(() => new Set(result?.visitOrder.map((s) => s.nodeId)), [result]);

  const changeFailures = (fn: () => void) => {
    fn();
    setResult(null); // a stale route on a changed network would be misleading
  };

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      setResult(
        await api.route({
          message,
          disabledNodeIds: [...disabledNodeIds],
          disabledLinkIds: [...disabledLinkIds],
        }),
      );
    } catch (err) {
      setSendError(err instanceof ApiRequestError ? err.message : 'Unexpected error');
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setDisabledNodeIds(new Set());
    setDisabledLinkIds(new Set());
    setResult(null);
    setSendError(null);
  };

  return (
    <main className="app">
      <header>
        <h1>Network Route Simulator</h1>
        <p className="subtitle">
          An educational simulation: virtual routers, breadth-first search. No real network traffic
          is routed.
        </p>
        <ViewToggle view={view} onChange={setView} is3dAvailable={false} />
      </header>

      <section className="panel" aria-label="Network">
        {loadError && (
          <StatusBanner
            kind="error"
            message={`Could not load network: ${loadError}`}
            onRetry={() => void loadNetwork()}
          />
        )}
        {loadingNetwork && !loadError && <StatusBanner kind="loading" message="Loading network…" />}
        {network && (
          <NetworkGraph
            network={network}
            disabledNodeIds={disabledNodeIds}
            disabledLinkIds={disabledLinkIds}
            pathLinkIds={pathLinkIds}
            visitedNodeIds={visitedNodeIds}
            onToggleNode={(id) => changeFailures(() => setDisabledNodeIds((s) => toggle(s, id)))}
            onToggleLink={(id) => changeFailures(() => setDisabledLinkIds((s) => toggle(s, id)))}
          />
        )}
      </section>

      <SendBar
        message={message}
        maxLength={LIMITS.messageMaxLength}
        onMessageChange={setMessage}
        onSend={send}
        disabled={!network}
        sending={sending}
      />
      <div className="panel controls">
        <button type="button" className="secondary" onClick={reset}>
          Reset network
        </button>
      </div>

      <section className="panel" aria-live="polite">
        {sending && <StatusBanner kind="searching" message="Searching the network…" />}
        {!sending && sendError && (
          <StatusBanner kind="error" message={sendError} onRetry={() => void send()} />
        )}
        {!sending && result?.status === 'routed' && (
          <StatusBanner
            kind="success"
            message={`Route found (${result.path.length - 1} hops, ${result.packets.length} packets): ${result.path.join(' → ')}`}
          />
        )}
        {!sending && result?.status === 'unreachable' && (
          <StatusBanner
            kind="no-route"
            message={`No route available. BFS explored ${result.visitOrder.length} nodes.`}
          />
        )}
        {!sending && !result && !sendError && (
          <StatusBanner
            kind="idle"
            message="Click a router or link to break it, then send a message."
          />
        )}
      </section>
    </main>
  );
}
