// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture data */
import { NO_META } from './image-meta';
import { describe, expect, it } from 'vitest';
import {
  buildPptx,
  tinyJpeg,
  tinyPng,
  type FixtureDeck,
  type FixtureShape,
} from '../../test/fixtures/build-pptx';
import {
  assetsForSlide,
  buildImageInventory,
  deckSlug,
  uniqueName,
} from './inventory';
import { parsePresentation } from './parse-presentation';
import { spyBlob } from '../../test/blob-spy';
import { buildExif, jpegWithExif } from '../../test/fixtures/exif';
import { openZip } from './zip/zip-reader';

const R = { x: 0, y: 0, cx: 100, cy: 100 };
const pic = (
  media: string,
  extra: Partial<Extract<FixtureShape, { kind: 'picture' }>> = {},
): FixtureShape => ({ kind: 'picture', media, xfrm: R, ...extra });

async function inventory(deck: FixtureDeck, name = 'Demo.pptx') {
  const zip = await openZip(new Blob([buildPptx(deck).slice()]));
  const pres = await parsePresentation(zip);
  return buildImageInventory(zip, pres, name);
}

const MEDIA = {
  'a.png': tinyPng(4, 3, 1),
  'b.jpeg': tinyJpeg(10, 20),
  'c.png': tinyPng(2, 2, 3),
};

function only(...names: (keyof typeof MEDIA)[]): Record<string, Uint8Array> {
  return Object.fromEntries(names.map((name) => [name, MEDIA[name]]));
}

describe('buildImageInventory', () => {
  it('dedupes an image used on slides 1 and 3', async () => {
    const assets = await inventory({
      media: only('a.png'),
      slides: [
        { shapes: [pic('a.png')] },
        { shapes: [] },
        { shapes: [pic('a.png')] },
      ],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'ppt/media/a.png',
      slides: [1, 3],
      fileName: 'demo-slajd-01-01.png',
      origin: 'slide',
      format: 'png',
      width: 4,
      height: 3,
      missing: false,
      cropped: false,
      meta: NO_META,
    });
    expect(assets[0]?.byteSize).toBe(MEDIA['a.png'].length);
  });

  it('numbers images per slide', async () => {
    const assets = await inventory({
      media: only('a.png', 'b.jpeg'),
      slides: [{ shapes: [] }, { shapes: [pic('a.png'), pic('b.jpeg')] }],
    });
    expect(assets.map((a) => a.fileName)).toEqual([
      'demo-slajd-02-01.png',
      'demo-slajd-02-02.jpeg',
    ]);
  });

  it('lists layout logo once with layout name and every slide using that layout', async () => {
    const assets = await inventory({
      media: only('c.png'),
      layouts: [{ placeholders: [], logoMedia: 'c.png', logoXfrm: R }],
      slides: [{ shapes: [] }, { shapes: [] }],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      origin: 'layout',
      fileName: 'demo-uklad-01.png',
      slides: [1, 2],
    });
  });

  it('lists unreferenced media as unused', async () => {
    const assets = await inventory({
      media: { ...MEDIA, 'movie.mp4': Uint8Array.from([0, 0, 0, 24, 102]) },
      slides: [{ shapes: [pic('a.png')] }],
    });
    const unused = assets.filter((a) => a.origin === 'unused');
    expect(unused.map((a) => a.fileName)).toEqual([
      'demo-nieuzywany-01.jpeg',
      'demo-nieuzywany-02.png',
    ]);
    expect(unused[0]?.slides).toEqual([]);
    expect(assets.some((a) => a.id.endsWith('movie.mp4'))).toBe(false);
  });

  it('uses svg as original with png fallback', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150"></svg>',
    );
    const assets = await inventory({
      media: { 'a.png': MEDIA['a.png'], 'a.svg': svg },
      slides: [{ shapes: [pic('a.png', { svgMedia: 'a.svg' })] }],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'ppt/media/a.svg',
      format: 'svg',
      fallbackPngPath: 'ppt/media/a.png',
      width: 300,
      height: 150,
      fileName: 'demo-slajd-01-01.svg',
    });
  });

  it('marks cropped and missing images', async () => {
    const assets = await inventory({
      media: only('a.png', 'b.jpeg'),
      slides: [
        {
          shapes: [
            pic('a.png', { crop: { l: 10000 } }),
            pic('ghost.png'),
            pic('b.jpeg'),
          ],
        },
      ],
    });
    const byName = new Map(assets.map((a) => [a.id, a]));
    expect(byName.get('ppt/media/a.png')?.cropped).toBe(true);
    expect(byName.get('ppt/media/b.jpeg')?.cropped).toBe(false);
    expect(byName.get('ppt/media/ghost.png')).toMatchObject({
      missing: true,
      format: 'png',
      byteSize: null,
      width: null,
      height: null,
      fileName: 'demo-slajd-01-02.png',
    });
  });

  it('keeps external images without file name', async () => {
    const assets = await inventory({
      media: only('a.png'),
      slides: [
        {
          shapes: [
            {
              kind: 'picture',
              media: 'x.png',
              xfrm: R,
              external: 'https://example.com/x.png',
            },
          ],
        },
      ],
    });
    const external = assets.find((a) => a.externalUrl !== null);
    expect(external).toMatchObject({
      id: 'https://example.com/x.png',
      archivePath: null,
      fileName: '',
      slides: [1],
    });
  });

  it('includes chart media on the chart slide', async () => {
    const assets = await inventory({
      media: only('c.png'),
      slides: [
        { shapes: [] },
        { shapes: [{ kind: 'chart', xfrm: R, chartMedia: 'c.png' }] },
      ],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      slides: [2],
      origin: 'slide',
      fileName: 'demo-slajd-02-01.png',
    });
  });

  it('pads slide numbers to 3 digits for 100+ slides', async () => {
    const slides = Array.from({ length: 100 }, (_, i) => ({
      shapes: i === 0 || i === 99 ? [pic(i === 0 ? 'a.png' : 'c.png')] : [],
    }));
    const assets = await inventory({ media: only('a.png', 'c.png'), slides });
    expect(assets.map((a) => a.fileName)).toEqual([
      'demo-slajd-001-01.png',
      'demo-slajd-100-01.png',
    ]);
  });
});

describe('inventory edge cases', () => {
  it('pairs svg and png fallback on a layout logo', async () => {
    const svg = new TextEncoder().encode('<svg viewBox="0 0 8 4"></svg>');
    const assets = await inventory({
      media: { 'a.png': MEDIA['a.png'], 'a.svg': svg },
      layouts: [
        {
          placeholders: [],
          logoMedia: 'a.png',
          logoXfrm: R,
          logoSvgMedia: 'a.svg',
        },
      ],
      slides: [{ shapes: [] }],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'ppt/media/a.svg',
      origin: 'layout',
      fallbackPngPath: 'ppt/media/a.png',
      fileName: 'demo-uklad-01.svg',
    });
  });

  it('sorts unused media naturally', async () => {
    const media: Record<string, Uint8Array> = {};
    for (const n of [10, 2, 1]) {
      media[`image${n}.png`] = tinyPng(2, 2, n);
    }
    const assets = await inventory({ media, slides: [{ shapes: [] }] });
    expect(assets.map((a) => a.id)).toEqual([
      'ppt/media/image1.png',
      'ppt/media/image2.png',
      'ppt/media/image10.png',
    ]);
  });

  it('never slices much of a large stored image', async () => {
    const big = new Uint8Array(2_000_000);
    big.set(tinyPng(8, 8, 1));
    const deck = buildPptx({
      media: { 'big.png': big },
      slides: [{ shapes: [pic('big.png')] }],
    });
    const spy = spyBlob(new Blob([deck.slice()]));
    const zip = await openZip(spy.blob);
    const pres = await parsePresentation(zip);
    const assets = await buildImageInventory(zip, pres, 'Demo.pptx');
    expect(assets[0]).toMatchObject({
      width: 8,
      height: 8,
      byteSize: 2_000_000,
    });
    expect(spy.maxSliceBytes()).toBeLessThan(300_000);
  });
});

describe('assetsForSlide', () => {
  it('returns slide 2 assets including layout ones', async () => {
    const assets = await inventory({
      media: only('a.png', 'b.jpeg', 'c.png'),
      layouts: [{ placeholders: [], logoMedia: 'c.png', logoXfrm: R }],
      slides: [{ shapes: [pic('a.png')] }, { shapes: [pic('b.jpeg')] }],
    });
    expect(assetsForSlide(assets, 2).map((a) => a.id)).toEqual([
      'ppt/media/b.jpeg',
      'ppt/media/c.png',
    ]);
  });
});

describe('assetsForSlide with hidden master shapes', () => {
  it('leaves layout images off a slide with showMasterSp="0"', async () => {
    const assets = await inventory({
      media: only('a.png', 'c.png'),
      layouts: [{ placeholders: [], logoMedia: 'c.png', logoXfrm: R }],
      slides: [
        { shapes: [pic('a.png')] },
        { showMasterSp: false, shapes: [pic('a.png')] },
      ],
    });
    expect(assetsForSlide(assets, 1).map((a) => a.id)).toContain(
      'ppt/media/c.png',
    );
    expect(assetsForSlide(assets, 2).map((a) => a.id)).toEqual([
      'ppt/media/a.png',
    ]);
  });
});

describe('deckSlug', () => {
  it('slugifies names', () => {
    expect(deckSlug('Q3 raport.final.pptx')).toBe('q3-raport-final');
    expect(deckSlug('Zażółć gęślą.pptx')).toBe('zazolc-gesla');
    expect(deckSlug('Łódź.pptx')).toBe('lodz');
    expect(deckSlug('....pptx')).toBe('deck');
  });
});

describe('uniqueName', () => {
  it('suffixes collisions', () => {
    expect(uniqueName('a.png', new Set())).toBe('a.png');
    expect(uniqueName('a.png', new Set(['a.png']))).toBe('a-2.png');
    expect(uniqueName('a.png', new Set(['a.png', 'a-2.png']))).toBe('a-3.png');
  });
});

describe('buildImageInventory metadata', () => {
  it('reads the EXIF location of a photo', async () => {
    const photo = jpegWithExif(
      tinyJpeg(8, 8),
      buildExif({
        model: 'Pixel 8',
        gps: { lat: [50, 3, 0], latRef: 'N', lon: [19, 56, 0], lonRef: 'E' },
      }),
    );
    const [asset] = await inventory({
      slides: [{ shapes: [pic('photo.jpg')] }],
      media: { 'photo.jpg': photo },
    });
    expect(asset?.meta.gps?.lat).toBeCloseTo(50.05, 2);
    expect(asset?.meta.camera).toBe('Pixel 8');
    expect(asset?.width).toBe(8);
  });
});
