// @vitest-environment jsdom
/* eslint-disable no-magic-numbers */
import { describe, expect, it } from 'vitest';
import { buildPptx, tinyPng } from '../../test/fixtures/build-pptx';
import {
  readRelationships,
  relTypeIs,
  relsPathFor,
  resolveTarget,
} from './opc';
import { openZip } from './zip/zip-reader';

describe('resolveTarget', () => {
  it('resolves a relative target', () => {
    expect(resolveTarget('ppt/slides/slide1.xml', '../media/image1.png')).toBe(
      'ppt/media/image1.png',
    );
  });

  it('resolves an absolute target', () => {
    expect(
      resolveTarget('ppt/slides/slide1.xml', '/ppt/media/image1.png'),
    ).toBe('ppt/media/image1.png');
  });

  it('decodes URL-encoded targets', () => {
    expect(
      resolveTarget('ppt/slides/slide1.xml', '../media/image%201.png'),
    ).toBe('ppt/media/image 1.png');
  });

  it('resolves a sibling-directory target', () => {
    expect(resolveTarget('ppt/presentation.xml', 'slides/slide2.xml')).toBe(
      'ppt/slides/slide2.xml',
    );
  });
});

describe('relsPathFor', () => {
  it('maps a part path to its rels path', () => {
    expect(relsPathFor('ppt/slides/slide1.xml')).toBe(
      'ppt/slides/_rels/slide1.xml.rels',
    );
    expect(relsPathFor('ppt/presentation.xml')).toBe(
      'ppt/_rels/presentation.xml.rels',
    );
  });
});

describe('relTypeIs', () => {
  const rel = (type: string) => ({
    id: 'rId1',
    type,
    target: 'x',
    external: false,
  });

  it('matches the last segment for transitional and strict namespaces', () => {
    const t =
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
    const s = 'http://purl.oclc.org/ooxml/officeDocument/relationships/image';
    expect(relTypeIs(rel(t), 'image')).toBe(true);
    expect(relTypeIs(rel(s), 'image')).toBe(true);
    expect(relTypeIs(rel(t), 'slide')).toBe(false);
  });
});

describe('readRelationships', () => {
  const deck = buildPptx({
    slides: [
      {
        shapes: [
          {
            kind: 'picture',
            media: 'a.png',
            xfrm: { x: 0, y: 0, cx: 10, cy: 10 },
          },
          {
            kind: 'picture',
            media: 'a.png',
            xfrm: { x: 0, y: 0, cx: 10, cy: 10 },
            external: 'https://example.com/pic.png',
          },
        ],
      },
    ],
    media: { 'a.png': tinyPng(2, 2, 1) },
  });

  it('returns resolved internal targets', async () => {
    const zip = await openZip(new Blob([deck.slice()]));
    const rels = await readRelationships(zip, 'ppt/slides/slide1.xml');
    const images = [...rels.values()].filter((r) => relTypeIs(r, 'image'));
    const internal = images.find((r) => !r.external);
    expect(internal?.target).toBe('ppt/media/a.png');
  });

  it('keeps raw external URLs', async () => {
    const zip = await openZip(new Blob([deck.slice()]));
    const rels = await readRelationships(zip, 'ppt/slides/slide1.xml');
    const external = [...rels.values()].find((r) => r.external);
    expect(external?.target).toBe('https://example.com/pic.png');
  });

  it('returns an empty map when the rels file is missing', async () => {
    const zip = await openZip(new Blob([deck.slice()]));
    const rels = await readRelationships(zip, 'ppt/nothing.xml');
    expect(rels.size).toBe(0);
  });
});
