import { useState, type ReactNode } from 'react';
import type { CameraMode, RigApi } from '../scene3d/CameraRig';
import type { Tone } from './copy';

export type View = '3d' | '2d';

export function Header(props: {
  view: View;
  onView: (v: View) => void;
  /** Why 3D is unavailable (no WebGL, or the scene crashed); null when it can be used. */
  no3d: string | null;
}) {
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
          <button
            type="button"
            className={props.view === '3d' ? 'active' : ''}
            aria-pressed={props.view === '3d'}
            disabled={props.no3d !== null}
            title={props.no3d ?? 'Show the 3D map'}
            onClick={() => props.onView('3d')}
          >
            3D view
          </button>
          <button
            type="button"
            className={props.view === '2d' ? 'active' : ''}
            aria-pressed={props.view === '2d'}
            title="Show the 2D map (keyboard and screen-reader friendly)"
            onClick={() => props.onView('2d')}
          >
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
          <p>
            3D view: drag to orbit, right-drag to pan, scroll to zoom. Auto camera follows the
            action; Follow lead car chases the first car and lets go as soon as you drag.
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

const MODE_NAME: Record<CameraMode, string> = {
  auto: 'Auto',
  overview: 'Overview',
  follow: 'Follow lead car',
  free: 'Free',
};

const CAMERA_MODES: { mode: Exclude<CameraMode, 'free'>; label: string; title: string }[] = [
  { mode: 'auto', label: 'Auto', title: 'Camera follows the action for each phase' },
  { mode: 'overview', label: 'Overview', title: 'Frame the whole network' },
  { mode: 'follow', label: 'Follow lead car', title: 'Chase the car furthest along' },
];

export function CameraControls(props: {
  mode: CameraMode;
  onMode: (m: CameraMode) => void;
  rigRef: { readonly current: RigApi | null };
}) {
  return (
    <>
      <div className="camera-bar">
        <div className="chip-inline">Camera: Orbit · {MODE_NAME[props.mode]}</div>
        <div className="camera-modes" role="group" aria-label="Camera">
          {CAMERA_MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={props.mode === m.mode ? 'active' : ''}
              aria-pressed={props.mode === m.mode}
              title={m.title}
              onClick={() => props.onMode(m.mode)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => props.rigRef.current?.zoom(0.6)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => props.rigRef.current?.zoom(1.6)}>
          −
        </button>
        <button type="button" aria-label="Reset camera" onClick={() => props.onMode('overview')}>
          ⟲
        </button>
      </div>
      <div className="compass north-up" aria-label="North is up">
        <span>N</span>
        <i />
      </div>
      <p className="hint3d">Drag to orbit · scroll to zoom · click a station or road to break it</p>
    </>
  );
}
