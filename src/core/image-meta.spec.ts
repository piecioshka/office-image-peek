/* eslint-disable no-magic-numbers -- coordinates and offsets */
import { describe, expect, it } from 'vitest';
import {
  buildExif,
  jpegWithExif,
  pngWithExif,
  webpWithExif,
  type ExifSpec,
} from '../../test/fixtures/exif';
import { tinyJpeg, tinyPng } from '../../test/fixtures/build-pptx';
import { readImageMeta } from './image-meta';

const WARSAW: ExifSpec['gps'] = {
  lat: [52, 13, 47.16],
  latRef: 'N',
  lon: [21, 0, 42],
  lonRef: 'E',
};

const FULL: ExifSpec = {
  make: 'Apple',
  model: 'iPhone 13',
  taken: '2024:05:01 12:34:56',
  gps: WARSAW,
};

describe('readImageMeta', () => {
  for (const little of [false, true]) {
    it(`reads GPS, camera and date from a JPEG (${little ? 'II' : 'MM'})`, () => {
      const bytes = jpegWithExif(
        tinyJpeg(4, 4),
        buildExif({ ...FULL, little }),
      );
      const meta = readImageMeta(bytes, 'jpeg');
      expect(meta.gps?.lat).toBeCloseTo(52.2298, 4);
      expect(meta.gps?.lon).toBeCloseTo(21.0117, 4);
      expect(meta.camera).toBe('Apple iPhone 13');
      expect(meta.taken).toBe('2024-05-01 12:34');
    });
  }

  it('makes southern and western coordinates negative', () => {
    const gps = {
      lat: [33, 52, 0],
      latRef: 'S',
      lon: [151, 12, 0],
      lonRef: 'W',
    } as const;
    const tiff = buildExif({
      gps: { ...gps, lat: [...gps.lat], lon: [...gps.lon] },
    });
    const meta = readImageMeta(jpegWithExif(tinyJpeg(4, 4), tiff), 'jpeg');
    expect(meta.gps?.lat).toBeCloseTo(-33.8667, 4);
    expect(meta.gps?.lon).toBeCloseTo(-151.2, 4);
  });

  it('reads EXIF from a PNG eXIf chunk', () => {
    const bytes = pngWithExif(tinyPng(4, 4, 1), buildExif({ gps: WARSAW }));
    expect(readImageMeta(bytes, 'png').gps).not.toBeNull();
  });

  it('reads EXIF from a WebP EXIF chunk', () => {
    const bytes = webpWithExif(buildExif({ make: 'Canon', model: 'EOS R6' }));
    expect(readImageMeta(bytes, 'webp').camera).toBe('Canon EOS R6');
  });

  it('does not repeat the make when the model already starts with it', () => {
    const tiff = buildExif({ make: 'Canon', model: 'Canon EOS R6' });
    const meta = readImageMeta(jpegWithExif(tinyJpeg(4, 4), tiff), 'jpeg');
    expect(meta.camera).toBe('Canon EOS R6');
  });

  it('ignores zeroed coordinates left by editors', () => {
    const gps = { lat: [0, 0, 0], latRef: 'N', lon: [0, 0, 0], lonRef: 'E' };
    const tiff = buildExif({
      gps: {
        ...gps,
        lat: [0, 0, 0],
        lon: [0, 0, 0],
      },
    });
    const meta = readImageMeta(jpegWithExif(tinyJpeg(4, 4), tiff), 'jpeg');
    expect(meta.gps).toBeNull();
  });

  it('returns nothing for images without EXIF', () => {
    expect(readImageMeta(tinyJpeg(4, 4), 'jpeg')).toEqual({
      gps: null,
      camera: null,
      taken: null,
    });
    expect(readImageMeta(tinyPng(4, 4, 1), 'png').gps).toBeNull();
  });

  it('survives a truncated EXIF block', () => {
    const full = jpegWithExif(tinyJpeg(4, 4), buildExif(FULL));
    for (const cut of [6, 20, 40, 80, 120]) {
      expect(() => readImageMeta(full.subarray(0, cut), 'jpeg')).not.toThrow();
    }
  });
});
