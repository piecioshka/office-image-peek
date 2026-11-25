/* eslint-disable no-magic-numbers -- fixture dimensions */
import { expect, test, type Page } from '@playwright/test';

// Only Chromium lets a test grant clipboard access and read images back.
test.skip(({ browserName }) => browserName !== 'chromium');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function openDemo(page: Page) {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles('e2e/fixtures/demo.pptx');
  await expect(page.locator('.tile')).toHaveCount(7);
}

function readClipboardPng(page: Page) {
  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item?.getType('image/png');
    const bitmap = await createImageBitmap(blob ?? new Blob());
    return { width: bitmap.width, height: bitmap.height };
  });
}

test('copies a PNG to the clipboard with its pixels intact', async ({
  page,
}) => {
  await openDemo(page);
  await page
    .getByRole('button', {
      name: 'Copy demo-slajd-02-01.png to the clipboard as PNG',
    })
    .click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const { width, height } = await readClipboardPng(page);
  expect([width, height]).toEqual([64, 48]);
});

test('copies a JPEG as a PNG', async ({ page }) => {
  await openDemo(page);
  await page
    .getByRole('button', {
      name: 'Copy demo-slajd-03-01.jpg to the clipboard as PNG',
    })
    .click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const { width, height } = await readClipboardPng(page);
  expect([width, height]).toEqual([64, 48]);
});
