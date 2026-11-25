/* eslint-disable no-magic-numbers -- fixture dimensions and bytes */
import { describe, expect, it } from 'vitest';
import { tinyJpeg, tinyPng } from '../../test/fixtures/build-pptx';
import { readImageSize } from './image-size';

const text = (s: string) => new TextEncoder().encode(s);

describe('readImageSize', () => {
  it('reads PNG dimensions', () => {
    expect(readImageSize(tinyPng(640, 480, 1))).toEqual({
      format: 'png',
      width: 640,
      height: 480,
    });
  });

  it('reads JPEG dimensions from SOF0', () => {
    expect(readImageSize(tinyJpeg(1920, 1080))).toEqual({
      format: 'jpeg',
      width: 1920,
      height: 1080,
    });
  });

  it('reads GIF dimensions', () => {
    const gif = Uint8Array.from([
      ...text('GIF89a'),
      0x20,
      0x01,
      0x10,
      0x00,
      0,
      0,
      0,
    ]);
    expect(readImageSize(gif)).toEqual({
      format: 'gif',
      width: 288,
      height: 16,
    });
  });

  it('reads BMP dimensions', () => {
    const bmp = new Uint8Array(30);
    bmp.set(text('BM'));
    const view = new DataView(bmp.buffer);
    view.setInt32(18, 40, true);
    view.setInt32(22, -20, true);
    expect(readImageSize(bmp)).toEqual({
      format: 'bmp',
      width: 40,
      height: 20,
    });
  });

  it('reads WebP VP8X dimensions', () => {
    const webp = new Uint8Array(30);
    webp.set(text('RIFF'));
    webp.set(text('WEBP'), 8);
    webp.set(text('VP8X'), 12);
    webp.set([99, 0, 0], 24);
    webp.set([49, 0, 0], 27);
    expect(readImageSize(webp)).toEqual({
      format: 'webp',
      width: 100,
      height: 50,
    });
  });

  it('reads little-endian TIFF dimensions', () => {
    const tiff = new Uint8Array(40);
    tiff.set([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
    const view = new DataView(tiff.buffer);
    view.setUint16(8, 2, true);
    view.setUint16(10, 256, true);
    view.setUint16(12, 3, true);
    view.setUint32(14, 1, true);
    view.setUint16(18, 300, true);
    view.setUint16(22, 257, true);
    view.setUint16(24, 4, true);
    view.setUint32(26, 1, true);
    view.setUint32(30, 200, true);
    expect(readImageSize(tiff)).toEqual({
      format: 'tiff',
      width: 300,
      height: 200,
    });
  });

  it('reads SVG viewBox', () => {
    const svg = text(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150"></svg>',
    );
    expect(readImageSize(svg)).toEqual({
      format: 'svg',
      width: 300,
      height: 150,
    });
  });

  it('prefers SVG width and height attributes', () => {
    const svg = text(
      '<?xml version="1.0"?><svg width="64px" height="32" viewBox="0 0 1 1"/>',
    );
    expect(readImageSize(svg)).toEqual({
      format: 'svg',
      width: 64,
      height: 32,
    });
  });

  it('recognizes EMF and WMF without dimensions', () => {
    const emf = new Uint8Array(48);
    emf.set([1, 0, 0, 0]);
    emf.set(text(' EMF'), 40);
    expect(readImageSize(emf)).toEqual({
      format: 'emf',
      width: null,
      height: null,
    });
    const wmf = Uint8Array.from([0xd7, 0xcd, 0xc6, 0x9a, 0, 0, 0, 0]);
    expect(readImageSize(wmf)).toEqual({
      format: 'wmf',
      width: null,
      height: null,
    });
  });

  it('returns unknown for random bytes', () => {
    expect(readImageSize(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({
      format: 'unknown',
      width: null,
      height: null,
    });
  });
});
