/* eslint-disable no-magic-numbers -- binary format field offsets */
import type { ImageFormat } from './image-size';

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Privacy-relevant EXIF fields; everything is null when the image has none. */
export interface ImageMeta {
  gps: GeoPoint | null;
  camera: string | null;
  /** `YYYY-MM-DD HH:mm` */
  taken: string | null;
}

interface Tiff {
  view: DataView;
  little: boolean;
  length: number;
}

interface Entry {
  type: number;
  count: number;
  at: number;
}

export const NO_META: ImageMeta = { gps: null, camera: null, taken: null };
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATE = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_LAT_REF = 1;
const TAG_LAT = 2;
const TAG_LON_REF = 3;
const TAG_LON = 4;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const ENTRY_SIZE = 12;
const INLINE_BYTES = 4;
const MAX_ENTRIES = 512;
const EXIF_HEADER = 'Exif\0\0';

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function jpegExif(bytes: Uint8Array): Uint8Array | null {
  const view = viewOf(bytes);
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) {
      return null;
    }
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && ascii(bytes, at + 4, 6) === EXIF_HEADER) {
      return bytes.subarray(at + 10, at + 2 + length);
    }
    at += 2 + length;
  }
  return null;
}

function pngExif(bytes: Uint8Array): Uint8Array | null {
  const view = viewOf(bytes);
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    if (type === 'eXIf') {
      return bytes.subarray(at + 8, at + 8 + length);
    }
    if (type === 'IDAT' || type === 'IEND') {
      return null;
    }
    at += 12 + length;
  }
  return null;
}

function webpExif(bytes: Uint8Array): Uint8Array | null {
  const view = viewOf(bytes);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    if (ascii(bytes, at, 4) === 'EXIF') {
      const data = bytes.subarray(at + 8, at + 8 + size);
      return ascii(data, 0, 6) === EXIF_HEADER ? data.subarray(6) : data;
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

const LOCATORS: Partial<
  Record<ImageFormat, (bytes: Uint8Array) => Uint8Array | null>
> = {
  jpeg: jpegExif,
  png: pngExif,
  webp: webpExif,
  tiff: (bytes) => bytes,
};

function openTiff(bytes: Uint8Array): Tiff | null {
  const order = ascii(bytes, 0, 2);
  if (bytes.length < 8 || (order !== 'II' && order !== 'MM')) {
    return null;
  }
  return { view: viewOf(bytes), little: order === 'II', length: bytes.length };
}

function readIfd(tiff: Tiff, offset: number | null): Map<number, Entry> {
  const entries = new Map<number, Entry>();
  if (offset === null || offset + 2 > tiff.length) {
    return entries;
  }
  const { view, little } = tiff;
  const count = Math.min(view.getUint16(offset, little), MAX_ENTRIES);
  for (let i = 0; i < count; i += 1) {
    const at = offset + 2 + i * ENTRY_SIZE;
    if (at + ENTRY_SIZE > tiff.length) {
      break;
    }
    entries.set(view.getUint16(at, little), {
      type: view.getUint16(at + 2, little),
      count: view.getUint32(at + 4, little),
      at,
    });
  }
  return entries;
}

/** Start of an entry's data, or null when it runs past the buffer. */
function dataStart(tiff: Tiff, entry: Entry, bytes: number): number | null {
  const start =
    bytes <= INLINE_BYTES
      ? entry.at + 8
      : tiff.view.getUint32(entry.at + 8, tiff.little);
  return start + bytes <= tiff.length ? start : null;
}

function readAscii(tiff: Tiff, entry: Entry | undefined): string | null {
  if (entry?.type !== TYPE_ASCII) {
    return null;
  }
  const start = dataStart(tiff, entry, entry.count);
  if (start === null) {
    return null;
  }
  const raw = new Uint8Array(
    tiff.view.buffer,
    tiff.view.byteOffset + start,
    entry.count,
  );
  const text = new TextDecoder().decode(raw).replace(/\0.*$/s, '').trim();
  return text === '' ? null : text;
}

function readLong(tiff: Tiff, entry: Entry | undefined): number | null {
  if (entry?.type === TYPE_LONG) {
    return tiff.view.getUint32(entry.at + 8, tiff.little);
  }
  return entry?.type === TYPE_SHORT
    ? tiff.view.getUint16(entry.at + 8, tiff.little)
    : null;
}

function readRationals(tiff: Tiff, entry: Entry | undefined): number[] | null {
  if (entry?.type !== TYPE_RATIONAL || entry.count < 3) {
    return null;
  }
  const start = dataStart(tiff, entry, entry.count * 8);
  if (start === null) {
    return null;
  }
  return [0, 1, 2].map((i) => {
    const num = tiff.view.getUint32(start + i * 8, tiff.little);
    const den = tiff.view.getUint32(start + i * 8 + 4, tiff.little);
    return den === 0 ? 0 : num / den;
  });
}

function degrees(parts: number[] | null, ref: string | null): number | null {
  if (parts === null) {
    return null;
  }
  const [d = 0, m = 0, s = 0] = parts;
  const value = d + m / 60 + s / 3600;
  return ref === 'S' || ref === 'W' ? -value : value;
}

function readGps(tiff: Tiff, gps: Map<number, Entry>): GeoPoint | null {
  const lat = degrees(
    readRationals(tiff, gps.get(TAG_LAT)),
    readAscii(tiff, gps.get(TAG_LAT_REF)),
  );
  const lon = degrees(
    readRationals(tiff, gps.get(TAG_LON)),
    readAscii(tiff, gps.get(TAG_LON_REF)),
  );
  // Editors that strip a location often leave zeroed coordinates behind.
  if (lat === null || lon === null || (lat === 0 && lon === 0)) {
    return null;
  }
  return { lat, lon };
}

function readCamera(tiff: Tiff, ifd0: Map<number, Entry>): string | null {
  const make = readAscii(tiff, ifd0.get(TAG_MAKE));
  const model = readAscii(tiff, ifd0.get(TAG_MODEL));
  if (make !== null && model !== null && model.startsWith(make)) {
    return model;
  }
  const parts = [make, model].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' ');
}

function isoDate(raw: string | null): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(raw ?? '');
  if (!match || match[1] === '0000') {
    return null;
  }
  const [, y, mo, d, h, mi] = match;
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

function parseTiff(tiff: Tiff): ImageMeta {
  const ifd0 = readIfd(tiff, tiff.view.getUint32(4, tiff.little));
  const exif = readIfd(tiff, readLong(tiff, ifd0.get(TAG_EXIF_IFD)));
  const gps = readIfd(tiff, readLong(tiff, ifd0.get(TAG_GPS_IFD)));
  return {
    gps: readGps(tiff, gps),
    camera: readCamera(tiff, ifd0),
    taken: isoDate(
      readAscii(tiff, exif.get(TAG_DATE_ORIGINAL)) ??
        readAscii(tiff, ifd0.get(TAG_DATE)),
    ),
  };
}

/** Reads location, camera and capture time from the image's EXIF block. */
export function readImageMeta(
  bytes: Uint8Array,
  format: ImageFormat,
): ImageMeta {
  try {
    const block = LOCATORS[format]?.(bytes) ?? null;
    const tiff = block === null ? null : openTiff(block);
    return tiff === null ? NO_META : parseTiff(tiff);
  } catch {
    // A truncated or malformed block is treated as no metadata.
    return NO_META;
  }
}
