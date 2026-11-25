// @vitest-environment jsdom
/* eslint-disable no-magic-numbers */
import { describe, expect, it } from 'vitest';
import {
  buildPptx,
  tinyPng,
  type FixtureDeck,
} from '../../test/fixtures/build-pptx';
import { PptxError } from './xml';
import { parsePresentation } from './parse-presentation';
import { openZip } from './zip/zip-reader';

async function parse(deck: FixtureDeck) {
  const zip = await openZip(new Blob([buildPptx(deck).slice()]));
  return parsePresentation(zip);
}

const R = { x: 100, y: 200, cx: 300, cy: 400 };
const PNG = { 'a.png': tinyPng(2, 2, 1), 'b.png': tinyPng(2, 2, 2) };

describe('parsePresentation', () => {
  it('reads slide size and order', async () => {
    const size = { cx: 12192000, cy: 6858000 };
    const deck = await parse({
      slideSize: size,
      reverseFileOrder: true,
      slides: [
        { shapes: [{ kind: 'text', text: ['one'], xfrm: R }] },
        { shapes: [{ kind: 'text', text: ['two'], xfrm: R }] },
        { shapes: [{ kind: 'text', text: ['three'], xfrm: R }] },
      ],
    });
    expect(deck.size).toEqual(size);
    expect(deck.slides.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(deck.slides[0]?.partPath).toBe('ppt/slides/slide3.xml');
    const first = deck.slides[0]?.shapes[0];
    expect(first?.kind === 'text' && first.paragraphs[0]?.text).toBe('one');
  });

  it('parses text size and bold', async () => {
    const deck = await parse({
      slides: [
        {
          shapes: [
            { kind: 'text', text: ['x'], xfrm: R, bold: true, sizePt: 24 },
          ],
        },
      ],
    });
    expect(deck.slides[0]?.shapes[0]).toEqual({
      kind: 'text',
      rect: R,
      paragraphs: [{ text: 'x', bold: true, sizePt: 24 }],
    });
  });

  it('parses picture with crop', async () => {
    const deck = await parse({
      media: PNG,
      slides: [
        {
          shapes: [
            {
              kind: 'picture',
              media: 'a.png',
              xfrm: R,
              crop: { l: 10000, r: 20000 },
            },
          ],
        },
      ],
    });
    const shape = deck.slides[0]?.shapes[0];
    expect(shape).toMatchObject({
      kind: 'picture',
      rect: R,
      mediaPath: 'ppt/media/a.png',
      svgPath: null,
      externalUrl: null,
      source: 'slide',
    });
    expect(shape?.kind === 'picture' && shape.crop).toEqual({
      l: 0.1,
      t: 0,
      r: 0.2,
      b: 0,
    });
  });

  it('keeps external pictures with a null media path', async () => {
    const deck = await parse({
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
    expect(deck.slides[0]?.shapes[0]).toMatchObject({
      kind: 'picture',
      rect: R,
      mediaPath: null,
      externalUrl: 'https://example.com/x.png',
    });
  });

  it('maps svg+png picture', async () => {
    const deck = await parse({
      media: { 'a.png': tinyPng(2, 2, 1), 'a.svg': new Uint8Array([60]) },
      slides: [
        {
          shapes: [
            { kind: 'picture', media: 'a.png', svgMedia: 'a.svg', xfrm: R },
          ],
        },
      ],
    });
    expect(deck.slides[0]?.shapes[0]).toMatchObject({
      mediaPath: 'ppt/media/a.png',
      svgPath: 'ppt/media/a.svg',
    });
  });

  it('inherits placeholder position from layout', async () => {
    const deck = await parse({
      layouts: [{ placeholders: [{ type: 'body', idx: 1, xfrm: R }] }],
      slides: [
        {
          shapes: [
            {
              kind: 'text',
              text: ['body'],
              placeholder: { type: 'body', idx: 1 },
            },
          ],
        },
      ],
    });
    expect(deck.slides[0]?.shapes[0]).toMatchObject({ kind: 'text', rect: R });
  });

  it('falls back to master title position', async () => {
    const deck = await parse({
      layouts: [{ placeholders: [] }],
      slides: [
        {
          shapes: [
            { kind: 'text', text: ['T'], placeholder: { type: 'title' } },
          ],
        },
      ],
    });
    expect(deck.slides[0]?.shapes[0]).toMatchObject({
      rect: { x: 457200, y: 274638, cx: 8229600, cy: 1143000 },
    });
  });

  it('skips shapes without a resolvable rect', async () => {
    const deck = await parse({
      layouts: [{ placeholders: [] }],
      slides: [
        {
          shapes: [
            {
              kind: 'text',
              text: ['?'],
              placeholder: { type: 'body', idx: 5 },
            },
          ],
        },
      ],
    });
    expect(deck.slides[0]?.shapes).toEqual([]);
  });

  it('reads background color and image with inheritance', async () => {
    const deck = await parse({
      media: PNG,
      layouts: [{ placeholders: [], background: { image: 'b.png' } }],
      slides: [{ background: { color: 'FF0000' }, shapes: [] }, { shapes: [] }],
    });
    expect(deck.slides[0]?.background).toEqual({
      kind: 'color',
      color: '#FF0000',
    });
    expect(deck.slides[1]?.background).toEqual({
      kind: 'image',
      mediaPath: 'ppt/media/b.png',
    });
  });

  it('falls back to the master background', async () => {
    const deck = await parse({
      layouts: [{ placeholders: [] }],
      slides: [{ shapes: [] }],
    });
    expect(deck.slides[0]?.background).toEqual({
      kind: 'color',
      color: '#FFFFFF',
    });
  });

  it('marks hidden slides', async () => {
    const deck = await parse({
      slides: [{ shapes: [] }, { hidden: true, shapes: [] }],
    });
    expect(deck.slides.map((s) => s.hidden)).toEqual([false, true]);
  });

  it('collects chart media as extraMedia and renders chart as a box', async () => {
    const deck = await parse({
      media: PNG,
      slides: [
        {
          shapes: [
            { kind: 'chart', xfrm: R, chartMedia: 'a.png' },
            { kind: 'table', xfrm: R },
          ],
        },
      ],
    });
    const slide = deck.slides[0];
    expect(slide?.extraMedia).toEqual(['ppt/media/a.png']);
    expect(slide?.shapes).toEqual([
      { kind: 'placeholder-box', rect: R, label: 'chart' },
      { kind: 'placeholder-box', rect: R, label: 'table' },
    ]);
  });

  it('includes layout logo as picture with source layout', async () => {
    const logo = { x: 1, y: 2, cx: 3, cy: 4 };
    const deck = await parse({
      media: PNG,
      layouts: [{ placeholders: [], logoMedia: 'a.png', logoXfrm: logo }],
      slides: [{ shapes: [{ kind: 'text', text: ['t'], xfrm: R }] }],
    });
    const shapes = deck.slides[0]?.shapes ?? [];
    expect(shapes[0]).toMatchObject({
      kind: 'picture',
      rect: logo,
      mediaPath: 'ppt/media/a.png',
      source: 'layout',
    });
    expect(shapes[1]?.kind).toBe('text');
    expect(deck.layoutPaths).toEqual(['ppt/slideLayouts/slideLayout1.xml']);
    expect(deck.masterPaths).toEqual(['ppt/slideMasters/slideMaster1.xml']);
    expect(deck.slides[0]?.layoutPath).toBe(
      'ppt/slideLayouts/slideLayout1.xml',
    );
  });

  it('flattens group shapes', async () => {
    const deck = await parse({
      media: PNG,
      slides: [
        {
          shapes: [
            {
              kind: 'group',
              xfrm: { x: 1000, y: 1000, cx: 200, cy: 200 },
              childSpace: { x: 0, y: 0, cx: 100, cy: 100 },
              children: [
                {
                  kind: 'picture',
                  media: 'a.png',
                  xfrm: { x: 50, y: 50, cx: 50, cy: 50 },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(deck.slides[0]?.shapes[0]).toMatchObject({
      kind: 'picture',
      rect: { x: 1100, y: 1100, cx: 100, cy: 100 },
    });
  });

  it('rejects archive without ppt/presentation.xml with no-presentation', async () => {
    const zip = await openZip(new Blob([buildPptx({ slides: [] }).slice()]));
    const broken = {
      ...zip,
      has: (path: string) =>
        path === 'ppt/presentation.xml' ? false : zip.has(path),
    };
    await expect(parsePresentation(broken)).rejects.toMatchObject({
      code: 'no-presentation',
    });
    await expect(parsePresentation(broken)).rejects.toBeInstanceOf(PptxError);
  });
});
