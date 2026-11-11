import { expect, test, type Page } from '@playwright/test';

/** Spread of pixel brightness in the WebGL canvas; ~0 means a blank (single-colour) frame. */
async function canvasSpread(page: Page): Promise<number> {
  return page
    .locator('[data-testid="scene3d"] canvas, .scene3d canvas')
    .first()
    .evaluate((el) => {
      const src = el as HTMLCanvasElement;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 40;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(src, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      return max - min;
    });
}

test('3D canvas mounts, is non-blank and runs Submit → Send', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.scene3d canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => canvasSpread(page), { timeout: 30_000 }).toBeGreaterThan(40);

  // Lot labels from the Figma v2 frames.
  await expect(page.getByText('Sender: CSULB parking lot')).toBeAttached();

  await page.getByRole('button', { name: 'Presets' }).click();
  await page.getByRole('button', { name: /essay\.pdf/ }).click();
  // 1 MiB → 3 cars under the size-based plan (10 MB fills 24).
  await expect(page.getByText('client · 3 groups at sender')).toBeAttached();
  await page.getByRole('radio', { name: '2×' }).click();
  await page.getByRole('button', { name: /Send/ }).first().click();
  await expect(page.getByText('STATE:')).toContainText(/SEARCHING|DRIVING|DELIVERED/, {
    timeout: 15_000,
  });
  await expect.poll(() => canvasSpread(page), { timeout: 30_000 }).toBeGreaterThan(40);
});

test('camera controls: follow is released by a drag', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.scene3d canvas')).toBeVisible({ timeout: 30_000 });
  const follow = page.getByRole('button', { name: 'Follow lead car' });
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  const box = (await page.locator('.scene3d canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Camera: Orbit · Free')).toBeVisible();
});

test('loads the Kenney models', async ({ page }) => {
  const models: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/models/') && r.ok()) models.push(r.url().split('/models/')[1]!);
  });
  await page.goto('/');
  await expect(page.locator('.scene3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => models.filter((m) => m.endsWith('.glb')).length).toBe(7);
  expect(models).toContain('car/sedan.glb');
});

test('falls back to primitives when the models fail to load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/models/**', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await expect(page.locator('.scene3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => canvasSpread(page), { timeout: 30_000 }).toBeGreaterThan(40);

  await page.getByRole('button', { name: 'Presets' }).click();
  await page.getByRole('button', { name: /lecture\.mp4/ }).click();
  await expect(page.getByText('client · 24 groups at sender')).toBeAttached();
  await page.getByRole('radio', { name: '2×' }).click();
  await page.getByRole('button', { name: /Send/ }).first().click();
  await expect(page.getByText('STATE:')).toContainText(/SEARCHING|DRIVING|DELIVERED/, {
    timeout: 15_000,
  });
  // Still the 3D scene (no switch to the 2D view) and nothing thrown.
  await expect(page.locator('.scene3d canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
