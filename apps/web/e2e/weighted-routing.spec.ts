import { expect, test, type Page } from '@playwright/test';
import { pathCost } from '@netsim/shared';

test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

async function send(page: Page) {
  const reply = page.waitForResponse('**/api/route');
  await page
    .getByRole('region', { name: 'Send and playback' })
    .getByRole('button', { name: /Send/ })
    .first()
    .click();
  const response = await reply;
  expect(response.status()).toBe(200);
  return response.json();
}
async function edit(page: Page, id: string, value: string) {
  const row = page.getByTestId(`road-${id}`);
  await row.getByRole('button', { name: /^Edit / }).click();
  const select = row.getByLabel('Bandwidth (Mbps)');
  expect(
    await select
      .locator('option')
      .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value)),
  ).toEqual(['10', '100', '1000']);
  await select.selectOption(value);
  await row.getByRole('button', { name: 'Apply', exact: true }).click();
  return row;
}
async function finish(page: Page) {
  await page.clock.runFor(100_000);
  await expect(page.locator('.state-chip')).toContainText('DELIVERED');
}

test('same road settings: BFS ignores bandwidth, Dijkstra avoids the more expensive route', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto('/');
  const settings = page.getByRole('region', { name: 'Routing settings' });
  const dijkstra = settings.getByRole('radio', { name: 'Dijkstra · lowest cost', exact: true });
  const bfs = settings.getByRole('radio', { name: 'BFS · fewest hops', exact: true });
  await dijkstra.click();
  await page.getByLabel('Enter message or select sample').fill('Compare algorithms');
  await page.getByRole('button', { name: 'Packetize message' }).click();
  const live = page.getByRole('region', { name: 'Live network failures' });
  await live.getByText(/^Roads \(/).click();
  const baseline = await send(page);
  expect(baseline.algorithm).toBe('dijkstra');
  const slowId = baseline.linkPath[0];
  await expect(dijkstra).toBeDisabled();
  await expect(
    page.getByTestId(`road-${slowId}`).getByRole('button', { name: /^Edit / }),
  ).toBeDisabled();
  await finish(page);
  const row = await edit(page, slowId, '10');
  await expect(row).toContainText('10 Mbps · cost 100');
  await expect(dijkstra).toHaveAttribute('aria-checked', 'true');
  const legacy = await (
    await page.request.post('/api/route', { data: { disabledNodeIds: [], disabledLinkIds: [] } })
  ).json();
  await bfs.click();
  await expect(settings).not.toContainText('Mbps');
  await expect(live).not.toContainText('Mbps');
  await expect(page.getByRole('region', { name: 'Route', exact: true })).not.toContainText(
    'Total route cost',
  );
  const unweighted = await send(page);
  expect(unweighted.algorithm).toBe('bfs');
  expect(unweighted.path).toEqual(legacy.path);
  await finish(page);
  await expect(page.getByRole('region', { name: 'Route', exact: true })).toContainText(
    'Queue (FIFO',
  );
  await expect(page.getByRole('region', { name: 'Route', exact: true })).not.toContainText(
    'Total route cost',
  );
  await dijkstra.click();
  const weighted = await send(page);
  expect(weighted.algorithm).toBe('dijkstra');
  expect(weighted.linkPath).not.toContain(slowId);
  expect(weighted.totalCost).toBeLessThan(pathCost(baseline.linkPath, { [slowId]: 10 }));
  const route = page.getByRole('region', { name: 'Route', exact: true });
  await finish(page);
  await expect(route.getByRole('heading', { name: 'Route (Dijkstra)', exact: true })).toBeVisible();
  await expect(route).toContainText('Settled order (lowest cumulative cost first)');
  await expect(route).not.toContainText('Queue (FIFO');
  await expect(route).toContainText(`Total route cost: ${weighted.totalCost.toFixed(2)}`);
});

test('bandwidth has three allowed choices, Cancel preserves settings, and Reset restores defaults', async ({
  page,
}) => {
  await page.goto('/');
  const settings = page.getByRole('region', { name: 'Routing settings' });
  await settings.getByRole('radio', { name: 'Dijkstra · lowest cost', exact: true }).click();
  const live = page.getByRole('region', { name: 'Live network failures' });
  await live.getByText(/^Roads \(/).click();
  const row = await edit(page, 'csulb--el-segundo', '100');
  await expect(row).toContainText('100 Mbps · cost 10');
  await expect(
    settings.getByRole('radio', { name: 'Dijkstra · lowest cost', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await settings.getByRole('radio', { name: 'BFS · fewest hops', exact: true }).click();
  await expect(live).not.toContainText('Mbps');
  await expect(settings).not.toContainText('Mbps');
  await expect(live.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await settings.getByRole('radio', { name: 'Dijkstra · lowest cost', exact: true }).click();
  await expect(row).toContainText('100 Mbps · cost 10');
  await row.getByRole('button', { name: /^Edit / }).click();
  await row.getByLabel('Bandwidth (Mbps)').selectOption('10');
  await row.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toContainText('100 Mbps · cost 10');
  await settings.getByRole('button', { name: 'Reset bandwidths to 1000 Mbps' }).click();
  await expect(row).toContainText('1,000 Mbps · cost 1');
  for (const value of [-1, 0, 50, 100.5, 1001]) {
    const response = await page.request.post('/api/route', {
      data: {
        algorithm: 'dijkstra',
        disabledNodeIds: [],
        disabledLinkIds: [],
        linkBandwidthMbps: { 'csulb--el-segundo': value },
      },
    });
    expect(response.status()).toBe(400);
  }
});

test('Dijkstra settings survive live failures, total disconnection and restoration', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto('/');
  const settings = page.getByRole('region', { name: 'Routing settings' });
  await settings.getByRole('radio', { name: 'Dijkstra · lowest cost', exact: true }).click();
  const live = page.getByRole('region', { name: 'Live network failures' });
  await live.getByText(/^Roads \(/).click();
  await edit(page, 'csulb--el-segundo', '10');
  await page.getByLabel('Enter message or select sample').fill('Weighted retries');
  await page.getByRole('button', { name: 'Packetize message' }).click();
  const baseline = await send(page);
  await page.clock.runFor(baseline.visitOrder.length * 300 + 100);
  await live.getByText('Routers', { exact: true }).click();
  for (const [i, name] of ['San Jose', 'Sacramento', 'Winnemucca'].entries()) {
    const reply = page.waitForResponse('**/api/route');
    await live.getByRole('switch', { name: `${name} online`, exact: true }).click();
    const response = await reply;
    expect(response.request().postDataJSON()).toMatchObject({
      algorithm: 'dijkstra',
      linkBandwidthMbps: { 'csulb--el-segundo': 10 },
    });
    expect((await response.json()).algorithm).toBe('dijkstra');
    await expect(live).toContainText(`${i + 1} route updates`);
  }
  await expect(page.locator('.state-chip')).toContainText('BLOCKED');
  await expect(page.locator('.banner')).toContainText('No route — transfer incomplete');
  await expect(
    settings.getByRole('radio', { name: 'BFS · fewest hops', exact: true }),
  ).toBeDisabled();
  const restoring = page.waitForResponse('**/api/route');
  await live.getByRole('button', { name: 'Restore all connections' }).click();
  const answer = await (await restoring).json();
  expect(answer.algorithm).toBe('dijkstra');
  expect(answer.linkPath).not.toContain('csulb--el-segundo');
  await expect(live).toContainText('All roads and routers online');
  await finish(page);
  await expect(
    settings.getByRole('radio', { name: 'Dijkstra · lowest cost', exact: true }),
  ).toBeEnabled();
});
