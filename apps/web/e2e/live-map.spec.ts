import { expect, test } from '@playwright/test';
import type { SimulationDebug } from '../src/sim/useSimulation';

test('a router can be switched offline and back by clicking its map label', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.scene3d canvas')).toBeVisible({ timeout: 30_000 });
  const online = page.getByRole('button', { name: 'Las Vegas — toggle router', exact: true });
  // Labels become interactive only once the 3D tracker has placed them.
  await expect(online).toHaveCSS('opacity', '1', { timeout: 30_000 });
  await online.click();
  const offline = page.getByRole('button', {
    name: 'Las Vegas · Offline — toggle router',
    exact: true,
  });
  await expect(offline).toHaveCSS('opacity', '1');
  await offline.click();
  await expect(online).toHaveCount(1);
  await expect(offline).toHaveCount(0);
});

test('clicking a road does not toggle a router or a road', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Las Vegas — toggle router', exact: true }),
  ).toHaveCSS('opacity', '1', { timeout: 30_000 });
  const network = await (await page.request.get('/api/network')).json();
  const { buildWorld } = await import('../src/scene3d/world');
  const world = buildWorld(network);
  const curve = world.roads.get('las-vegas--tonopah')!;
  const at = curve[Math.floor(curve.length / 2)]!;
  const screen = await page.evaluate((at) => {
    const state = (window as unknown as { __r3f: import('@react-three/fiber').RootState }).__r3f;
    const p = state.camera.position.clone().set(at.x, 0.1, at.z).project(state.camera);
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  }, at);
  await page.mouse.click(screen.x, screen.y);
  await expect(page.getByRole('region', { name: 'Live network failures' })).toContainText(
    'All roads and routers online',
  );
  await expect(page.locator('.label3d.offline')).toHaveCount(0);
});

test('groups past a failed router finish while later groups block, with rendered cars and timers in sync', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Las Vegas — toggle router', exact: true }),
  ).toHaveCSS('opacity', '1', { timeout: 30_000 });
  // Render on demand at lower raster resolution in software WebGL. Assertions still inspect
  // the actual renderer objects; neither car geometry nor the real API response is mocked.
  await page.evaluate(() => {
    const state = (window as unknown as { __r3f: import('@react-three/fiber').RootState }).__r3f;
    state.setDpr(0.5);
    state.setFrameloop('demand');
  });
  const network = await (await page.request.get('/api/network')).json();
  const { buildWorld, lotSlot } = await import('../src/scene3d/world');
  const world = buildWorld(network);
  await page.getByRole('button', { name: 'Presets' }).click();
  await page.getByRole('button', { name: /lecture\.mp4/ }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('radio', { name: '2×', exact: true }).click();
  const first = page.waitForResponse('**/api/route');
  await page.getByRole('button', { name: '➤ Send', exact: true }).click();
  await first;
  const timing = page.getByRole('region', { name: 'Transfer timing', exact: true });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __packetHighway?: SimulationDebug }).__packetHighway?.paused,
      ),
    )
    .toBe(true);
  const delivered = await page.evaluate(() => {
    const debug = (window as Window & { __packetHighway?: SimulationDebug }).__packetHighway!;
    const firstPass = Math.min(
      ...debug.plans.map((p) => p.nodeTimes![p.route.nodeIds.indexOf('san-jose')]!),
    );
    const now = firstPass + 0.01;
    debug.seek(now);
    return debug.plans.filter((p) => p.nodeTimes![p.route.nodeIds.indexOf('san-jose')]! < now)
      .length;
  });
  await expect(timing.locator('dd').nth(2)).toHaveText('0 / 24');
  expect(delivered).toBeGreaterThan(0);
  expect(delivered).toBeLessThan(24);
  const live = page.getByRole('region', { name: 'Live network failures' });
  await live.getByText('Routers', { exact: true }).click();
  for (const [i, name] of ['San Jose', 'Sacramento', 'Winnemucca'].entries()) {
    const reroute = page.waitForResponse('**/api/route');
    await live.getByRole('switch', { name: `${name} online`, exact: true }).click();
    expect((await reroute).ok()).toBe(true);
    await expect(live).toContainText(`${i + 1} route updates`);
  }
  await expect(page.locator('.state-chip')).toContainText('DRIVING');
  // A failed router behind the lead must not hide the online road the lead is still using.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (window as unknown as { __r3f: import('@react-three/fiber').RootState })
          .__r3f;
        const roads: Record<string, string> = {};
        state.scene.traverse((o) => {
          if (['san-jose--oakland', 'csulb--el-segundo'].includes(o.userData.roadId))
            roads[o.userData.roadId] = o.userData.state;
        });
        return roads;
      }),
    )
    .toEqual({ 'san-jose--oakland': 'path', 'csulb--el-segundo': 'idle' });
  await page.evaluate(() => {
    const debug = (window as Window & { __packetHighway?: SimulationDebug }).__packetHighway!;
    debug.seek(Math.max(...debug.arrivals));
  });
  await expect(page.locator('.state-chip')).toContainText('BLOCKED');
  await expect(page.locator('.banner')).toContainText('No route — transfer incomplete');
  await expect(timing.locator('dd').nth(2)).toHaveText(`${delivered} / 24`);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { __r3f: import('@react-three/fiber').RootState }).__r3f.invalidate(),
  );
  const readRendered = () =>
    page.evaluate(() => {
      const state = (window as unknown as { __r3f: import('@react-three/fiber').RootState }).__r3f;
      const cars: { id: string; status: string; x: number; z: number }[] = [];
      state.scene.traverse((o) => {
        if (o.userData.packetCarId)
          cars.push({
            id: o.userData.packetCarId,
            status: o.userData.packetStatus,
            x: o.position.x,
            z: o.position.z,
          });
      });
      return cars;
    });
  await expect
    .poll(async () => {
      const cars = await readRendered();
      return {
        total: cars.length,
        arrived: cars.filter((p) => p.status === 'arrived').length,
        blocked: cars.filter((p) => p.status === 'blocked').length,
      };
    })
    .toEqual({ total: 24, arrived: delivered, blocked: 24 - delivered });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (window as unknown as { __r3f: import('@react-three/fiber').RootState })
          .__r3f;
        let active = 0;
        state.scene.traverse((o) => {
          if (o.userData.roadId && o.userData.state === 'path') active++;
        });
        return active;
      }),
    )
    .toBe(0);
  const rendered = await readRendered();
  expect(rendered).toHaveLength(24);
  expect(rendered.filter((p) => p.status === 'arrived')).toHaveLength(delivered);
  expect(rendered.filter((p) => p.status === 'blocked')).toHaveLength(24 - delivered);
  for (const p of rendered) {
    const seq = Number(p.id.replace('car-', ''));
    const slot = lotSlot(p.status === 'arrived' ? world.server : world.client, seq).slot;
    expect(p.x).toBeCloseTo(slot.x, 3);
    expect(p.z).toBeCloseTo(slot.z, 3);
  }
  await expect(page.locator('.labels3d')).toContainText(`server · ${delivered} / 24 delivered`);
  await page.screenshot({ path: test.info().outputPath('partial-outage.png'), fullPage: true });
  const frozen = await timing.locator('dd').first().innerText();
  const groupTimes = await timing.locator('tbody td:last-child').allTextContents();
  await page.clock.fastForward(2_000);
  await expect(timing.locator('dd').first()).toHaveText(frozen);
  expect(await timing.locator('tbody td:last-child').allTextContents()).toEqual(groupTimes);
});
