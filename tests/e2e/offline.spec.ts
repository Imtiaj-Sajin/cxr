/** Production-build only: the service worker makes the app open without a network. */
import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_PREVIEW, 'service worker is only registered in production builds');

test('app opens offline after the first visit', async ({ page, context }) => {
  await page.goto('/?engine=mock');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled by the worker and assets are cached.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
  await context.setOffline(false);
});
