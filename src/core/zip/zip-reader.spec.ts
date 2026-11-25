/* eslint-disable no-magic-numbers */
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { spyBlob } from '../../../test/blob-spy';
import { openZip } from './zip-reader';
import { ZipError } from './zip-error';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let seed = 12345;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    bytes[i] = seed >>> 16;
  }
  return bytes;
}

function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice()]);
}

async function rejectionCode(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ZipError ? error.code : error;
  }
  return 'resolved';
}

function findSignature(bytes: Uint8Array, signature: number, from = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = from; i + 4 <= bytes.length; i += 1) {
    if (view.getUint32(i, true) === signature) {
      return i;
    }
  }
  return -1;
}

function readEocd(zip: Uint8Array): {
  count: number;
  cdSize: number;
  cdOffset: number;
} {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = findSignature(zip, 0x06054b50);
  return {
    count: view.getUint16(eocd + 10, true),
    cdSize: view.getUint32(eocd + 12, true),
    cdOffset: view.getUint32(eocd + 16, true),
  };
}

function buildZip64(zip: Uint8Array): Uint8Array {
  const { count, cdSize, cdOffset } = readEocd(zip);
  const cdEnd = cdOffset + cdSize;
  const tail = new Uint8Array(56 + 20 + 22);
  const t = new DataView(tail.buffer);
  const u16: [number, number][] = [
    [12, 45],
    [14, 45],
    [86, 0xffff],
    [88, 0xffff],
  ];
  const u32: [number, number][] = [
    [0, 0x06064b50],
    [56, 0x07064b50],
    [72, 1],
    [76, 0x06054b50],
    [90, 0xffffffff],
    [94, 0xffffffff],
  ];
  const u64: [number, number][] = [
    [4, 44],
    [24, count],
    [32, count],
    [40, cdSize],
    [48, cdOffset],
    [64, cdEnd],
  ];
  u16.forEach(([at, value]) => t.setUint16(at, value, true));
  u32.forEach(([at, value]) => t.setUint32(at, value, true));
  u64.forEach(([at, value]) => t.setBigUint64(at, BigInt(value), true));
  const out = new Uint8Array(cdEnd + tail.length);
  out.set(zip.subarray(0, cdEnd));
  out.set(tail, cdEnd);
  return out;
}

describe('openZip', () => {
  it('lists entries with sizes', async () => {
    const zip = zipSync({
      'a.txt': strToU8('hello'),
      'dir/b.bin': [new Uint8Array([1, 2, 3]), { level: 0 }],
    });
    const archive = await openZip(toBlob(zip));
    expect(archive.entries.size).toBe(2);
    expect(archive.entries.get('a.txt')?.size).toBe(5);
    expect(archive.has('dir/b.bin')).toBe(true);
    expect(archive.has('nope')).toBe(false);
  });

  it('reads deflated and stored entries byte-exact', async () => {
    const data = randomBytes(200_000);
    const zip = zipSync({
      'stored.bin': [data, { level: 0 }],
      'deflated.bin': [data, { level: 6 }],
    });
    const archive = await openZip(toBlob(zip));
    expect(archive.entries.get('stored.bin')?.method).toBe(0);
    expect(archive.entries.get('deflated.bin')?.method).toBe(8);
    expect(await archive.readBytes('stored.bin')).toEqual(data);
    expect(await archive.readBytes('deflated.bin')).toEqual(data);
  });

  it('reads text entries', async () => {
    const archive = await openZip(
      toBlob(zipSync({ 'a.txt': strToU8('zażółć') })),
    );
    expect(await archive.readText('a.txt')).toBe('zażółć');
  });

  it('reads only the needed ranges', async () => {
    const zip = zipSync({
      'big.bin': [randomBytes(4_000_000), { level: 0 }],
      'small.txt': strToU8('tiny'),
    });
    const spy = spyBlob(toBlob(zip));
    const archive = await openZip(spy.blob);
    expect(await archive.readText('small.txt')).toBe('tiny');
    expect(spy.maxSliceBytes()).toBeLessThan(70_000);
    expect(spy.fullReads()).toBe(0);
  });

  it('handles ZIP64 end of central directory', async () => {
    const zip = buildZip64(zipSync({ 'a.txt': strToU8('hello') }));
    const archive = await openZip(toBlob(zip));
    expect(await archive.readText('a.txt')).toBe('hello');
  });

  it('rejects non-zip with not-zip', async () => {
    const bytes = new Uint8Array(104);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await rejectionCode(openZip(toBlob(bytes)))).toBe('not-zip');
  });

  it('rejects CFB with cfb', async () => {
    const bytes = new Uint8Array(608);
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(await rejectionCode(openZip(toBlob(bytes)))).toBe('cfb');
  });

  it('rejects truncated archive with truncated', async () => {
    const zip = zipSync({ 'a.bin': [randomBytes(5000), { level: 0 }] });
    const half = zip.slice(0, Math.floor(zip.length / 2));
    expect(await rejectionCode(openZip(toBlob(half)))).toBe('truncated');
  });

  it('rejects encrypted entry on read with encrypted-entry', async () => {
    const zip = zipSync({ 'a.txt': strToU8('hello') });
    const central = findSignature(zip, 0x02014b50);
    zip[central + 8] = (zip[central + 8] ?? 0) | 1;
    const archive = await openZip(toBlob(zip));
    expect(await rejectionCode(archive.readBytes('a.txt'))).toBe(
      'encrypted-entry',
    );
  });

  it('rejects unsupported compression method on read', async () => {
    const zip = zipSync({ 'a.txt': strToU8('hello') });
    const central = findSignature(zip, 0x02014b50);
    zip[central + 10] = 12;
    const archive = await openZip(toBlob(zip));
    expect(await rejectionCode(archive.readBytes('a.txt'))).toBe(
      'unsupported-method',
    );
  });
});
