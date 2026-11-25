/* eslint-disable no-magic-numbers -- slide counts and viewport sizes */
import { expect, test, type Page } from '@playwright/test';

const DECK = 'e2e/fixtures/demo.pptx';

async function openDemo(page: Page) {
  await page.goto('/');
  // Shortcut listeners attach in an effect, so wait for the first render.
  await expect(page.locator('h1')).toHaveText('PPTX Peek');
  await page.locator('input[type="file"]').setInputFiles(DECK);
  await expect(page.locator('.slide-list li')).toHaveCount(5);
}

test('lists five thumbnails with the first slide selected', async ({
  page,
}) => {
  await openDemo(page);
  const buttons = page.locator('.slide-list button');
  await expect(buttons.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(buttons.nth(1)).not.toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.slide-canvas-full')).toHaveAttribute(
    'aria-label',
    /^(Slide|Slajd) 1$/,
  );
  await expect(page.locator('.slide-hidden')).toHaveCount(1);
});

test('ArrowDown selects the next slide', async ({ page }) => {
  await openDemo(page);
  const main = page.locator('.slide-canvas-full');
  const before = await main.getAttribute('aria-label');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.slide-list button').nth(1)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(main).not.toHaveAttribute('aria-label', before ?? '');
});

test('slide 2 renders its pictures', async ({ page }) => {
  await openDemo(page);
  await page.locator('.slide-list button').nth(1).click();
  await expect(page.locator('.slide-canvas-full image')).toHaveCount(3);
  await expect(
    page.locator('.slide-canvas-full image[href^="blob:"]'),
  ).toHaveCount(3);
});

test('a solid slide background is painted with its color', async ({ page }) => {
  await openDemo(page);
  await page.locator('.slide-list button').nth(2).click();
  const fill = await page
    .locator('.slide-canvas-full .slide-background')
    .evaluate((node) => getComputedStyle(node).fill);
  expect(fill).toBe('rgb(253, 243, 215)');
});

for (const width of [400, 1440]) {
  test(`slide list has no horizontal scroll at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await openDemo(page);
    const overflowing = await page
      .locator('.deck-slides, .deck-slides *')
      .evaluateAll(
        (nodes) =>
          nodes.filter((node) => {
            const overflow = getComputedStyle(node).overflowX;
            return (
              ['auto', 'scroll'].includes(overflow) &&
              node.scrollWidth > node.clientWidth
            );
          }).length,
      );
    expect(overflowing).toBe(0);
  });
}
