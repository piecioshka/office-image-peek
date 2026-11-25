import { expect, test, type Page } from '@playwright/test';

const DECK = 'e2e/fixtures/demo.pptx';

async function openDeck(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(DECK);
  await expect(page.locator('.tile-preview').first()).toBeVisible();
}

async function expectPreviewLoaded(page: Page) {
  const img = page.locator('.preview-img');
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
}

test('a thumbnail opens the image preview in place of the slide', async ({
  page,
}) => {
  await openDeck(page);
  await page.locator('.tile-preview').first().click();
  await expectPreviewLoaded(page);
  await expect(page.locator('.slide-view')).toHaveCount(0);
  expect(new URL(page.url()).hash).toMatch(/^#image=/);
});

test('browser Back returns from the preview to the slide', async ({ page }) => {
  await openDeck(page);
  await page.locator('.tile-preview').first().click();
  await expectPreviewLoaded(page);
  await page.goBack();
  await expect(page.locator('.preview')).toHaveCount(0);
  await expect(page.locator('.slide-view')).toBeVisible();
});

test('Escape and the back button both close the preview', async ({ page }) => {
  await openDeck(page);
  await page.locator('.tile-preview').first().click();
  await expectPreviewLoaded(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.preview')).toHaveCount(0);
  await page.locator('.tile-preview').first().click();
  await page
    .getByRole('button', { name: /back to slide|wróć do slajdu/i })
    .click();
  await expect(page.locator('.slide-view')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('actual size lets the image overflow and scroll', async ({ page }) => {
  await openDeck(page);
  await page.locator('.tile-preview').first().click();
  await expectPreviewLoaded(page);
  const toggle = page.getByRole('button', { name: /actual size|rzeczywisty/i });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.preview-stage')).toHaveClass(/preview-actual/);
});
