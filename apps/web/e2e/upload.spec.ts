import { expect, test } from '@playwright/test';

test('uploading a 5 MB file splits it into 12 cars and verifies the hash', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('upload-input').setInputFiles({
    name: 'lecture slides.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(5_000_000, 1),
  });
  await expect(page.getByText(/lecture slides\.pdf is 5 MB \(under the 10 MB limit\)/)).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByText('3,334 packets in 12 cars')).toBeAttached();
  await expect(page.getByText(/Verified in Oregon/)).toBeVisible();
  await expect(page.getByRole('img', { name: '12 of 24 cars used' })).toBeVisible();
  await expect(page.getByText('client · 12 cars')).toBeAttached();
});

test('a file over 10 MB is refused before upload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('upload-input').setInputFiles({
    name: 'big.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(10_000_001),
  });
  await expect(page.getByRole('alert')).toContainText('Files must be 10 MB or smaller');
});
