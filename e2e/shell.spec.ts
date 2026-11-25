/* eslint-disable no-magic-numbers -- viewport sizes and control indexes */
import { expect, test } from '@playwright/test';

for (const width of [400, 1440]) {
  test(`topbar is 56 px high at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const box = await page.locator('header.topbar').boundingBox();
    expect(box?.height).toBe(56);
  });
}

test('right side controls are in the agreed order', async ({ page }) => {
  await page.goto('/');
  const labels = await page
    .locator('.topbar-actions > *')
    .evaluateAll((nodes) => nodes.map((node) => node.tagName));
  expect(labels).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'A']);
  const actions = page.locator('.topbar-actions');
  await expect(actions.locator('button').nth(0)).toHaveAttribute(
    'aria-label',
    /shortcuts|skróty/i,
  );
  await expect(actions.locator('button').nth(1)).toHaveAttribute(
    'aria-label',
    /language|język/i,
  );
  await expect(actions.locator('button').nth(2)).toHaveAttribute(
    'aria-label',
    /theme|motyw/i,
  );
  await expect(actions.locator('a')).toHaveAttribute(
    'href',
    'https://github.com/piecioshka/pptx-peek',
  );
});

test('? opens the shortcuts dialog and Escape closes it', async ({ page }) => {
  await page.goto('/');
  // Shortcut listeners attach in an effect, so wait for the first render.
  await expect(page.locator('.dropzone')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.locator('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toBeHidden();
});

test('boot script applies the stored theme and language before render', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('pptx-peek:theme', 'dark');
    localStorage.setItem('pptx-peek:lang', 'pl');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(
    page.getByText('Upuść plik .pptx albo wybierz z dysku'),
  ).toBeVisible();
});

test('serves a manifest with file handlers and a CSP without violations', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const manifest = await page.evaluate(() =>
    fetch('manifest.webmanifest').then((response) => response.json()),
  );
  expect(manifest.file_handlers).toHaveLength(1);
  expect(manifest.name).toBe('PPTX Peek');
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveCount(1);
  expect(violations).toEqual([]);
});
