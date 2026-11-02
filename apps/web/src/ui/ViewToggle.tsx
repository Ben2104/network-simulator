import { useEffect, useState } from 'react';

export type NetworkView = '2d' | '3d';

type ViewToggleProps = {
  view: NetworkView;
  onChange: (view: NetworkView) => void;
  /** Set true once a 3D renderer is connected to the app. */
  is3dAvailable?: boolean;
};

export function ViewToggle({ view, onChange, is3dAvailable = true }: ViewToggleProps) {
  const [motionReduced, setMotionReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [webglAvailable] = useState(canCreateWebGLContext);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = (event: MediaQueryListEvent) => setMotionReduced(event.matches);
    media.addEventListener('change', updateMotionPreference);

    return () => media.removeEventListener('change', updateMotionPreference);
  }, []);

  const canUse3d = is3dAvailable && webglAvailable && !motionReduced;

  useEffect(() => {
    if (!canUse3d && view !== '2d') onChange('2d');
  }, [canUse3d, onChange, view]);

  return (
    <fieldset className="view-toggle" aria-label="Network view">
      <legend>View</legend>
      <button
        type="button"
        className={view === '2d' ? 'selected' : ''}
        aria-pressed={view === '2d'}
        onClick={() => onChange('2d')}
      >
        2D
      </button>
      <button
        type="button"
        className={view === '3d' ? 'selected' : ''}
        aria-pressed={view === '3d'}
        disabled={!canUse3d}
        title={
          motionReduced
            ? '3D is unavailable while reduced motion is enabled.'
            : !webglAvailable
              ? '3D is unavailable because WebGL is not supported.'
              : !is3dAvailable
                ? '3D view is not connected yet.'
                : undefined
        }
        onClick={() => canUse3d && onChange('3d')}
      >
        3D
      </button>
    </fieldset>
  );
}

function canCreateWebGLContext() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}
