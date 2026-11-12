import { useId, useState } from 'react';
import type { Network, PacketizeResponse, RouteResponse, RoutingAlgorithm } from '@netsim/shared';
import { LIMITS, usesLinkCost } from '@netsim/shared';
import { SPEEDS, type Phase, type Speed, type Upload } from '../sim/useSimulation';
import { ALGORITHM_NAME, asLabel, formatBytes } from './copy';
import { CarMeter, Dropzone } from './Dropzone';

const PRESETS = [
  { name: 'essay.pdf', sizeBytes: 1_048_576 },
  { name: 'photo.jpg', sizeBytes: 5_000_000 },
  { name: 'notes.txt', sizeBytes: 12_000 },
  { name: 'lecture.mp4', sizeBytes: 9_900_000 },
] as const;

export function YourFile(props: {
  phase: Phase;
  upload: Upload | null;
  inputError: string | null;
  onFile: (name: string, size: number) => void;
  onUploaded: (u: Upload) => void;
  onMessage: (text: string) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState('');
  const [presets, setPresets] = useState(false);
  const { upload } = props;
  const p: PacketizeResponse | undefined = upload?.packets;

  return (
    <section className="card" aria-label="Your file">
      <div className="card-head">
        <h2>Your file</h2>
        {upload ? (
          <span className="badge ok">✓ Packetized</span>
        ) : (
          <span className="badge muted">Awaiting input</span>
        )}
      </div>
      {upload && p ? (
        <>
          <p className="file-name">{upload.label}</p>
          <p className="mono">
            {formatBytes(p.totalBytes)} · {p.packetCount.toLocaleString('en-US')} packets →{' '}
            {p.cars.length} car{p.cars.length === 1 ? '' : 's'}
          </p>
          <CarMeter cars={p.cars.length} />
          {upload.server && (
            <div className="upload-result">
              <p>{upload.server.summary}</p>
              <p className={upload.server.verified ? 'verified' : 'mismatch'}>
                {upload.server.verified ? '✓ Verified in Oregon — hash match' : '⚠ Hash mismatch'}{' '}
                <span className="mono">sha256 {upload.server.sha256.slice(0, 12)}…</span>
              </p>
            </div>
          )}
          {props.phase !== 'routing' &&
            props.phase !== 'searching' &&
            props.phase !== 'driving' && (
              <button type="button" className="link-btn" onClick={props.onClear}>
                Choose another file
              </button>
            )}
        </>
      ) : (
        <>
          <Dropzone disabled={false} onUploaded={props.onUploaded} />
          <p className="or">or simulate without uploading</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              props.onMessage(text);
            }}
          >
            <label className="field-label" htmlFor="payload">
              Enter message or select sample
            </label>
            <textarea
              id="payload"
              value={text}
              maxLength={LIMITS.messageMaxLength}
              placeholder="e.g. a short message for the class (up to 140 characters)"
              onChange={(e) => setText(e.target.value)}
            />
            {props.inputError && <p className="field-error">{props.inputError}</p>}
            <div className="row">
              <button type="submit" className="btn primary grow" disabled={text.trim() === ''}>
                Packetize message
              </button>
              <button
                type="button"
                className="btn"
                aria-expanded={presets}
                onClick={() => setPresets((v) => !v)}
              >
                Presets
              </button>
            </div>
            {presets && (
              <ul className="presets">
                {PRESETS.map((s) => (
                  <li key={s.name}>
                    <button type="button" onClick={() => props.onFile(s.name, s.sizeBytes)}>
                      {s.name} <span>{formatBytes(s.sizeBytes)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </>
      )}
    </section>
  );
}

export function SendPlayback(props: {
  phase: Phase;
  paused: boolean;
  speed: Speed;
  onSend: () => void;
  busy?: boolean;
  onPause: () => void;
  onReset: () => void;
  onSpeed: (s: Speed) => void;
}) {
  const { phase } = props;
  const canSend = phase === 'loaded' || phase === 'delivered' || phase === 'noRoute';
  const sending = phase === 'routing' || phase === 'searching' || phase === 'driving';
  const sendLabel = sending
    ? 'Sending…'
    : phase === 'error'
      ? 'Retry'
      : phase === 'delivered' || phase === 'noRoute'
        ? 'Send again'
        : 'Send';
  return (
    <section className="card" aria-label="Send and playback">
      <h2>Send &amp; Playback</h2>
      <div className="row three">
        <button
          type="button"
          className="btn primary"
          disabled={props.busy || !(canSend || phase === 'error')}
          onClick={props.onSend}
        >
          ➤ {sendLabel}
        </button>
        <button
          type="button"
          className="btn"
          disabled={
            props.busy || (phase !== 'searching' && phase !== 'driving' && phase !== 'blocked')
          }
          aria-pressed={props.paused}
          onClick={props.onPause}
        >
          {props.paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn" disabled={phase === 'idle'} onClick={props.onReset}>
          ↻ Reset
        </button>
      </div>
      <div className="speed" role="radiogroup" aria-label="Playback speed">
        <span className="field-label">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={props.speed === s}
            className={props.speed === s ? 'active' : ''}
            onClick={() => props.onSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </section>
  );
}

export function RouteCard(props: {
  live?: boolean;
  phase: Phase;
  algorithm: RoutingAlgorithm;
  network: Network;
  route: RouteResponse | null;
  visitedCount: number;
  apiError: string | null;
}) {
  const { phase, route, network } = props;
  const algorithm = route?.algorithm ?? props.algorithm;
  const weighted = usesLinkCost(algorithm);
  const name = ALGORITHM_NAME[algorithm];
  const label = (id: string) => network.nodes.find((n) => n.id === id)?.label ?? id;
  const done = route && phase !== 'searching';
  const hops = route?.status === 'routed' && done ? route.path.length - 1 : 0;
  const queue = route ? route.visitOrder.slice(0, props.visitedCount) : [];
  const [expandedRoute, setExpandedRoute] = useState<RouteResponse | null>(null);
  const expanded = route !== null && expandedRoute === route;
  const searchListId = useId();
  const shown = expanded ? queue : queue.slice(0, 6);
  // Use the API's settled costs for this route, not bandwidth settings edited afterwards.
  const costs = new Map(route?.visitOrder.map((step) => [step.nodeId, step.cost]) ?? []);
  const pathCosts = route?.path.map((id) => costs.get(id)) ?? [];
  const roadCosts = pathCosts.slice(1).map((cost, i) => {
    const previous = pathCosts[i];
    return cost !== undefined && previous !== undefined ? cost - previous : undefined;
  });

  return (
    <section className="card" aria-label="Route">
      <div className="card-head">
        <h2>Route ({name})</h2>
        {phase === 'error' ? (
          <span className="mono muted">-- hops</span>
        ) : route?.status === 'unreachable' ? (
          <span className="badge danger">0 hops · No Path</span>
        ) : hops > 0 ? (
          <span className="badge route">{hops} hops</span>
        ) : (
          <span className="badge muted">0 hops</span>
        )}
      </div>
      {props.live && (
        <p className="hint small">
          Latest calculated best route from the sender. In-flight groups may finish on another
          route; orange roads show remaining active paths. See each group's hops and time in
          Transfer timing.
        </p>
      )}
      <p className="hint">
        {
          {
            bfs: 'BFS = fewest hops, not shortest distance.',
            dijkstra: 'Dijkstra = lowest total configured link cost, not necessarily fewest hops.',
            bgp: 'BGP = business policy first, then fewest ASes; not necessarily fewest hops or lowest cost.',
          }[algorithm]
        }
      </p>
      {algorithm === 'bgp' && route?.status === 'routed' && done && route.asPath && (
        <p className="route-cost" aria-label="AS path">
          AS path: <strong>{route.asPath.map(asLabel).join(' → ')}</strong>{' '}
          <span className="hint small">({route.asPath.length} ASes)</span>
        </p>
      )}
      {weighted &&
        route?.status === 'routed' &&
        done &&
        route.totalCost !== undefined &&
        route.totalCost !== null && (
          <p className="route-cost">
            Total route cost: <strong>{route.totalCost.toFixed(2)}</strong>{' '}
            <span className="hint small">(unitless; each road cost = 1000 / Mbps)</span>
            {roadCosts.length > 0 && roadCosts.every((cost) => cost !== undefined) && (
              <span className="route-cost-breakdown">
                Road costs: {roadCosts.map((cost) => cost!.toFixed(2)).join(' + ')} ={' '}
                {route.totalCost.toFixed(2)}
              </span>
            )}
          </p>
        )}

      {phase === 'error' && (
        <div className="callout danger">
          <strong>Simulation paused due to server error</strong>
          <p>{props.apiError}</p>
        </div>
      )}
      {route?.status === 'unreachable' && (
        <div className="callout danger">
          <strong>Destination unreachable</strong>
          <p>
            {algorithm === 'bgp'
              ? `No AS agreement chain advertises a route to US-West Data Center. Roads may still connect, but policy does not allow them. Settled ${route?.visitOrder.length} stations inside the sender's own AS.`
              : `${name} search exhausted all ${route?.visitOrder.length} reachable nodes without discovering a connected path to US-West Data Center.`}
          </p>
        </div>
      )}
      {phase !== 'error' && !route && (
        <div className="empty">
          <p>
            {phase === 'idle'
              ? `No route yet. Submit a file or message, then click Send to run ${name}.`
              : `Ready to calculate route. ${name} will find the ${{ bfs: 'fewest hops', dijkstra: 'lowest total cost', bgp: 'policy-preferred AS path' }[algorithm]} between CSULB and US-West Data Center.`}
          </p>
        </div>
      )}
      {route?.status === 'routed' && done && (
        <>
          {weighted && (
            <p className="hint small">
              Chosen route below: cost at each stop is the cumulative cost from the sender (starts
              at 0). Costs belong to roads, not routers.
            </p>
          )}
          <ol className="chips route-chips">
            {route.path.map((id, i) => (
              <li
                key={id}
                className="chip route"
                title={
                  weighted && i > 0 && roadCosts[i - 1] !== undefined
                    ? `Incoming road cost: ${roadCosts[i - 1]!.toFixed(2)}`
                    : undefined
                }
              >
                {i + 1} {label(id)}
                {weighted && costs.get(id) !== undefined
                  ? ` · cost ${costs.get(id)!.toFixed(2)}`
                  : ''}
              </li>
            ))}
          </ol>
        </>
      )}
      {queue.length > 0 && (
        <>
          <h3>
            {weighted
              ? 'Settled order (lowest cumulative cost first)'
              : 'Queue (FIFO, in visit order)'}
          </h3>
          {weighted && (
            <p className="hint small">
              Search visits include other candidates; only the yellow stops form the chosen route.
            </p>
          )}
          <ul className="chips" id={searchListId}>
            {shown.map((s) => (
              <li key={s.nodeId} className="chip explore">
                {label(s.nodeId)}
                {weighted && s.cost !== undefined ? ` · cost ${s.cost.toFixed(2)}` : ''}
              </li>
            ))}
            {queue.length > 6 && (
              <li>
                <button
                  type="button"
                  className="chip plain chip-toggle"
                  aria-expanded={expanded}
                  aria-controls={searchListId}
                  onClick={() => setExpandedRoute(expanded ? null : route)}
                >
                  {expanded ? 'Show less' : `+${queue.length - shown.length} more`}
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
