import { expect, test } from '@playwright/test';

test('shows the app title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('PPTX Peek');
  await expect(page.locator('h1')).toHaveText('PPTX Peek');
});
