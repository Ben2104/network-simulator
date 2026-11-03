import { expect, test } from '@playwright/test';

// No WebGL at all: the app must open in 2D, explain why, and not crash.
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test('falls back to the 2D view with an explanation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText(/3D view needs WebGL/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '3D view' })).toBeDisabled();
  await expect(page.getByRole('img', { name: /West Coast network map/ })).toBeVisible();
  expect(errors).toEqual([]);
});
