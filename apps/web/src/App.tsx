import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LIMITS, type Network, type RouteResponse } from '@netsim/shared';
import { api, ApiRequestError } from './api/client';
import { NetworkGraph } from './components/NetworkGraph';

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};

export function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disabledNodeIds, setDisabledNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [disabledLinkIds, setDisabledLinkIds] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState('Hello, server!');
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNetwork()
      .then(setNetwork)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const pathLinkIds = useMemo(() => new Set(result?.linkPath), [result]);
  const visitedNodeIds = useMemo(() => new Set(result?.visitOrder.map((s) => s.nodeId)), [result]);

  const changeFailures = (fn: () => void) => {
    fn();
    setResult(null); // a stale route on a changed network would be misleading
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
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
      </header>

      <section className="panel" aria-label="Network">
        {loadError && <p className="status error">Could not load network: {loadError}</p>}
        {!network && !loadError && <p className="status">Loading network…</p>}
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

      <form className="panel controls" onSubmit={send}>
        <label htmlFor="message">Message</label>
        <input
          id="message"
          value={message}
          maxLength={LIMITS.messageMaxLength}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
        <button type="submit" disabled={!network || sending || message.length === 0}>
          {sending ? 'Routing…' : 'Send'}
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Reset network
        </button>
      </form>

      <section className="panel" aria-live="polite">
        {sendError && <p className="status error">{sendError}</p>}
        {result?.status === 'routed' && (
          <p className="status ok">
            Route found ({result.path.length - 1} hops, {result.packets.length} packets):{' '}
            <strong>{result.path.join(' → ')}</strong>
          </p>
        )}
        {result?.status === 'unreachable' && (
          <p className="status error">
            No route available. BFS explored {result.visitOrder.length} nodes.
          </p>
        )}
        {!result && !sendError && (
          <p className="status">Click a router or link to break it, then send a message.</p>
        )}
      </section>
    </main>
  );
}
