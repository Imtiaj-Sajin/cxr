import { devices, expect, test } from '@playwright/test';
import path from 'node:path';

test.use({ ...devices['Pixel 7'] });

test('phones default to the small model on the CPU path', async ({ page }) => {
  await page.goto('/?engine=mock');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?engine=mock');
  await page.getByTestId('file-input').setInputFiles(path.resolve(import.meta.dirname, '../fixtures/speech-bn.webm'));
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByRole('radio', { name: /দ্রুত/ })).toBeChecked();
  await expect(page.locator('.notice')).toContainText('CPU');
});
