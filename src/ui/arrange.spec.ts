/* eslint-disable no-magic-numbers -- fixture sizes */
import { describe, expect, it } from 'vitest';
import type { ImageAsset } from '../core/inventory';
import { arrange, formatsOf } from './arrange';

function asset(
  id: string,
  format: ImageAsset['format'],
  byteSize: number | null,
  size: [number, number] | null,
): ImageAsset {
  return {
    id,
    archivePath: id,
    externalUrl: null,
    fallbackPngPath: null,
    format,
    byteSize,
    width: size?.[0] ?? null,
    height: size?.[1] ?? null,
    slides: [1],
    origin: 'slide',
    cropped: false,
    missing: false,
    fileName: id,
  };
}

const ASSETS = [
  asset('small.png', 'png', 100, [10, 10]),
  asset('big.jpg', 'jpeg', 5000, [20, 20]),
  asset('wide.png', 'png', 900, [400, 300]),
  asset('mystery.emf', 'emf', null, null),
];

const ids = (list: ImageAsset[]) => list.map((a) => a.id);

describe('arrange', () => {
  it('keeps the file order by default', () => {
    expect(ids(arrange(ASSETS, 'file', 'all'))).toEqual(ids(ASSETS));
  });

  it('puts the heaviest files first and unknown sizes last', () => {
    expect(ids(arrange(ASSETS, 'bytes', 'all'))).toEqual([
      'big.jpg',
      'wide.png',
      'small.png',
      'mystery.emf',
    ]);
  });

  it('puts the largest resolution first', () => {
    expect(ids(arrange(ASSETS, 'pixels', 'all'))).toEqual([
      'wide.png',
      'big.jpg',
      'small.png',
      'mystery.emf',
    ]);
  });

  it('filters by format before sorting', () => {
    expect(ids(arrange(ASSETS, 'bytes', 'png'))).toEqual([
      'wide.png',
      'small.png',
    ]);
  });

  it('does not reorder the input array', () => {
    const copy = [...ASSETS];
    arrange(ASSETS, 'bytes', 'all');
    expect(ASSETS).toEqual(copy);
  });
});

describe('formatsOf', () => {
  it('lists each format once, sorted', () => {
    expect(formatsOf(ASSETS)).toEqual(['emf', 'jpeg', 'png']);
  });
});
