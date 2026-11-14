import { usesLinkCost, type RoutingAlgorithm } from '@netsim/shared';
import { AsPolicies } from './AsPolicies';

const OPTION_LABEL: Record<RoutingAlgorithm, string> = {
  bfs: 'BFS · fewest hops',
  dijkstra: 'Dijkstra · lowest cost',
  bgp: 'BGP · AS policy',
};

const HINT: Record<RoutingAlgorithm, string> = {
  bfs: 'BFS chooses the fewest remaining hops. Live updates can give groups different routes.',
  dijkstra:
    'Dijkstra minimizes remaining configured cost, not hop count, like OSPF link costs. Live updates can give groups different routes.',
  bgp: 'BGP picks a path through Autonomous Systems by business policy first: routes from customers beat routes from peers, which beat routes from paid providers. Then the shortest AS path wins. Inside each AS, roads are chosen by configured cost.',
};

export function RoutingControls(props: {
  algorithm: RoutingAlgorithm;
  locked: boolean;
  onChange: (mode: RoutingAlgorithm) => void;
  onResetBandwidths: () => void;
  customized: number;
}) {
  const weighted = usesLinkCost(props.algorithm);
  return (
    <section className="card" aria-label="Routing settings">
      <h2>Routing algorithm</h2>
      <div className="routing-options" role="radiogroup" aria-label="Routing algorithm">
        {(['bfs', 'dijkstra', 'bgp'] as const).map((algorithm) => (
          <button
            key={algorithm}
            type="button"
            role="radio"
            aria-checked={props.algorithm === algorithm}
            className={`btn ${props.algorithm === algorithm ? 'primary' : ''}`}
            disabled={props.locked}
            onClick={() => props.onChange(algorithm)}
          >
            {OPTION_LABEL[algorithm]}
          </button>
        ))}
      </div>
      <p className="hint">{HINT[props.algorithm]}</p>
      {weighted && (
        <p className="hint small">
          Edit bandwidth in Live network → Roads. Cost = 1000 / Mbps: 10 Mbps → 100, 100 Mbps → 10,
          1000 Mbps → 1. These are configured costs, not measured latency.
          {props.algorithm === 'bgp' && ' In BGP mode they only choose roads inside each AS.'}
        </p>
      )}
      {props.algorithm === 'bgp' && <AsPolicies />}
      <p className="hint small">
        {props.locked
          ? 'Routing settings are locked during a transfer. Online/offline switches still work.'
          : 'Settings apply to the next Send. Switching algorithm starts a new route comparison.'}
      </p>
      {weighted && (
        <button
          type="button"
          className="btn"
          disabled={props.locked || props.customized === 0}
          onClick={props.onResetBandwidths}
        >
          Reset bandwidths to 1000 Mbps
        </button>
      )}
    </section>
  );
}
