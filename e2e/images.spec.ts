/* eslint-disable no-magic-numbers -- fixture counts */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

const DECK = 'e2e/fixtures/demo.pptx';

interface Source {
  base64: string;
  sha256: string;
}

const sources: Record<string, Source> = JSON.parse(
  readFileSync('e2e/fixtures/demo-sources.json', 'utf8'),
);
const BY_EXPORT_NAME: Record<string, string> = {
  'demo-slajd-02-01.png': 'ppt/media/photo.png',
  'demo-slajd-02-02.png': 'ppt/media/cropped.png',
  'demo-slajd-03-01.jpg': 'ppt/media/photo.jpg',
  'demo-slajd-04-01.svg': 'ppt/media/vector.svg',
  'demo-slajd-04-02.png': 'ppt/media/chart-bg.png',
  'demo-uklad-01.png': 'ppt/media/logo.png',
  'demo-nieuzywany-01.png': 'ppt/media/unused.png',
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectedHash(exportName: string): string {
  const source = sources[BY_EXPORT_NAME[exportName] ?? ''];
  if (!source) {
    throw new Error(`No fixture source for ${exportName}`);
  }
  return source.sha256;
}

async function openDemo(page: Page) {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('PPTX Peek');
  await page.locator('input[type="file"]').setInputFiles(DECK);
  await expect(page.locator('.tile')).toHaveCount(7);
}

async function readDownload(download: {
  path(): Promise<string | null>;
}): Promise<Uint8Array> {
  const path = await download.path();
  if (path === null) {
    throw new Error('download has no path');
  }
  return new Uint8Array(readFileSync(path));
}

test('downloads one image byte-exact under its export name', async ({
  page,
}) => {
  await openDemo(page);
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: /demo-slajd-02-01\.png$/ })
    .first()
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('demo-slajd-02-01.png');
  expect(sha256(await readDownload(download))).toBe(
    expectedHash('demo-slajd-02-01.png'),
  );
});

test('falls back to a ZIP whose entries match their sources', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showDirectoryPicker');
  });
  await openDemo(page);
  await page.keyboard.press('a');
  const pending = page.waitForEvent('download');
  await page.keyboard.press('d');
  const download = await pending;
  expect(download.suggestedFilename()).toBe('demo-images.zip');
  const entries = unzipSync(await readDownload(download));
  expect(Object.keys(entries).sort()).toEqual(
    Object.keys(BY_EXPORT_NAME).sort(),
  );
  for (const [name, bytes] of Object.entries(entries)) {
    expect(sha256(bytes), name).toBe(expectedHash(name));
  }
});

test('makes no network requests after load', async ({ page, baseURL }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('PPTX Peek');
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    const allowed =
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      url.startsWith(baseURL ?? '');
    if (!allowed) {
      foreign.push(url);
    }
  });
  await page.locator('input[type="file"]').setInputFiles(DECK);
  await expect(page.locator('.tile')).toHaveCount(7);
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: /demo-slajd-02-01\.png$/ })
    .first()
    .click();
  await pending;
  expect(foreign).toEqual([]);
});

test('a slide chip jumps to that slide', async ({ page }) => {
  await openDemo(page);
  await page
    .locator('.tile', { hasText: 'demo-slajd-03-01.jpg' })
    .locator('.chip', { hasText: /^3$/ })
    .click();
  await expect(page.locator('.slide-canvas-full')).toHaveAttribute(
    'aria-label',
    /3$/,
  );
});

test('D downloads right after ticking a tile checkbox', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showDirectoryPicker');
  });
  await openDemo(page);
  await page.getByRole('checkbox', { name: 'demo-slajd-02-01.png' }).click();
  const pending = page.waitForEvent('download');
  await page.keyboard.press('d');
  expect((await pending).suggestedFilename()).toBe('demo-images.zip');
});
