import type { RoutingAlgorithm } from '@netsim/shared';

export function RoutingControls(props: {
  algorithm: RoutingAlgorithm;
  locked: boolean;
  failuresLocked?: boolean;
  onChange: (mode: RoutingAlgorithm) => void;
  onResetBandwidths: () => void;
  customized: number;
}) {
  return (
    <section className="card" aria-label="Routing settings">
      <h2>Routing algorithm</h2>
      <div className="routing-options" role="radiogroup" aria-label="Routing algorithm">
        {(['bfs', 'dijkstra'] as const).map((algorithm) => (
          <button
            key={algorithm}
            type="button"
            role="radio"
            aria-checked={props.algorithm === algorithm}
            className={`btn ${props.algorithm === algorithm ? 'primary' : ''}`}
            disabled={props.locked}
            onClick={() => props.onChange(algorithm)}
          >
            {algorithm === 'bfs' ? 'BFS · fewest hops' : 'Dijkstra · lowest cost'}
          </button>
        ))}
      </div>
      <p className="hint">
        {props.algorithm === 'bfs'
          ? 'BFS chooses the fewest remaining hops. Live updates can give groups different routes.'
          : 'Dijkstra minimizes remaining configured cost, not hop count. Live updates can give groups different routes.'}
      </p>
      {props.algorithm === 'dijkstra' && (
        <p className="hint small">
          Edit bandwidth in Live network → Roads. Cost = 1000 / Mbps: 10 Mbps → 100, 100 Mbps → 10,
          1000 Mbps → 1. These are configured costs, not measured latency.
        </p>
      )}
      <p className="hint small">
        {props.locked
          ? props.failuresLocked
            ? 'Routing settings and outage controls are locked during the congestion demo.'
            : 'Routing settings are locked during a transfer. Online/offline switches still work.'
          : 'Settings apply to the next Send. Switching algorithm starts a new route comparison.'}
      </p>
      {props.algorithm === 'dijkstra' && (
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
