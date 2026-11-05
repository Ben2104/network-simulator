import { useEffect, useState } from 'react';

/** After this long without an answer, explain that the free server is waking up. */
const SLOW_MS = 4_000;

interface Props {
  /** The 3D map code has downloaded (or is not needed). */
  mapReady: boolean;
  /** The network has loaded from the API. */
  serverReady: boolean;
  /** Retry attempt while the server wakes; 1 on the first try. */
  attempt: number;
}

function Step({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <li className={`load-step${done ? ' done' : active ? ' active' : ''}`}>
      <span className="load-dot" aria-hidden="true">
        {done ? '✓' : ''}
      </span>
      {label}
    </li>
  );
}

/** Full-canvas loading screen shown until the network and the 3D map are both ready. */
export function LoadingScreen({ mapReady, serverReady, attempt }: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(id);
  }, []);

  const slow = !serverReady && elapsed >= SLOW_MS;
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="load-road" aria-hidden="true">
        <span className="load-car" />
      </div>
      <h2 className="load-title">Starting Packet Highway</h2>
      <ol className="load-steps">
        <Step done={mapReady} active={!mapReady} label="Loading the 3D map" />
        <Step
          done={serverReady}
          active={!serverReady}
          label={slow ? `Waking the route server… ${seconds}s` : 'Connecting to the route server'}
        />
      </ol>
      {slow && (
        <p className="load-note">
          The route server runs on a free host that sleeps when nobody is using it. The first visit
          can take up to a minute while it starts; after that it is fast.
          {attempt > 1 && <span className="mono"> · try {attempt}</span>}
        </p>
      )}
    </div>
  );
}
