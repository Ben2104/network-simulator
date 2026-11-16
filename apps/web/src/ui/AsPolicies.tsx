import { AS_RELATIONSHIPS, AUTONOMOUS_SYSTEMS, autonomousSystem } from '@netsim/shared';
import { asLabel } from './copy';

/** The illustrative AS map and agreements used by BGP mode. */
export function AsPolicies() {
  return (
    <details className="as-policies">
      <summary>Autonomous Systems and agreements</summary>
      <p className="hint small">
        Invented networks with private AS numbers, for teaching only. Roads between two ASes carry
        traffic only if their agreement lets the route be advertised: providers and peers pass on
        routes learned from customers, but routes learned from a peer or provider are only passed on
        to customers.
      </p>
      <ul className="as-list">
        {AUTONOMOUS_SYSTEMS.map((as) => (
          <li key={as.asn}>
            <strong>{asLabel(as.asn)}</strong> · {as.role}
          </li>
        ))}
      </ul>
      <ul className="as-list">
        {AS_RELATIONSHIPS.map((r) => (
          <li key={`${r.a}-${r.b}`}>
            {r.kind === 'peer'
              ? `${autonomousSystem(r.a)!.name} ⇄ ${autonomousSystem(r.b)!.name} · peers`
              : `${autonomousSystem(r.a)!.name} → ${autonomousSystem(r.b)!.name} · provider → customer`}
          </li>
        ))}
      </ul>
    </details>
  );
}
