/* eslint-disable no-magic-numbers -- binary format field offsets */
import { inflateSync } from 'fflate';
import { ZipError, type ZipErrorCode } from './zip-error';

export interface ZipEntry {
  path: string;
  method: 0 | 8;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  crc32: number;
}

export interface ZipArchive {
  entries: ReadonlyMap<string, ZipEntry>;
  has(path: string): boolean;
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_LOCATOR64 = 0x07064b50;
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_MAGIC = [0x50, 0x4b];
const EOCD_MIN = 22;
const MAX_COMMENT = 65_535;
const LOCATOR64_SIZE = 20;
const EOCD64_SIZE = 56;
const CENTRAL_FIXED = 46;
const LOCAL_FIXED = 30;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
const EXTRA_ZIP64 = 0x0001;
const FLAG_ENCRYPTED = 0x1;
const FLAG_UTF8 = 0x800;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const UINT16_BYTES = 2;
const UINT32_BYTES = 4;
const UINT64_BYTES = 8;

interface Directory {
  count: number;
  size: number;
  offset: number;
}

function truncated(): ZipError {
  return new ZipError('truncated', 'Archive is truncated or corrupted');
}

async function readRange(
  blob: Blob,
  start: number,
  length: number,
): Promise<DataView> {
  const buffer = await blob.slice(start, start + length).arrayBuffer();
  if (buffer.byteLength < length) {
    throw truncated();
  }
  return new DataView(buffer);
}

async function checkMagic(blob: Blob): Promise<void> {
  const head = new Uint8Array(
    await blob.slice(0, CFB_MAGIC.length).arrayBuffer(),
  );
  if (CFB_MAGIC.every((byte, i) => head[i] === byte)) {
    throw new ZipError('cfb', 'Encrypted or legacy Office file');
  }
  if (!ZIP_MAGIC.every((byte, i) => head[i] === byte)) {
    throw new ZipError('not-zip', 'Not a ZIP archive');
  }
}

function findEocd(view: DataView): number {
  for (let i = view.byteLength - EOCD_MIN; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      return i;
    }
  }
  throw truncated();
}

async function readZip64Directory(
  blob: Blob,
  tail: DataView,
  eocd: number,
): Promise<Directory> {
  const locator = eocd - LOCATOR64_SIZE;
  if (locator < 0 || tail.getUint32(locator, true) !== SIG_LOCATOR64) {
    throw truncated();
  }
  const offset = Number(
    tail.getBigUint64(locator + UINT32_BYTES + UINT32_BYTES, true),
  );
  const record = await readRange(blob, offset, EOCD64_SIZE);
  if (record.getUint32(0, true) !== SIG_EOCD64) {
    throw truncated();
  }
  return {
    count: Number(record.getBigUint64(32, true)),
    size: Number(record.getBigUint64(40, true)),
    offset: Number(record.getBigUint64(48, true)),
  };
}

async function readDirectory(blob: Blob): Promise<Directory> {
  const tailSize = Math.min(blob.size, EOCD_MIN + MAX_COMMENT);
  const tail = await readRange(blob, blob.size - tailSize, tailSize);
  const eocd = findEocd(tail);
  const count = tail.getUint16(eocd + 10, true);
  const size = tail.getUint32(eocd + 12, true);
  const offset = tail.getUint32(eocd + 16, true);
  if (count === MAX_U16 || size === MAX_U32 || offset === MAX_U32) {
    return readZip64Directory(blob, tail, eocd);
  }
  return { count, size, offset };
}

interface Sizes {
  size: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function applyZip64Extra(
  view: DataView,
  start: number,
  end: number,
  sizes: Sizes,
): Sizes {
  const result = { ...sizes };
  let pos = start;
  while (pos + UINT32_BYTES <= end) {
    const id = view.getUint16(pos, true);
    const length = view.getUint16(pos + UINT16_BYTES, true);
    if (id === EXTRA_ZIP64) {
      readZip64Fields(view, pos + UINT32_BYTES, result);
    }
    pos += UINT32_BYTES + length;
  }
  return result;
}

function readZip64Fields(view: DataView, start: number, sizes: Sizes): void {
  let pos = start;
  const take = (): number => {
    const value = Number(view.getBigUint64(pos, true));
    pos += UINT64_BYTES;
    return value;
  };
  if (sizes.size === MAX_U32) {
    sizes.size = take();
  }
  if (sizes.compressedSize === MAX_U32) {
    sizes.compressedSize = take();
  }
  if (sizes.localHeaderOffset === MAX_U32) {
    sizes.localHeaderOffset = take();
  }
}

function decodeName(bytes: Uint8Array, flags: number): string {
  const label = flags & FLAG_UTF8 ? 'utf-8' : 'latin1';
  return new TextDecoder(label).decode(bytes);
}

interface Parsed {
  entry: ZipEntry;
  method: number;
  encrypted: boolean;
  next: number;
}

interface RecordHeader {
  flags: number;
  method: number;
  nameLength: number;
  extraLength: number;
  next: number;
}

function readRecordHeader(view: DataView, pos: number): RecordHeader {
  if (
    pos + CENTRAL_FIXED > view.byteLength ||
    view.getUint32(pos, true) !== SIG_CENTRAL
  ) {
    throw truncated();
  }
  const nameLength = view.getUint16(pos + 28, true);
  const extraLength = view.getUint16(pos + 30, true);
  const next =
    pos +
    CENTRAL_FIXED +
    nameLength +
    extraLength +
    view.getUint16(pos + 32, true);
  if (next > view.byteLength) {
    throw truncated();
  }
  return {
    flags: view.getUint16(pos + 8, true),
    method: view.getUint16(pos + 10, true),
    nameLength,
    extraLength,
    next,
  };
}

function parseRecord(view: DataView, pos: number): Parsed {
  const { flags, method, nameLength, extraLength, next } = readRecordHeader(
    view,
    pos,
  );
  const nameStart = pos + CENTRAL_FIXED;
  const name = new Uint8Array(
    view.buffer,
    view.byteOffset + nameStart,
    nameLength,
  );
  const extraStart = nameStart + nameLength;
  const sizes = applyZip64Extra(view, extraStart, extraStart + extraLength, {
    compressedSize: view.getUint32(pos + 20, true),
    size: view.getUint32(pos + 24, true),
    localHeaderOffset: view.getUint32(pos + 42, true),
  });
  const entry: ZipEntry = {
    path: decodeName(name, flags),
    method: method === METHOD_STORED ? METHOD_STORED : METHOD_DEFLATED,
    crc32: view.getUint32(pos + 16, true),
    ...sizes,
  };
  return { entry, method, encrypted: (flags & FLAG_ENCRYPTED) !== 0, next };
}

function problemFor(parsed: Parsed): ZipErrorCode | null {
  if (parsed.encrypted) {
    return 'encrypted-entry';
  }
  if (parsed.method !== METHOD_STORED && parsed.method !== METHOD_DEFLATED) {
    return 'unsupported-method';
  }
  return null;
}

interface Index {
  entries: Map<string, ZipEntry>;
  problems: Map<string, ZipErrorCode>;
}

function parseDirectory(view: DataView, count: number): Index {
  const index: Index = { entries: new Map(), problems: new Map() };
  let pos = 0;
  for (let i = 0; i < count; i += 1) {
    const parsed = parseRecord(view, pos);
    pos = parsed.next;
    const { path } = parsed.entry;
    if (!path.endsWith('/')) {
      addToIndex(index, parsed);
    }
  }
  return index;
}

function addToIndex(index: Index, parsed: Parsed): void {
  const { path } = parsed.entry;
  const problem = problemFor(parsed);
  index.problems.delete(path);
  index.entries.delete(path);
  if (problem) {
    index.problems.set(path, problem);
  }
  if (parsed.method === METHOD_STORED || parsed.method === METHOD_DEFLATED) {
    index.entries.set(path, parsed.entry);
  }
}

async function readEntryData(blob: Blob, entry: ZipEntry): Promise<Uint8Array> {
  const header = await readRange(blob, entry.localHeaderOffset, LOCAL_FIXED);
  if (header.getUint32(0, true) !== SIG_LOCAL) {
    throw truncated();
  }
  const skip =
    LOCAL_FIXED + header.getUint16(26, true) + header.getUint16(28, true);
  const start = entry.localHeaderOffset + skip;
  const data = await readRange(blob, start, entry.compressedSize);
  const bytes = new Uint8Array(data.buffer);
  return entry.method === METHOD_STORED ? bytes : inflateSync(bytes);
}

export async function openZip(blob: Blob): Promise<ZipArchive> {
  await checkMagic(blob);
  const directory = await readDirectory(blob);
  const view = await readRange(blob, directory.offset, directory.size);
  const { entries, problems } = parseDirectory(view, directory.count);

  const readBytes = async (path: string): Promise<Uint8Array> => {
    const problem = problems.get(path);
    if (problem) {
      throw new ZipError(problem, `Cannot read entry: ${path}`);
    }
    const entry = entries.get(path);
    if (!entry) {
      throw new Error(`No such archive entry: ${path}`);
    }
    return readEntryData(blob, entry);
  };

  return {
    entries,
    has: (path) => entries.has(path),
    readBytes,
    readText: async (path) =>
      new TextDecoder('utf-8').decode(await readBytes(path)),
  };
}
