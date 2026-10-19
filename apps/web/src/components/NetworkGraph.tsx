import type { Network } from '@netsim/shared';

interface Props {
  network: Network;
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  pathLinkIds: ReadonlySet<string>;
  visitedNodeIds: ReadonlySet<string>;
  onToggleNode: (id: string) => void;
  onToggleLink: (id: string) => void;
}

/** Static SVG renderer. BFS replay and packet animation layer on top of this in later issues. */
export function NetworkGraph(props: Props) {
  const { network, disabledNodeIds, disabledLinkIds, pathLinkIds, visitedNodeIds } = props;
  const byId = new Map(network.nodes.map((n) => [n.id, n]));

  return (
    <svg className="graph" viewBox="0 0 1000 600" role="img" aria-label="Simulated network graph">
      {network.links.map((link) => {
        const a = byId.get(link.source)!;
        const b = byId.get(link.target)!;
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
              <title>{`Link ${link.source} ↔ ${link.target} (click to toggle)`}</title>
            </line>
          </g>
        );
      })}
      {network.nodes.map((node) => {
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
            transform={`translate(${node.x} ${node.y})`}
            onClick={isRouter ? () => props.onToggleNode(node.id) : undefined}
            role={isRouter ? 'button' : undefined}
            tabIndex={isRouter ? 0 : undefined}
            aria-pressed={isRouter ? disabledNodeIds.has(node.id) : undefined}
            aria-label={isRouter ? `${node.label}, click to toggle` : node.label}
            onKeyDown={
              isRouter
                ? (e) => (e.key === 'Enter' || e.key === ' ') && props.onToggleNode(node.id)
                : undefined
            }
          >
            <circle r={isRouter ? 28 : 36} />
            <text y={isRouter ? 48 : 58} textAnchor="middle">
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
