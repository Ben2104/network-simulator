import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test('BGP follows AS policy over hop count and explains the AS path', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const settings = page.getByRole('region', { name: 'Routing settings' });
  await settings.getByRole('radio', { name: 'BGP · AS policy', exact: true }).click();
  await settings.getByText('Autonomous Systems and agreements').click();
  await expect(settings).toContainText('SoCal Metro ⇄ Desert Carrier · peers');
  await page.getByLabel('Enter message or select sample').fill('Policy beats hops');
  await page.getByRole('button', { name: 'Packetize message' }).click();
  const reply = page.waitForResponse('**/api/route');
  await page
    .getByRole('region', { name: 'Send and playback' })
    .getByRole('button', { name: /Send/ })
    .first()
    .click();
  const route = await (await reply).json();
  expect(route.algorithm).toBe('bgp');
  expect(route.asPath).toEqual([64512, 64520, 64550, 64560]);
  expect(route.path).toContain('las-vegas');
  await page.clock.runFor(100_000);
  await expect(page.locator('.state-chip')).toContainText('DELIVERED');
  const card = page.getByRole('region', { name: 'Route' });
  await expect(card.getByRole('heading', { name: 'Route (BGP)', exact: true })).toBeVisible();
  await expect(card.getByLabel('AS path')).toContainText(
    'AS64512 Campus Net → AS64520 SoCal Metro → AS64550 Desert Carrier → AS64560 Oregon Cloud',
  );
  await expect(card).toContainText('10 hops');
});
