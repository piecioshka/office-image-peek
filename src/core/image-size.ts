/* eslint-disable no-magic-numbers -- binary format field offsets */
export type ImageFormat =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'bmp'
  | 'svg'
  | 'tiff'
  | 'emf'
  | 'wmf'
  | 'unknown';

export interface ImageInfo {
  format: ImageFormat;
  width: number | null;
  height: number | null;
}

type Dims = { width: number; height: number } | null;

const MAX_SCAN = 65_536;
const JPEG_NON_SOF = new Set([0xc4, 0xc8, 0xcc]);
const TAG_WIDTH = 256;
const TAG_HEIGHT = 257;
const TIFF_ENTRY = 12;
const TYPE_SHORT = 3;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, i) => bytes[i] === value);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function pngSize(bytes: Uint8Array): Dims {
  if (bytes.length < 24) {
    return null;
  }
  const view = viewOf(bytes);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && !JPEG_NON_SOF.has(marker);
}

function jpegSize(bytes: Uint8Array): Dims {
  const view = viewOf(bytes);
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1] ?? 0;
    if (isSof(marker)) {
      return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
    }
    at += marker === 0xff ? 1 : 2 + view.getUint16(at + 2);
  }
  return null;
}

function gifSize(bytes: Uint8Array): Dims {
  const view = viewOf(bytes);
  return bytes.length < 10
    ? null
    : { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function bmpSize(bytes: Uint8Array): Dims {
  if (bytes.length < 26) {
    return null;
  }
  const view = viewOf(bytes);
  return {
    width: Math.abs(view.getInt32(18, true)),
    height: Math.abs(view.getInt32(22, true)),
  };
}

function u24(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] ?? 0) |
    ((bytes[at + 1] ?? 0) << 8) |
    ((bytes[at + 2] ?? 0) << 16)
  );
}

function webpLossless(bytes: Uint8Array): Dims {
  const [b0, b1, b2, b3] = [21, 22, 23, 24].map((i) => bytes[i] ?? 0);
  return {
    width: 1 + ((b0 ?? 0) | (((b1 ?? 0) & 0x3f) << 8)),
    height:
      1 + (((b1 ?? 0) >> 6) | ((b2 ?? 0) << 2) | (((b3 ?? 0) & 0x0f) << 10)),
  };
}

function webpSize(bytes: Uint8Array): Dims {
  const kind = ascii(bytes, 12, 4);
  if (bytes.length < 30) {
    return null;
  }
  const view = viewOf(bytes);
  if (kind === 'VP8 ') {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (kind === 'VP8L') {
    return webpLossless(bytes);
  }
  return kind === 'VP8X'
    ? { width: 1 + u24(bytes, 24), height: 1 + u24(bytes, 27) }
    : null;
}

function tiffValue(view: DataView, at: number, little: boolean): number {
  return view.getUint16(at + 2, little) === TYPE_SHORT
    ? view.getUint16(at + 8, little)
    : view.getUint32(at + 8, little);
}

function tiffSize(bytes: Uint8Array): Dims {
  if (bytes.length < 8) {
    return null;
  }
  const view = viewOf(bytes);
  const little = bytes[0] === 0x49;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > bytes.length) {
    return null;
  }
  const found = new Map<number, number>();
  const count = view.getUint16(ifd, little);
  for (
    let i = 0;
    i < count && ifd + 2 + (i + 1) * TIFF_ENTRY <= bytes.length;
    i += 1
  ) {
    const at = ifd + 2 + i * TIFF_ENTRY;
    found.set(view.getUint16(at, little), tiffValue(view, at, little));
  }
  const width = found.get(TAG_WIDTH);
  const height = found.get(TAG_HEIGHT);
  return typeof width === 'number' && typeof height === 'number'
    ? { width, height }
    : null;
}

function svgNumber(tag: string, name: string): number | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(
    tag,
  );
  const raw = match?.[1] ?? '';
  const value = raw.includes('%') ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function svgViewBox(tag: string): Dims {
  const match = /\sviewBox\s*=\s*["']([^"']+)["']/i.exec(tag);
  const parts = (match?.[1] ?? '').split(/[\s,]+/).map(Number);
  const [, , width, height] = parts;
  return parts.length === 4 &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
    ? { width, height }
    : null;
}

function svgSize(text: string): Dims {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const width = svgNumber(tag, 'width');
  const height = svgNumber(tag, 'height');
  return width !== null && height !== null
    ? { width, height }
    : svgViewBox(tag);
}

function isEmf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [1, 0, 0, 0]) && ascii(bytes, 40, 4) === ' EMF';
}

function isWebp(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
}

function isTiff(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  );
}

function withDims(format: ImageFormat, dims: Dims): ImageInfo {
  return { format, width: dims?.width ?? null, height: dims?.height ?? null };
}

function binaryInfo(bytes: Uint8Array): ImageInfo | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return withDims('png', pngSize(bytes));
  }
  if (startsWith(bytes, [0xff, 0xd8])) {
    return withDims('jpeg', jpegSize(bytes));
  }
  if (ascii(bytes, 0, 4) === 'GIF8') {
    return withDims('gif', gifSize(bytes));
  }
  if (isWebp(bytes)) {
    return withDims('webp', webpSize(bytes));
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    return withDims('bmp', bmpSize(bytes));
  }
  return isTiff(bytes) ? withDims('tiff', tiffSize(bytes)) : null;
}

export function readImageSize(bytes: Uint8Array): ImageInfo {
  const head = bytes.subarray(0, MAX_SCAN);
  const binary = binaryInfo(head);
  if (binary !== null) {
    return binary;
  }
  if (isEmf(head)) {
    return withDims('emf', null);
  }
  if (startsWith(head, [0xd7, 0xcd, 0xc6, 0x9a])) {
    return withDims('wmf', null);
  }
  const text = new TextDecoder().decode(head);
  return /<svg[\s>]/i.test(text)
    ? withDims('svg', svgSize(text))
    : withDims('unknown', null);
}
