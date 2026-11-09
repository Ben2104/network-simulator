import { useEffect, useState } from 'react';
import { bandwidthFor, type Network, type RoutingAlgorithm } from '@netsim/shared';
import { RoadEditor } from './RoadEditor';

export function LiveNetwork(props: {
  network: Network;
  onRoadPreview: (id: string | null) => void;
  onNodePreview: (id: string | null) => void;
  algorithm: RoutingAlgorithm;
  bandwidths: Readonly<Record<string, number>>;
  settingsLocked: boolean;
  routeLinks: readonly string[];
  onBandwidth: (id: string, mbps: number) => void;
  nodes: ReadonlySet<string>;
  links: ReadonlySet<string>;
  busy: boolean;
  changes: number;
  onToggle: (kind: 'node' | 'link', id: string) => void;
  onRestore: () => void;
}) {
  const [hoveredRoad, setHoveredRoad] = useState<string | null>(null);
  const [editingRoad, setEditingRoad] = useState<string | null>(null);
  const [roadsOpen, setRoadsOpen] = useState(false);
  const preview = roadsOpen
    ? ((props.algorithm === 'dijkstra' ? editingRoad : null) ?? hoveredRoad)
    : null;
  const { onRoadPreview } = props;
  useEffect(() => {
    onRoadPreview(preview);
    return () => onRoadPreview(null);
  }, [preview, onRoadPreview]);
  const label = (id: string) => props.network.nodes.find((n) => n.id === id)?.label ?? id;
  const roadName = (id: string) => {
    const road = props.network.links.find((l) => l.id === id)!;
    return `${label(road.source)} – ${label(road.target)}`;
  };
  const count = props.nodes.size + props.links.size;
  const control = (kind: 'node' | 'link', id: string, name: string, offline: boolean) => (
    <li
      key={id}
      className="fault-row"
      onMouseEnter={() => props.onNodePreview(kind === 'node' ? id : null)}
      onMouseLeave={() => props.onNodePreview(null)}
      onFocus={() => props.onNodePreview(kind === 'node' ? id : null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) props.onNodePreview(null);
      }}
    >
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
        on the map are not clickable. Hover a road or router below to highlight it on the map.
      </p>
      <p className="hint small">
        An offline connection interrupts affected groups that have not arrived yet. They are retried
        from the sender over a new{' '}
        {props.algorithm === 'dijkstra' ? 'minimum-cost Dijkstra' : 'fewest-hop BFS'} route. If none
        exists, delivery is incomplete until you restore connectivity. Delivered groups remain
        delivered. This is a simplified simulation, not OSPF.
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
      <details
        onToggle={(e) => {
          setRoadsOpen(e.currentTarget.open);
          if (!e.currentTarget.open) {
            setHoveredRoad(null);
            setEditingRoad(null);
          }
        }}
      >
        <summary>Roads ({props.network.links.length})</summary>
        <ul className="fault-list">
          {props.network.links.map((l) => (
            <RoadEditor
              key={`${l.id}:${bandwidthFor(l.id, props.bandwidths)}:${props.algorithm}`}
              id={l.id}
              editing={editingRoad === l.id}
              previewed={preview === l.id}
              onEditing={(editing) => {
                setEditingRoad(editing ? l.id : null);
                if (!editing) setHoveredRoad(null);
              }}
              onPreview={(active) => setHoveredRoad(active ? l.id : null)}
              weighted={props.algorithm === 'dijkstra'}
              label={roadName(l.id)}
              distanceKm={l.distanceKm}
              mbps={bandwidthFor(l.id, props.bandwidths)}
              offline={props.links.has(l.id)}
              busy={props.busy}
              locked={props.settingsLocked}
              onRoute={props.routeLinks.includes(l.id)}
              onToggle={() => props.onToggle('link', l.id)}
              onApply={(mbps) => props.onBandwidth(l.id, mbps)}
            />
          ))}
        </ul>
      </details>
      <details
        onToggle={(e) => {
          if (!e.currentTarget.open) props.onNodePreview(null);
        }}
      >
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
