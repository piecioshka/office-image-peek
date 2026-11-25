/* eslint-disable no-magic-numbers -- binary format field offsets */
/** Builds minimal EXIF (TIFF) blocks and wraps them in JPEG, PNG or WebP. */

type Value =
  | { type: 2; text: string }
  | { type: 4; ifd: number }
  | { type: 5; rationals: [number, number][] };

export type IfdSpec = [number, Value][];

export interface ExifSpec {
  make?: string;
  model?: string;
  taken?: string;
  /** Degrees, minutes, seconds plus N/S and E/W. */
  gps?: {
    lat: [number, number, number];
    latRef: string;
    lon: [number, number, number];
    lonRef: string;
  };
  little?: boolean;
}

function valueBytes(value: Value): number {
  if (value.type === 2) {
    return value.text.length + 1;
  }
  return value.type === 4 ? 4 : value.rationals.length * 8;
}

function ifdSize(ifd: IfdSpec): number {
  return 2 + ifd.length * 12 + 4;
}

/** Lays out IFDs one after another, then the out-of-line values. */
export function buildTiff(ifds: IfdSpec[], little: boolean): Uint8Array {
  const offsets: number[] = [];
  let at = 8;
  for (const ifd of ifds) {
    offsets.push(at);
    at += ifdSize(ifd);
  }
  const dataSize = ifds
    .flat()
    .reduce((sum, [, v]) => sum + (valueBytes(v) > 4 ? valueBytes(v) : 0), 0);
  const bytes = new Uint8Array(at + dataSize);
  const view = new DataView(bytes.buffer);
  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  let data = at;
  ifds.forEach((ifd, index) => {
    const base = offsets[index] ?? 0;
    view.setUint16(base, ifd.length, little);
    [...ifd]
      .sort(([a], [b]) => a - b)
      .forEach(([tag, value], i) => {
        const entry = base + 2 + i * 12;
        view.setUint16(entry, tag, little);
        view.setUint16(entry + 2, value.type, little);
        const size = valueBytes(value);
        const target = size > 4 ? data : entry + 8;
        if (size > 4) {
          view.setUint32(entry + 8, data, little);
          data += size;
        }
        if (value.type === 2) {
          view.setUint32(entry + 4, size, little);
          bytes.set(new TextEncoder().encode(value.text), target);
        } else if (value.type === 4) {
          view.setUint32(entry + 4, 1, little);
          view.setUint32(target, offsets[value.ifd] ?? 0, little);
        } else {
          view.setUint32(entry + 4, value.rationals.length, little);
          value.rationals.forEach(([num, den], r) => {
            view.setUint32(target + r * 8, num, little);
            view.setUint32(target + r * 8 + 4, den, little);
          });
        }
      });
    view.setUint32(base + 2 + ifd.length * 12, 0, little);
  });
  return bytes;
}

const dms = (parts: [number, number, number]): [number, number][] =>
  parts.map((p) => [Math.round(p * 100), 100]);

export function buildExif(spec: ExifSpec): Uint8Array {
  const ifd0: IfdSpec = [];
  const ifds: IfdSpec[] = [ifd0];
  if (spec.make) {
    ifd0.push([0x010f, { type: 2, text: spec.make }]);
  }
  if (spec.model) {
    ifd0.push([0x0110, { type: 2, text: spec.model }]);
  }
  if (spec.taken) {
    ifds.push([[0x9003, { type: 2, text: spec.taken }]]);
    ifd0.push([0x8769, { type: 4, ifd: ifds.length - 1 }]);
  }
  if (spec.gps) {
    ifds.push([
      [1, { type: 2, text: spec.gps.latRef }],
      [2, { type: 5, rationals: dms(spec.gps.lat) }],
      [3, { type: 2, text: spec.gps.lonRef }],
      [4, { type: 5, rationals: dms(spec.gps.lon) }],
    ]);
    ifd0.push([0x8825, { type: 4, ifd: ifds.length - 1 }]);
  }
  return buildTiff(ifds, spec.little ?? false);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u16be(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
}

function u32(n: number, little: boolean): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, little);
  return b;
}

const ascii = (s: string) => new TextEncoder().encode(s);

/** Inserts an APP1 Exif segment right after SOI. */
export function jpegWithExif(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  const payload = concat([ascii('Exif\0\0'), tiff]);
  const app1 = concat([
    new Uint8Array([0xff, 0xe1]),
    u16be(payload.length + 2),
    payload,
  ]);
  return concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Inserts an eXIf chunk after IHDR (the CRC is not checked by readers here). */
export function pngWithExif(png: Uint8Array, tiff: Uint8Array): Uint8Array {
  const chunk = concat([
    u32(tiff.length, false),
    ascii('eXIf'),
    tiff,
    u32(0, false),
  ]);
  const afterIhdr = 8 + 25;
  return concat([png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr)]);
}

/** A bare RIFF/WEBP container holding only an EXIF chunk. */
export function webpWithExif(tiff: Uint8Array): Uint8Array {
  const pad = tiff.length % 2 === 1 ? new Uint8Array(1) : new Uint8Array(0);
  const chunk = concat([ascii('EXIF'), u32(tiff.length, true), tiff, pad]);
  return concat([
    ascii('RIFF'),
    u32(4 + chunk.length, true),
    ascii('WEBP'),
    chunk,
  ]);
}
