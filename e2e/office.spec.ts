import { expect, test } from '@playwright/test';

test('opens a Word document without a slide list', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles('e2e/fixtures/demo.docx');
  await expect(page.locator('.tile')).toHaveCount(4);
  await expect(page.locator('.deck-slides')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Word document' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'In the document' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'In headers and footers' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Current slide/ }),
  ).toHaveCount(0);
});

test('lists sheets of a workbook and previews a picture', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles('e2e/fixtures/demo.xlsx');
  await expect(page.locator('.tile')).toHaveCount(4);
  const table = page.locator('.overview-table');
  await expect(table.locator('tbody tr')).toHaveText([/Sales\s*1/, /Team\s*2/]);
  await expect(page.locator('.chip-static', { hasText: 'Team' })).toHaveCount(
    2,
  );
  await page.locator('.tile-preview').first().click();
  await expect(page.locator('.preview-img')).toBeVisible();
  await page.getByRole('button', { name: 'Back to overview' }).click();
  await expect(page.locator('.overview')).toBeVisible();
});

test('downloads workbook pictures under sheet-based names', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles('e2e/fixtures/demo.xlsx');
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download demo-arkusz-02-01.jpg' })
    .click();
  expect((await pending).suggestedFilename()).toBe('demo-arkusz-02-01.jpg');
});
