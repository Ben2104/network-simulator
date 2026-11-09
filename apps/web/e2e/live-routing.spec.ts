import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test.describe('live failure controls and timing without WebGL', () => {
  test('reroutes during driving, pauses timing and completes without resending', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'Presets' }).click();
    await page.getByRole('button', { name: /photo\.jpg/ }).click();
    const firstRoute = page.waitForResponse('**/api/route');
    await page.getByRole('button', { name: '➤ Send', exact: true }).click();
    const answer = await (await firstRoute).json();
    await expect(page.locator('.state-chip')).toContainText('SEARCHING');
    await page.clock.runFor(answer.visitOrder.length * 300 + 2_000);
    await expect(page.locator('.state-chip')).toContainText('DRIVING');
    const live = page.getByRole('region', { name: 'Live network failures' });
    await live.getByText(/^Roads \(/).click();
    const road = live.getByRole('switch', { name: 'Oakland – Redding online', exact: true });
    await road.click();
    await expect(live).toContainText('1 route updates');
    await expect(road.last()).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.state-chip')).toContainText('DRIVING');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const timing = page.getByRole('region', { name: 'Transfer timing', exact: true });
    const before = await timing.locator('dd').first().textContent();
    await page.clock.runFor(10_000);
    await expect(timing.locator('dd').first()).toHaveText(before!);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.clock.runFor(90_000);
    await expect(page.locator('.state-chip')).toContainText('DELIVERED');
    await expect(timing).toContainText('Total completion time');
    await expect(timing.locator('dd').nth(2)).toHaveText('12 / 12');
    await expect(timing.locator('tbody tr')).toHaveCount(12);
    await expect(timing.locator('tbody td:nth-child(2)')).toHaveText(Array(12).fill(/^arrived/));
  });

  test('disconnecting all destination roads blocks groups; restore resumes them', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByLabel('Enter message or select sample').fill('Block and recover');
    await page.getByRole('button', { name: 'Packetize message' }).click();
    const firstRoute = page.waitForResponse('**/api/route');
    await page.getByRole('button', { name: '➤ Send', exact: true }).click();
    const answer = await (await firstRoute).json();
    await page.clock.runFor(answer.visitOrder.length * 300 + 20);
    const live = page.getByRole('region', { name: 'Live network failures' });
    await live.getByText(/^Roads \(/).click();
    for (const [i, source] of ['Bend', 'Portland', 'Pendleton'].entries()) {
      await live
        .getByRole('switch', { name: `${source} – US-West Data Center online`, exact: true })
        .click();
      await expect(live).toContainText(`${i + 1} route updates`);
    }
    await page.clock.runFor(30_000);
    await expect(page.locator('.state-chip')).toContainText('BLOCKED');
    const timing = page.getByRole('region', { name: 'Transfer timing', exact: true });
    await expect(timing.locator('tbody tr')).toContainText('No route — waiting at sender');
    await expect(timing.locator('dd').nth(1)).toHaveText('Incomplete — no route');
    const stopped = await timing.locator('dd').first().textContent();
    const rows = await timing.locator('tbody').innerText();
    await expect(page.locator('.banner')).toContainText('No route — transfer incomplete');
    await page.clock.runFor(30_000);
    await expect(timing.locator('dd').first()).toHaveText(stopped!);
    expect(await timing.locator('tbody').innerText()).toBe(rows);
    await live.getByRole('button', { name: 'Restore all connections' }).click();
    await expect(live).toContainText('All roads and routers online');
    await page.clock.runFor(90_000);
    await expect(page.locator('.state-chip')).toContainText('DELIVERED');
    await expect(timing.locator('dd').nth(2)).toHaveText('1 / 1');
  });
  test('24 groups report total disconnection for San Jose, Sacramento and Winnemucca, then recover', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'Presets' }).click();
    await page.getByRole('button', { name: /lecture\.mp4/ }).click();
    const first = page.waitForResponse('**/api/route');
    await page.getByRole('button', { name: '➤ Send', exact: true }).click();
    const answer = await (await first).json();
    await page.clock.runFor(answer.visitOrder.length * 300 + 2_000);
    const live = page.getByRole('region', { name: 'Live network failures' });
    await live.getByText('Routers', { exact: true }).click();
    for (const [i, name] of ['San Jose', 'Sacramento', 'Winnemucca'].entries()) {
      await live.getByRole('switch', { name: `${name} online`, exact: true }).click();
      await expect(live).toContainText(`${i + 1} route updates`);
    }
    await expect(page.locator('.state-chip')).toContainText('BLOCKED');
    await expect(page.locator('.banner')).toContainText('24 groups waiting at sender');
    const timing = page.getByRole('region', { name: 'Transfer timing', exact: true });
    await expect(timing.locator('dd').nth(2)).toHaveText('0 / 24');
    await expect(timing.locator('tbody tr')).toHaveCount(24);
    await expect(timing.locator('tbody td:nth-child(2)')).toHaveText(
      Array(24).fill(/^No route — waiting at sender/),
    );
    const stopped = await timing.locator('dd').first().textContent();
    const values = await timing.locator('tbody td:last-child').allTextContents();
    await page.clock.runFor(60_000);
    await expect(timing.locator('dd').first()).toHaveText(stopped!);
    expect(await timing.locator('tbody td:last-child').allTextContents()).toEqual(values);
    await live.getByRole('button', { name: 'Restore all connections' }).click();
    await expect(live).toContainText('All roads and routers online');
    await page.clock.runFor(90_000);
    await expect(page.locator('.state-chip')).toContainText('DELIVERED');
    await expect(timing.locator('dd').nth(2)).toHaveText('24 / 24');
    await expect(timing.locator('tbody td:nth-child(2)')).toHaveText(Array(24).fill(/^arrived/));
    const finalTime = await timing.locator('dd').first().textContent();
    await page.clock.runFor(60_000);
    await expect(timing.locator('dd').first()).toHaveText(finalTime!);
  });

  test('a send with no route reports failure and resumes after connections are restored', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    const live = page.getByRole('region', { name: 'Live network failures' });
    await live.getByText(/^Roads \(/).click();
    for (const name of [
      'CSULB Parking Lot – Long Beach ISP online',
      'CSULB Parking Lot – El Segundo online',
    ])
      await live.getByRole('switch', { name, exact: true }).click();
    await page.getByLabel('Enter message or select sample').fill('No route initially');
    await page.getByRole('button', { name: 'Packetize message' }).click();
    const first = page.waitForResponse('**/api/route');
    await page.getByRole('button', { name: '➤ Send', exact: true }).click();
    await first;
    await page.clock.runFor(5_000);
    await expect(page.locator('.state-chip')).toContainText('NOROUTE');
    const timing = page.getByRole('region', { name: 'Transfer timing', exact: true });
    await expect(timing.locator('tbody tr')).toContainText('No route — waiting at sender');
    await live.getByRole('button', { name: 'Restore all connections' }).click();
    await expect(live).toContainText('All roads and routers online');
    await page.clock.runFor(90_000);
    await expect(page.locator('.state-chip')).toContainText('DELIVERED');
    await expect(timing.locator('dd').nth(2)).toHaveText('1 / 1');
  });
});
