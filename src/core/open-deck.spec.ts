// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture data */
import { describe, expect, it } from 'vitest';
import { buildPptx, tinyPng } from '../../test/fixtures/build-pptx';
import { openDeck } from './open-deck';
import { ZipError } from './zip/zip-error';

const R = { x: 0, y: 0, cx: 100, cy: 100 };

describe('openDeck', () => {
  it('returns slides and assets', async () => {
    const bytes = buildPptx({
      media: { 'a.png': tinyPng(4, 3, 1) },
      slides: [{ shapes: [{ kind: 'picture', media: 'a.png', xfrm: R }] }],
    });
    const deck = await openDeck(new File([bytes.slice()], 'Demo.pptx'));
    expect(deck.fileName).toBe('Demo.pptx');
    expect(deck.presentation.slides).toHaveLength(1);
    expect(deck.assets).toHaveLength(1);
  });

  it('rejects a non-zip file with ZipError not-zip', async () => {
    const file = new File([new Uint8Array(100).fill(7)], 'photo.pptx');
    await expect(openDeck(file)).rejects.toMatchObject({
      name: expect.any(String),
      code: 'not-zip',
    });
    await expect(openDeck(file)).rejects.toBeInstanceOf(ZipError);
  });
});
