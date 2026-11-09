import type { Car } from '@netsim/shared';
import { groupTravelTime, transferTiming } from '../sim/reroute';
import { carStatus, type Timeline } from '../sim/timeline';

const seconds = (n: number) => `${Math.max(0, n).toFixed(2)} s`;

export function TransferTiming(props: {
  timeline: Timeline | null;
  cars: readonly Car[];
  now: number;
  paused: boolean;
}) {
  const { timeline, now } = props;
  const timing = timeline ? transferTiming(timeline, now) : null;
  return (
    <section className="card" aria-label="Transfer timing">
      <h2>Transfer timing</h2>
      <p className="hint">
        Simulation seconds, not measured network latency. Each car carries a group of packets.
      </p>
      {!timeline || !timing ? (
        <p className="hint">Send a file or message to see timings.</p>
      ) : (
        <>
          <dl className="timing-summary">
            <div>
              <dt>Transfer run time{props.paused ? ' (paused)' : ''}</dt>
              <dd>{seconds(timing.elapsed)}</dd>
            </div>
            <div>
              <dt>{timing.finished ? 'Total completion time' : 'Estimated total completion'}</dt>
              <dd>{timing.total === null ? 'Incomplete — no route' : seconds(timing.total)}</dd>
            </div>
            <div>
              <dt>Delivered groups</dt>
              <dd>
                {timing.arrived} / {props.cars.length}
              </dd>
            </div>
          </dl>
          <p className="hint small">
            Groups travel concurrently; their times are not added together. No route means the
            transfer is incomplete. Blocked groups wait at the sender; their timers stop. The run
            clock stops when every group is delivered or blocked, and resumes after connectivity
            returns.
          </p>
          <div className="timing-scroll" tabIndex={0} role="region" aria-label="Packet group times">
            <table className="timing-table">
              <caption>Active travel time across attempts; blocked waits excluded</caption>
              <thead>
                <tr>
                  <th scope="col">Group / packets</th>
                  <th scope="col">Status</th>
                  <th scope="col">Travel time</th>
                </tr>
              </thead>
              <tbody>
                {props.cars.map((car) => {
                  const plan = timeline.plans.find((p) => p.carId === car.id);
                  const status = plan ? carStatus(plan, now) : 'blocked';
                  const elapsed = plan ? groupTravelTime(plan, now) : 0;
                  return (
                    <tr key={car.id}>
                      <th scope="row">
                        #{car.seq + 1}
                        <span className="hint small">
                          Packets {car.firstPacket + 1}–{car.lastPacket + 1}
                        </span>
                      </th>
                      <td>
                        {status === 'blocked' ? 'No route — waiting at sender' : status}
                        {!!plan?.retries && (
                          <span className="hint small">Retries: {plan.retries}</span>
                        )}
                      </td>
                      <td>{plan ? seconds(elapsed) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
