import { expect, test } from '@playwright/test';

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

test('partial delivery plus a full outage keeps rendered cars, counts and frozen timers in sync', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Las Vegas — toggle router', exact: true }),
  ).toHaveCSS('opacity', '1', { timeout: 30_000 });
  // Lower raster resolution for software WebGL; world positions and status checks stay unchanged.
  await page.evaluate(() =>
    (window as unknown as { __r3f: import('@react-three/fiber').RootState }).__r3f.setDpr(0.5),
  );
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
  let delivered = 0;
  for (let i = 0; i < 400 && delivered === 0; i++) {
    await page.clock.fastForward(1_000);
    delivered = parseInt((await timing.locator('dd').nth(2).innerText()).split('/')[0]!);
  }
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  delivered = parseInt((await timing.locator('dd').nth(2).innerText()).split('/')[0]!);
  expect(delivered).toBeGreaterThan(0);
  expect(delivered).toBeLessThan(24);
  const live = page.getByRole('region', { name: 'Live network failures' });
  await live.getByText('Routers', { exact: true }).click();
  for (const [i, name] of ['San Jose', 'Sacramento', 'Winnemucca'].entries()) {
    await live.getByRole('switch', { name: `${name} online`, exact: true }).click();
    await expect(live).toContainText(`${i + 1} route updates`);
  }
  await expect(page.locator('.state-chip')).toContainText('BLOCKED');
  await expect(page.locator('.banner')).toContainText('No route — transfer incomplete');
  await expect(timing.locator('dd').nth(2)).toHaveText(`${delivered} / 24`);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.fastForward(1_000);
  const rendered = await page.evaluate(() => {
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
