import { expect, test } from '@playwright/test';
import type { RootState } from '@react-three/fiber';
import type { BufferGeometry, Mesh, MeshBasicMaterial } from 'three';

test('ground overlays retain coverage at far and shallow camera angles', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Las Vegas — toggle router', exact: true }),
  ).toHaveCSS('opacity', '1', { timeout: 30_000 });
  const network = await (await page.request.get('/api/network')).json();
  const index = network.nodes
    .filter((n: { kind: string }) => n.kind === 'router')
    .findIndex((n: { id: string }) => n.id === 'reno');
  const samples = await page.evaluate((renoIndex) => {
    const state = (window as unknown as { __r3f: RootState }).__r3f;
    const renderer = state.gl;
    state.setFrameloop('never');
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1);
    renderer.setSize(800, 600, false);
    type Surface = Mesh<
      BufferGeometry & { parameters?: { radius?: number; width?: number } },
      MeshBasicMaterial
    >;
    const discs: Surface[] = [];
    let ocean: Surface | undefined;
    let road: Surface | undefined;
    // Isolate actual terrain/overlay meshes: decorative occluders must not count as depth defects.
    state.scene.traverse((o) => {
      const mesh = o as Surface;
      if (!mesh.isMesh) return;
      mesh.visible = mesh.geometry.type === 'ExtrudeGeometry';
      if (mesh.geometry.type === 'CircleGeometry' && mesh.geometry.parameters?.radius === 5.2)
        discs.push(mesh);
      if (mesh.geometry.type === 'PlaneGeometry' && mesh.geometry.parameters?.width === 6000)
        ocean = mesh;
      if (mesh.userData.minimumRoadLine && mesh.parent?.userData.roadId === 'reno--klamath-falls')
        road = mesh;
    });
    if (!road || !ocean || !discs[renoIndex])
      throw new Error('Missing real terrain/road/halo meshes');
    const disc = discs[renoIndex]!;
    disc.scale.setScalar(8);
    disc.material.opacity = 0.8;
    road.material.opacity = 1;
    road.material.color.set('#dc2626');
    state.scene.updateMatrixWorld(true);
    const at = disc.getWorldPosition(state.camera.position.clone());
    const camera = state.camera.clone();
    if (!('aspect' in camera)) throw new Error('Expected perspective camera');
    camera.aspect = 800 / 600;
    camera.updateProjectionMatrix();
    const context = renderer.getContext();
    const read = () => {
      renderer.render(state.scene, camera);
      const pixels = new Uint8Array(800 * 600 * 4);
      context.readPixels(0, 0, 800, 600, context.RGBA, context.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const difference = (a: Uint8Array, b: Uint8Array, i: number) =>
      Math.max(
        Math.abs(a[i]! - b[i]!),
        Math.abs(a[i + 1]! - b[i + 1]!),
        Math.abs(a[i + 2]! - b[i + 2]!),
      );
    const coverage = (mesh: Surface) => {
      mesh.visible = false;
      const background = read();
      mesh.visible = true;
      mesh.material.depthTest = false;
      const reference = read();
      mesh.material.depthTest = true;
      const actual = read();
      mesh.visible = false;
      let expected = 0,
        matched = 0;
      for (let i = 0; i < reference.length; i += 4) {
        if (difference(reference, background, i) <= 35) continue;
        expected++;
        if (difference(reference, actual, i) < 20) matched++;
      }
      return { expected, ratio: matched / expected };
    };
    const result = [];
    for (const distance of [1200, 2800])
      for (const elevation of [0.18, 0.6, 1.2]) {
        camera.position
          .copy(at)
          .add(
            state.camera.position
              .clone()
              .set(
                Math.sin(0.32) * distance * Math.cos(elevation),
                distance * Math.sin(elevation),
                Math.cos(0.32) * distance * Math.cos(elevation),
              ),
          );
        camera.lookAt(at);
        camera.updateMatrixWorld();
        const halo = coverage(disc);
        const minimumRoad = coverage(road);
        // Water is below Reno's land surface; it must not cut stripes through an inland patch.
        const landOnly = read();
        ocean.visible = true;
        const withWater = read();
        ocean.visible = false;
        let landMatched = 0;
        for (let y = 296; y < 304; y++)
          for (let x = 396; x < 404; x++)
            if (difference(landOnly, withWater, (y * 800 + x) * 4) < 10) landMatched++;
        result.push({ distance, elevation, halo, minimumRoad, landRatio: landMatched / 64 });
      }
    return result;
  }, index);
  for (const sample of samples) {
    expect(sample.halo.expected, JSON.stringify(sample)).toBeGreaterThan(40);
    expect(sample.halo.ratio, JSON.stringify(sample)).toBeGreaterThan(0.97);
    expect(sample.minimumRoad.expected, JSON.stringify(sample)).toBeGreaterThan(5);
    expect(sample.minimumRoad.ratio, JSON.stringify(sample)).toBeGreaterThan(0.95);
    expect(sample.landRatio, JSON.stringify(sample)).toBeGreaterThan(0.98);
  }
});
