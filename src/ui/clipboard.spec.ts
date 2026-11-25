// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture sizes */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPptx, tinyPng } from '../../test/fixtures/build-pptx';
import { openDeck } from '../core/open-deck';
import type { ImageAsset } from '../core/inventory';
import { NO_META } from '../core/image-meta';
import { copyAsset, copyPlan } from './clipboard';

function asset(partial: Partial<ImageAsset>): ImageAsset {
  return {
    id: 'ppt/media/a.png',
    archivePath: 'ppt/media/a.png',
    externalUrl: null,
    fallbackPngPath: null,
    format: 'png',
    byteSize: 10,
    width: 1,
    height: 1,
    slides: [1],
    origin: 'slide',
    cropped: false,
    meta: NO_META,
    missing: false,
    fileName: 'a.png',
    ...partial,
  };
}

describe('copyPlan', () => {
  it('copies PNG and SVG fallbacks byte-exact and redraws the rest', () => {
    expect(copyPlan(asset({}))).toBe('exact');
    expect(
      copyPlan(asset({ format: 'svg', fallbackPngPath: 'ppt/media/f.png' })),
    ).toBe('fallback');
    expect(copyPlan(asset({ format: 'jpeg' }))).toBe('convert');
    expect(copyPlan(asset({ format: 'svg' }))).toBe('convert');
  });

  it('refuses formats a browser cannot draw and images not in the file', () => {
    expect(copyPlan(asset({ format: 'emf' }))).toBeNull();
    expect(copyPlan(asset({ format: 'tiff' }))).toBeNull();
    expect(copyPlan(asset({ missing: true }))).toBeNull();
    expect(copyPlan(asset({ archivePath: null }))).toBeNull();
  });
});

describe('copyAsset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the original PNG bytes as image/png', async () => {
    const png = tinyPng(6, 4, 7);
    const deck = await openDeck(
      new File(
        [
          new Uint8Array(
            buildPptx({
              slides: [
                {
                  shapes: [
                    {
                      kind: 'picture',
                      media: 'p.png',
                      xfrm: { x: 0, y: 0, cx: 1, cy: 1 },
                    },
                  ],
                },
              ],
              media: { 'p.png': png },
            }),
          ),
        ],
        'c.pptx',
      ),
    );
    const items: Record<string, Promise<Blob>>[] = [];
    class FakeItem {
      constructor(data: Record<string, Promise<Blob>>) {
        items.push(data);
      }
    }
    const write = vi.fn(() => Promise.resolve());
    vi.stubGlobal('ClipboardItem', FakeItem);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { write } });
    const [first] = deck.assets;
    if (!first) {
      throw new Error('no asset');
    }
    await copyAsset(deck, first);
    expect(write).toHaveBeenCalledTimes(1);
    const blob = await items[0]?.['image/png'];
    expect(blob?.type).toBe('image/png');
    expect(
      new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0)),
    ).toEqual(png);
  });
});
