/* eslint-disable no-magic-numbers -- viewport sizes and slide counts */
import { expect, test } from '@playwright/test';

const DECK = 'e2e/fixtures/demo.pptx';

for (const theme of ['light', 'dark']) {
  test(`@screenshots main view (${theme})`, async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('pptx-peek:theme', value);
      localStorage.setItem('pptx-peek:lang', 'en');
    }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('PPTX Peek');
    await page.locator('input[type="file"]').setInputFiles(DECK);
    await expect(page.locator('.slide-list li')).toHaveCount(5);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() =>
      Array.from(document.images).every((img) => img.complete),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/screenshots/main-${theme}.png` });
  });
}
