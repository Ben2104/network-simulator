import { expect, test } from '@playwright/test';

// No WebGL at all: the map explains why; the sidebar still works and nothing crashes.
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test('explains that the map needs WebGL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('needs WebGL', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2D view' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Send and playback' })).toBeVisible();
  expect(errors).toEqual([]);
});
