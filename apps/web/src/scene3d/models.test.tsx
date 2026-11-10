import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelBoundary, ModelOr, modelUrl } from './models';

describe('ModelOr', () => {
  it('builds model URLs under public/models', () => {
    expect(modelUrl('car-sedan')).toBe('/models/car-sedan.glb');
  });

  it('shows the primitive fallback while the model is still loading', () => {
    const html = renderToStaticMarkup(
      <ModelOr url={modelUrl('never-loads')} fallback={<i>primitive</i>}>
        {() => <b>model</b>}
      </ModelOr>,
    );
    expect(html).toContain('<i>primitive</i>');
    expect(html).not.toContain('<b>model</b>');
  });

  it('switches to the fallback when the model throws', () => {
    expect(ModelBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new ModelBoundary({ fallback: 'primitive', children: 'model' });
    expect(boundary.render()).toBe('model');
    boundary.state = { failed: true };
    expect(boundary.render()).toBe('primitive');
  });
});
