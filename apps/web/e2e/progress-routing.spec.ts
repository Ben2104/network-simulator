import { expect, test } from '@playwright/test';
import type { SimulationDebug } from '../src/sim/useSimulation';

test.use({ launchOptions: { args: ['--disable-3d-apis'] } });
for (const mode of ['BFS · fewest hops', 'Dijkstra · lowest cost']) {
  test(`${mode}: restoring a road redirects queued and moving groups without restarting the convoy`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('radio', { name: mode, exact: true }).click();
    const live = page.getByRole('region', { name: 'Live network failures' });
    await live.getByText(/^Roads \(/).click();
    if (mode.startsWith('Dijkstra')) {
      // Make reopening Oakland–Redding strictly cheaper, independent of equal-cost tie order.
      for (const [id, value] of [
        ['csulb--lb-isp', '10'],
        ['oakland--sacramento', '100'],
      ]) {
        const row = page.getByTestId(`road-${id}`);
        await row.getByRole('button', { name: /^Edit / }).click();
        await row.getByLabel('Bandwidth (Mbps)').selectOption(value!);
        await row.getByRole('button', { name: 'Apply', exact: true }).click();
      }
    }
    const road = page.getByTestId('road-oakland--redding').getByRole('switch');
    await road.click();
    await page.getByRole('button', { name: 'Presets' }).click();
    await page.getByRole('button', { name: /lecture\.mp4/ }).click();
    const reply = page.waitForResponse('**/api/route');
    await page.getByRole('button', { name: '➤ Send', exact: true }).click();
    const route = await (await reply).json();
    expect(route.linkPath).not.toContain('oakland--redding');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __packetHighway?: SimulationDebug }).__packetHighway?.paused,
        ),
      )
      .toBe(true);
    const before = await page.evaluate(() => {
      const debug = (window as Window & { __packetHighway?: SimulationDebug }).__packetHighway!;
      const plan = debug.plans[0]!;
      const now = (plan.departAt + plan.nodeTimes![1]!) / 2;
      debug.seek(now);
      return { now, departAt: plan.departAt, nextAt: plan.nodeTimes![1]!, arriveAt: plan.arriveAt };
    });
    await road.click();
    await expect(live).toContainText('All roads and routers online');
    const after = await page.evaluate(() => {
      const debug = (window as Window & { __packetHighway?: SimulationDebug }).__packetHighway!;
      return {
        paused: debug.paused,
        now: debug.now,
        plans: debug.plans.map((p) => ({
          nodes: p.route.nodeIds,
          links: p.route.linkIds,
          retries: p.retries ?? 0,
          departAt: p.departAt,
          at: p.handoff?.at,
          arriveAt: p.arriveAt,
        })),
      };
    });
    expect(after.paused).toBe(true);
    expect(after.now).toBe(before.now);
    expect(after.plans[0]!.at).toBe(before.nextAt);
    expect(after.plans[0]!.departAt).toBe(before.departAt);
    expect(after.plans.every((p) => p.links.includes('oakland--redding'))).toBe(true);
    expect(after.plans.every((p) => p.retries === 0)).toBe(true);
    const card = page.getByRole('region', { name: 'Route', exact: true });
    await expect(card).toContainText('Latest calculated best route from the sender');
    await expect(card).toContainText('9 hops');
    const timing = page.getByRole('region', { name: 'Transfer timing', exact: true });
    await expect(timing.locator('tbody tr').first()).toContainText(
      'Hops: 0 completed · 9 remaining',
    );
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.clock.runFor(100_000);
    await expect(page.locator('.state-chip')).toContainText('DELIVERED');
    await expect(timing.locator('dd').nth(2)).toHaveText('24 / 24');
    await expect(timing.locator('tbody tr').first()).toContainText(
      'Hops: 9 completed · 0 remaining',
    );
    expect(await timing.locator('tbody tr').first().innerText()).not.toContain('Retries:');
    const stopped = await timing.locator('dd').first().innerText();
    await page.clock.runFor(10_000);
    await expect(timing.locator('dd').first()).toHaveText(stopped);
  });
}
