import { useState, type ReactNode } from 'react';
import type { Tone } from './copy';

export function Header() {
  const [help, setHelp] = useState(false);
  return (
    <header className="header">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
          </svg>
        </span>
        <h1>
          Packet Highway <span className="dash">—</span> Network Route Simulator
        </h1>
        <span className="pill">Illustrative network — not real internet routing</span>
      </div>
      <div className="header-right">
        <div className="view-switch" role="group" aria-label="View">
          <button type="button" disabled title="The 3D view is not built yet">
            3D view
          </button>
          <button type="button" className="active" aria-pressed="true">
            2D view
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Help"
          aria-expanded={help}
          onClick={() => setHelp((h) => !h)}
        >
          ?
        </button>
      </div>
      {help && (
        <div className="help" role="note">
          <p>
            Submit a message or file size. It splits into 1,500-byte packets bundled into up to 24
            cars. Send runs a breadth-first search for the fewest-hop route, then each car picks one
            of the equally short routes at random and drives from the CSULB lot to the Oregon data
            center.
          </p>
          <p>
            Click a station or road to break it, then Send again. Use the speed control to slow the
            cars down for a presentation.
          </p>
        </div>
      )}
    </header>
  );
}

export function Banner(props: { tone: Tone; text: string; right?: ReactNode }) {
  return (
    <div className={`banner ${props.tone}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span className="banner-text">{props.text}</span>
      {props.right}
    </div>
  );
}

export function Footer(props: { text: string; hint: string; tone: Tone }) {
  return (
    <footer className="footer">
      <span className={`footer-state ${props.tone}`}>
        <span className="dot" aria-hidden="true" />
        {props.text}
      </span>
      <span className="footer-hint">{props.hint}</span>
    </footer>
  );
}

export function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <h3>Legend</h3>
      <ul>
        <li>
          <i className="key lot" /> Parking lot
        </li>
        <li>
          <i className="key route" /> Chosen route
        </li>
        <li>
          <i className="key station" /> Station
        </li>
        <li>
          <i className="key car" /> Packet car
        </li>
        <li>
          <i className="key visited" /> Visited by BFS
        </li>
        <li>
          <i className="key broken" /> Broken / offline
        </li>
      </ul>
    </div>
  );
}

export function MapControls(props: { zoom: number; onZoom: (z: number) => void }) {
  const set = (z: number) => props.onZoom(Math.min(3, Math.max(1, z)));
  return (
    <>
      <div className="chip projection">Projection: 2D Orthogonal Topological Graph</div>
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => set(props.zoom + 0.5)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => set(props.zoom - 0.5)}>
          −
        </button>
        <button type="button" aria-label="Reset zoom" onClick={() => set(1)}>
          ⟲
        </button>
      </div>
      <div className="compass" aria-label="North is up and to the right">
        <span>N</span>
        <i />
      </div>
    </>
  );
}
