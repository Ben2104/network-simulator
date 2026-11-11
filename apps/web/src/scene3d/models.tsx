import { Component, useEffect, useReducer, type ReactNode } from 'react';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Kenney glTF models served from `public/models/` (sources and licenses in `ASSETS.md`). */
export function modelUrl(name: string): string {
  return `${import.meta.env.BASE_URL}models/${name}.glb`;
}

type Entry =
  | { status: 'loading'; promise: Promise<void> }
  | { status: 'ok'; scene: Object3D }
  | { status: 'failed' };

/** One load per URL for the whole app; every component using that model shares it. */
const cache = new Map<string, Entry>();

function load(url: string): Entry {
  let entry = cache.get(url);
  if (entry) return entry;
  const promise = new GLTFLoader().loadAsync(url).then(
    (gltf) => {
      cache.set(url, { status: 'ok', scene: gltf.scene });
    },
    (error: unknown) => {
      cache.set(url, { status: 'failed' });
      if (import.meta.env.DEV)
        console.warn(`Model ${url} failed to load; using primitives.`, error);
    },
  );
  entry = { status: 'loading', promise };
  cache.set(url, entry);
  return entry;
}

/**
 * The loaded scene for `url`, or null while it loads or if it failed. It never throws or suspends:
 * a missing model is cosmetic, so callers keep their primitive and the scene keeps running. (R3F
 * reports every error an error boundary catches as a page error, once per component.)
 */
export function useModel(url: string): Object3D | null {
  const entry = load(url);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let live = true;
    if (entry.status === 'loading') void entry.promise.then(() => live && rerender());
    return () => {
      live = false;
    };
  }, [entry]);
  return entry.status === 'ok' ? entry.scene : null;
}

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/** Keeps the fallback if building the model's meshes throws (for example, an unexpected file). */
export class ModelBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface Props {
  /** Model URL, usually from `modelUrl()`. */
  url: string;
  /** Primitive version, shown while the model loads and kept if it fails. */
  fallback: ReactNode;
  /** Renders the loaded scene; clone it (drei `<Clone>`) when it is used more than once. */
  children: (scene: Object3D) => ReactNode;
}

/** Shows a glTF model, or its primitive fallback while loading and if the model fails. */
export function ModelOr({ url, fallback, children }: Props) {
  const scene = useModel(url);
  if (!scene) return <>{fallback}</>;
  return (
    <ModelBoundary key={url} fallback={fallback}>
      {children(scene)}
    </ModelBoundary>
  );
}
