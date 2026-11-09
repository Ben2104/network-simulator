import type { Network } from '@netsim/shared';

export function LiveNetwork(props: {
  network: Network;
  nodes: ReadonlySet<string>;
  links: ReadonlySet<string>;
  busy: boolean;
  changes: number;
  onToggle: (kind: 'node' | 'link', id: string) => void;
  onRestore: () => void;
}) {
  const label = (id: string) => props.network.nodes.find((n) => n.id === id)?.label ?? id;
  const roadName = (id: string) => {
    const road = props.network.links.find((l) => l.id === id)!;
    return `${label(road.source)} – ${label(road.target)}`;
  };
  const count = props.nodes.size + props.links.size;
  const control = (kind: 'node' | 'link', id: string, name: string, offline: boolean) => (
    <li key={id} className="fault-row">
      <span>{name}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!offline}
        aria-label={`${name} online`}
        disabled={props.busy}
        className={`btn ${offline ? 'fault-offline' : ''}`}
        onClick={() => props.onToggle(kind, id)}
      >
        {offline ? '✕ Offline' : '✓ Online'}
      </button>
    </li>
  );
  return (
    <section className="card" aria-label="Live network failures">
      <h2>Live network</h2>
      <p className="hint">
        Click a router on the map to toggle it. Use the switches below for routers or roads. Roads
        on the map are not clickable.
      </p>
      <p className="hint small">
        An offline connection interrupts affected groups that have not arrived yet. They are retried
        from the sender over a new BFS route. If none exists, delivery is incomplete until you
        restore connectivity. Delivered groups remain delivered. This is a simplified simulation,
        not OSPF.
      </p>
      <p role="status">
        {props.busy
          ? 'Recalculating routes…'
          : count
            ? `${count} offline · ${props.changes} route updates`
            : 'All roads and routers online'}
      </p>
      {count > 0 && (
        <>
          <ul className="fault-list">
            {[...props.nodes].map((id) => control('node', id, label(id), true))}
            {[...props.links].map((id) => control('link', id, roadName(id), true))}
          </ul>
          <button type="button" className="btn" disabled={props.busy} onClick={props.onRestore}>
            Restore all connections
          </button>
        </>
      )}
      <details>
        <summary>Roads ({props.network.links.length})</summary>
        <ul className="fault-list">
          {props.network.links.map((l) =>
            control('link', l.id, roadName(l.id), props.links.has(l.id)),
          )}
        </ul>
      </details>
      <details>
        <summary>Routers</summary>
        <ul className="fault-list">
          {props.network.nodes
            .filter((n) => n.kind === 'router')
            .map((n) => control('node', n.id, n.label, props.nodes.has(n.id)))}
        </ul>
      </details>
    </section>
  );
}
