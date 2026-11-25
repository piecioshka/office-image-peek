// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture sizes */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPptx, tinyPng } from '../../test/fixtures/build-pptx';
import { openDeck } from '../core/open-deck';
import { AssetUrlCache } from './asset-urls';

const RECT = { x: 0, y: 0, cx: 100, cy: 100 };
let counter = 0;

beforeEach(() => {
  counter = 0;
  URL.createObjectURL = () => {
    counter++;
    return `blob:fake-${counter}`;
  };
  URL.revokeObjectURL = vi.fn();
});

async function makeDeck() {
  const bytes = buildPptx({
    slides: [{ shapes: [{ kind: 'picture', media: 'a.png', xfrm: RECT }] }],
    media: { 'a.png': tinyPng(8, 8, 1) },
  });
  return openDeck(new File([new Uint8Array(bytes)], 'demo.pptx'));
}

describe('AssetUrlCache', () => {
  it('reads an asset once for any number of consumers', async () => {
    const deck = await makeDeck();
    const read = vi.spyOn(deck.zip, 'readBytes');
    const cache = new AssetUrlCache(deck);
    const asset = deck.assets[0];
    if (!asset) {
      throw new Error('fixture has no asset');
    }
    const [first, second] = await Promise.all([
      cache.get(asset, 'original'),
      cache.get(asset, 'original'),
    ]);
    expect(first).toBe(second);
    expect(read).toHaveBeenCalledTimes(1);
    expect(counter).toBe(1);
  });

  it('revokes every URL on dispose and ignores reads still in flight', async () => {
    const deck = await makeDeck();
    const cache = new AssetUrlCache(deck);
    const asset = deck.assets[0];
    if (!asset) {
      throw new Error('fixture has no asset');
    }
    const url = await cache.get(asset, 'original');
    cache.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    const pending = cache.get(asset, 'original');
    cache.dispose();
    expect(await pending).toBeNull();
    expect(counter).toBe(1);
  });
});
