import { useState } from 'react';
import type { Network, PacketizeResponse, RouteResponse } from '@netsim/shared';
import { LIMITS } from '@netsim/shared';
import { SPEEDS, type Phase, type Speed, type Upload } from '../sim/useSimulation';
import { formatBytes } from './copy';
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
          disabled={!(canSend || phase === 'error')}
          onClick={props.onSend}
        >
          ➤ {sendLabel}
        </button>
        <button
          type="button"
          className="btn"
          disabled={phase !== 'searching' && phase !== 'driving'}
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
  phase: Phase;
  network: Network;
  route: RouteResponse | null;
  visitedCount: number;
  apiError: string | null;
}) {
  const { phase, route, network } = props;
  const label = (id: string) => network.nodes.find((n) => n.id === id)?.label ?? id;
  const done = route && phase !== 'searching';
  const hops = route?.status === 'routed' && done ? route.path.length - 1 : 0;
  const queue = route ? route.visitOrder.slice(0, props.visitedCount) : [];
  const shown = queue.slice(0, 6);

  return (
    <section className="card" aria-label="Route">
      <div className="card-head">
        <h2>Route (BFS)</h2>
        {phase === 'error' ? (
          <span className="mono muted">-- hops</span>
        ) : phase === 'noRoute' ? (
          <span className="badge danger">0 hops · No Path</span>
        ) : hops > 0 ? (
          <span className="badge route">{hops} hops</span>
        ) : (
          <span className="badge muted">0 hops</span>
        )}
      </div>
      <p className="hint">BFS = fewest hops, not shortest distance.</p>

      {phase === 'error' && (
        <div className="callout danger">
          <strong>Simulation paused due to server error</strong>
          <p>{props.apiError}</p>
        </div>
      )}
      {phase === 'noRoute' && (
        <div className="callout danger">
          <strong>Destination unreachable</strong>
          <p>
            BFS search exhausted all {route?.visitOrder.length} reachable nodes without discovering
            a connected path to US-West Data Center.
          </p>
        </div>
      )}
      {phase !== 'error' && !route && (
        <div className="empty">
          <p>
            {phase === 'idle'
              ? 'No route yet. Submit a file or message, then click Send to run the BFS shortest-hop search.'
              : 'Ready to calculate route. BFS will determine the fewest hops between CSULB and US-West Data Center.'}
          </p>
        </div>
      )}
      {route?.status === 'routed' && done && (
        <ol className="chips route-chips">
          {route.path.map((id, i) => (
            <li key={id} className="chip route">
              {i + 1} {label(id)}
            </li>
          ))}
        </ol>
      )}
      {queue.length > 0 && (
        <>
          <h3>Queue (FIFO, in visit order)</h3>
          <ul className="chips">
            {shown.map((s) => (
              <li key={s.nodeId} className="chip explore">
                {label(s.nodeId)}
              </li>
            ))}
            {queue.length > shown.length && (
              <li className="chip plain">+{queue.length - shown.length} more</li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}

export function NetworkStatus(props: {
  network: Network;
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  canToggle: boolean;
  phase: Phase;
  onToggleNode: (id: string) => void;
  onToggleLink: (id: string) => void;
}) {
  const { network } = props;
  const label = (id: string) => network.nodes.find((n) => n.id === id)?.label ?? id;
  const linkLabel = (id: string) => {
    const l = network.links.find((x) => x.id === id);
    return l ? `${label(l.source)}–${label(l.target)}` : id;
  };
  // Two default switches as in the design, plus anything else the user broke on the map.
  const nodeIds = [...new Set(['oakland', ...props.disabledNodeIds])];
  const linkIds = [...new Set(['sacramento--redding', ...props.disabledLinkIds])];
  const failures = props.disabledNodeIds.size + props.disabledLinkIds.size;
  const locked = !props.canToggle;

  return (
    <section className="card" aria-label="Network status">
      <h2>Network Status</h2>
      {failures === 0 ? (
        <p className="callout ok">
          ✓ All {network.nodes.length} stations and {network.links.length} roads online
        </p>
      ) : (
        <p className="callout danger-text">
          ⚠ {failures} failure{failures === 1 ? '' : 's'} detected
        </p>
      )}
      <ul className="switches">
        {nodeIds.map((id) => (
          <Switch
            key={id}
            name={`${label(id)} (station)`}
            off={props.disabledNodeIds.has(id)}
            disabled={locked}
            onChange={() => props.onToggleNode(id)}
          />
        ))}
        {linkIds.map((id) => (
          <Switch
            key={id}
            name={`${linkLabel(id)} (road)`}
            off={props.disabledLinkIds.has(id)}
            disabled={locked}
            onChange={() => props.onToggleLink(id)}
          />
        ))}
      </ul>
      <p className="hint small">
        {locked
          ? props.phase === 'error'
            ? 'Network controls are locked while the connection is failing.'
            : 'Locked while sending'
          : props.phase === 'delivered' || props.phase === 'noRoute'
            ? 'Toggle failures, then Send again'
            : 'Toggle failures before clicking Send to simulate re-routing'}
      </p>
    </section>
  );
}

function Switch(props: { name: string; off: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <li className="switch-row">
      <span>{props.name}</span>
      <span className={`state ${props.off ? 'off' : 'on'}`}>
        {props.off ? '✕ Offline' : '✓ Online'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!props.off}
        aria-label={`${props.name} online`}
        className="toggle"
        disabled={props.disabled}
        onClick={props.onChange}
      />
    </li>
  );
}
