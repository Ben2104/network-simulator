import { useState } from 'react';
import { ROUTING, bandwidthCost } from '@netsim/shared';

export function RoadEditor(props: {
  id: string;
  weighted: boolean;
  label: string;
  distanceKm: number;
  mbps: number;
  offline: boolean;
  busy: boolean;
  locked: boolean;
  onRoute: boolean;
  editing: boolean;
  previewed: boolean;
  onEditing: (editing: boolean) => void;
  onPreview: (active: boolean) => void;
  onToggle: () => void;
  onApply: (mbps: number) => void;
}) {
  const { editing, onEditing: setEditing } = props;
  const [draft, setDraft] = useState(props.mbps);
  return (
    <li
      className={`road-row ${props.previewed ? 'road-previewed' : ''}`}
      data-testid={`road-${props.id}`}
      onMouseEnter={() => props.onPreview(true)}
      onMouseLeave={() => props.onPreview(false)}
      onFocus={() => props.onPreview(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) props.onPreview(false);
      }}
    >
      <div className="fault-row">
        <div className="road-title">
          <span>{props.label}</span>
          <span className="hint small">
            {props.distanceKm.toFixed(1)} km
            {props.weighted && (
              <>
                {' '}
                · {props.mbps.toLocaleString('en-US')} Mbps · cost {bandwidthCost(props.mbps)}
              </>
            )}
          </span>
          {props.onRoute && <span className="hint small route-text">On an active group route</span>}
        </div>
        <div className="road-actions">
          <button
            type="button"
            role="switch"
            aria-checked={!props.offline}
            aria-label={`${props.label} online`}
            disabled={props.busy}
            className={`btn ${props.offline ? 'fault-offline' : ''}`}
            onClick={props.onToggle}
          >
            {props.offline ? '✕ Offline' : '✓ Online'}
          </button>
          {props.weighted && (
            <button
              type="button"
              className="btn"
              aria-label={`Edit ${props.label} bandwidth`}
              aria-expanded={editing}
              disabled={props.locked}
              onClick={() => {
                setDraft(props.mbps);
                setEditing(!editing);
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>
      {props.weighted && editing && (
        <form
          className="bandwidth-editor"
          onSubmit={(e) => {
            e.preventDefault();
            props.onApply(draft);
            setEditing(false);
          }}
        >
          <label className="field-label" htmlFor={`bandwidth-${props.id}`}>
            Bandwidth (Mbps)
          </label>
          <select
            id={`bandwidth-${props.id}`}
            value={draft}
            disabled={props.locked}
            onChange={(e) => setDraft(Number(e.target.value))}
          >
            {ROUTING.bandwidthOptions.map((value) => (
              <option key={value} value={value}>
                {value.toLocaleString('en-US')} Mbps · cost {bandwidthCost(value)}
              </option>
            ))}
          </select>
          <div className="row">
            <button type="submit" className="btn primary" disabled={props.locked}>
              Apply
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
