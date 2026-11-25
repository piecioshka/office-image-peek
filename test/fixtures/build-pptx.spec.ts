// @vitest-environment jsdom
/* eslint-disable no-magic-numbers */
import { describe, expect, it } from 'vitest';
import { parseXml } from '../../src/core/xml';
import { openZip } from '../../src/core/zip/zip-reader';
import { buildPptx, tinyJpeg, tinyPng } from './build-pptx';

const rect = { x: 0, y: 0, cx: 100, cy: 100 };

describe('buildPptx', () => {
  it('produces an archive with the core parts', async () => {
    const bytes = buildPptx({
      slides: [{ shapes: [] }, { shapes: [{ kind: 'text', text: ['Hi'] }] }],
    });
    const zip = await openZip(new Blob([bytes.slice()]));
    for (const path of [
      '[Content_Types].xml',
      'ppt/presentation.xml',
      'ppt/slides/slide2.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideMasters/slideMaster1.xml',
    ]) {
      expect(zip.has(path)).toBe(true);
    }
  });

  it('emits well-formed XML for every part, incl. charts, tables and svg pictures', async () => {
    const bytes = buildPptx({
      layouts: [
        {
          placeholders: [{ type: 'title', xfrm: rect }],
          logoMedia: 'l.png',
          logoXfrm: rect,
        },
      ],
      slides: [
        {
          hidden: true,
          background: { color: 'FF0000' },
          shapes: [
            {
              kind: 'picture',
              media: 'a.png',
              xfrm: rect,
              svgMedia: 'a.svg',
              crop: { l: 1000 },
            },
            { kind: 'chart', xfrm: rect, chartMedia: 'a.png' },
            { kind: 'table', xfrm: rect },
          ],
        },
        { background: { image: 'a.png' }, shapes: [] },
      ],
      media: {
        'a.png': tinyPng(2, 2, 1),
        'l.png': tinyPng(2, 2, 2),
        'a.svg': new Uint8Array([60]),
      },
    });
    const zip = await openZip(new Blob([bytes.slice()]));
    for (const path of zip.entries.keys()) {
      if (path.endsWith('.xml') || path.endsWith('.rels')) {
        const text = await zip.readText(path);
        expect(() => parseXml(text), path).not.toThrow();
      }
    }
    expect(zip.has('ppt/charts/chart1.xml')).toBe(true);
    expect(zip.has('ppt/media/a.svg')).toBe(true);
    const slide1 = await zip.readText('ppt/slides/slide1.xml');
    expect(slide1).toContain('show="0"');
    expect(slide1).toContain('svgBlip');
  });
});

describe('tinyPng', () => {
  it('is a PNG with the right dimensions and differs per seed', () => {
    const a = tinyPng(3, 5, 1);
    const b = tinyPng(3, 5, 2);
    expect([...a.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const view = new DataView(a.buffer, a.byteOffset);
    expect(view.getUint32(16)).toBe(3);
    expect(view.getUint32(20)).toBe(5);
    expect(a).not.toEqual(b);
  });
});

describe('tinyJpeg', () => {
  it('has SOI and SOF0 with dimensions', () => {
    const j = tinyJpeg(7, 9);
    expect([j[0], j[1]]).toEqual([0xff, 0xd8]);
    expect(j.length).toBeGreaterThan(20);
  });
});
