/* eslint-disable no-magic-numbers -- fixture sizes */
import { NO_META } from './image-meta';
import { describe, expect, it } from 'vitest';
import type { ImageAsset } from './inventory';
import { summarizeMedia } from './summary';

function asset(
  id: string,
  byteSize: number | null,
  origin: ImageAsset['origin'] = 'slide',
): ImageAsset {
  return {
    id,
    archivePath: byteSize === null ? null : id,
    externalUrl: byteSize === null ? id : null,
    fallbackPngPath: null,
    format: 'png',
    byteSize,
    width: 1,
    height: 1,
    slides: [],
    origin,
    cropped: false,
    meta: NO_META,
    missing: false,
    fileName: id,
  };
}

const ASSETS = [
  asset('a', 400),
  asset('b', 100),
  asset('c', 300, 'unused'),
  asset('d', 50, 'layout'),
  asset('https://x/y.png', null),
];

describe('summarizeMedia', () => {
  it('adds up stored images and their share of the file', () => {
    const summary = summarizeMedia(ASSETS, 1000);
    expect(summary.count).toBe(4);
    expect(summary.totalBytes).toBe(850);
    expect(summary.share).toBeCloseTo(0.85);
  });

  it('reports what unused media costs', () => {
    const summary = summarizeMedia(ASSETS, 1000);
    expect(summary.unusedCount).toBe(1);
    expect(summary.unusedBytes).toBe(300);
  });

  it('lists the three heaviest images', () => {
    const ids = summarizeMedia(ASSETS, 1000).largest.map((a) => a.id);
    expect(ids).toEqual(['a', 'c', 'b']);
  });

  it('caps the share when stored sizes exceed the compressed file', () => {
    expect(summarizeMedia(ASSETS, 500).share).toBe(1);
    expect(summarizeMedia([], 0).share).toBe(0);
  });
});
