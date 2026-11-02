import { MAP_HEIGHT, MAP_WIDTH, project, type Network } from '@netsim/shared';

interface Props {
  network: Network;
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  pathLinkIds: ReadonlySet<string>;
  visitedNodeIds: ReadonlySet<string>;
  onToggleNode: (id: string) => void;
  onToggleLink: (id: string) => void;
}

/**
 * Static SVG renderer. Positions come from the shared projection so they match the 3D scene.
 * BFS replay and packet animation layer on top of this in later issues.
 */
export function NetworkGraph(props: Props) {
  const { network, disabledNodeIds, disabledLinkIds, pathLinkIds, visitedNodeIds } = props;
  const pos = new Map(network.nodes.map((n) => [n.id, project(n.lat, n.lon)]));

  return (
    <svg
      className="graph"
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label="Simulated West Coast network graph"
    >
      {network.links.map((link) => {
        const a = pos.get(link.source)!;
        const b = pos.get(link.target)!;
        const cls = disabledLinkIds.has(link.id)
          ? 'disabled'
          : pathLinkIds.has(link.id)
            ? 'on-path'
            : '';
        return (
          <g key={link.id} className={`link ${cls}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line
              className="hit"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              onClick={() => props.onToggleLink(link.id)}
            >
              <title>{`${link.source} ↔ ${link.target} · ${link.distanceKm} km (click to toggle)`}</title>
            </line>
          </g>
        );
      })}
      {network.nodes.map((node) => {
        const p = pos.get(node.id)!;
        const isRouter = node.kind === 'router';
        const cls = [
          'node',
          node.kind,
          disabledNodeIds.has(node.id) && 'disabled',
          visitedNodeIds.has(node.id) && 'visited',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={node.id}
            className={cls}
            transform={`translate(${p.x} ${p.y})`}
            onClick={isRouter ? () => props.onToggleNode(node.id) : undefined}
            role={isRouter ? 'button' : undefined}
            tabIndex={isRouter ? 0 : undefined}
            aria-pressed={isRouter ? disabledNodeIds.has(node.id) : undefined}
            aria-label={
              isRouter ? `${node.label} station, ${node.place}. Toggle offline.` : node.label
            }
            onKeyDown={
              isRouter
                ? (e) => (e.key === 'Enter' || e.key === ' ') && props.onToggleNode(node.id)
                : undefined
            }
          >
            <circle r={isRouter ? 8 : 13} />
            <text x={isRouter ? 12 : 17} y={4}>
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
