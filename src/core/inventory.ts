/* eslint-disable no-magic-numbers -- 0/1 defaults and index arithmetic */
import { readImageSize, type ImageFormat } from './image-size';
import { readRelationships, relTypeIs, type Relationship } from './opc';
import type { Presentation, Slide } from './types';
import type { ZipArchive } from './zip/zip-reader';

export interface ImageAsset {
  /** Archive path, or the external URL. */
  id: string;
  archivePath: string | null;
  externalUrl: string | null;
  fallbackPngPath: string | null;
  format: ImageFormat;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  slides: number[];
  origin: 'slide' | 'layout' | 'unused';
  cropped: boolean;
  missing: boolean;
  fileName: string;
}

interface Ref {
  id: string;
  external: boolean;
}

interface Usage {
  ref: Ref;
  origin: 'slide' | 'layout';
  firstSlide: number | null;
  slides: Set<number>;
}

const MEDIA_PREFIX = 'ppt/media/';
const WIDE_DECK = 100;
const NARROW_PAD = 2;
const WIDE_PAD = 3;
const EXT_FORMATS = new Map<string, ImageFormat>([
  ['png', 'png'],
  ['jpg', 'jpeg'],
  ['jpeg', 'jpeg'],
  ['gif', 'gif'],
  ['webp', 'webp'],
  ['bmp', 'bmp'],
  ['svg', 'svg'],
  ['tif', 'tiff'],
  ['tiff', 'tiff'],
  ['emf', 'emf'],
  ['wmf', 'wmf'],
]);

export function deckSlug(fileName: string): string {
  const slug = fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'deck' : slug;
}

export function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot < 0 ? name : name.slice(0, dot);
  const ext = dot < 0 ? '' : name.slice(dot);
  let candidate = name;
  let n = 1;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export function assetsForSlide(
  assets: ImageAsset[],
  slideIndex: number,
): ImageAsset[] {
  return assets.filter((asset) => asset.slides.includes(slideIndex));
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function imageRefs(rels: Map<string, Relationship>): Ref[] {
  return Array.from(rels.values())
    .filter((rel) => relTypeIs(rel, 'image'))
    .map((rel) => ({ id: rel.target, external: rel.external }));
}

/** Fallback PNG path -> its SVG path, from pictures carrying both. */
function fallbackPairs(pres: Presentation): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const slide of pres.slides) {
    for (const shape of slide.shapes) {
      if (
        shape.kind === 'picture' &&
        shape.svgPath !== null &&
        shape.mediaPath !== null
      ) {
        pairs.set(shape.mediaPath, shape.svgPath);
      }
    }
  }
  return pairs;
}

function croppedIds(pres: Presentation): Set<string> {
  const ids = new Set<string>();
  for (const slide of pres.slides) {
    for (const shape of slide.shapes) {
      const key =
        shape.kind === 'picture' ? (shape.svgPath ?? shape.mediaPath) : null;
      const { crop } = shape.kind === 'picture' ? shape : { crop: null };
      if (
        key !== null &&
        crop !== null &&
        Object.values(crop).some((v) => v > 0)
      ) {
        ids.add(key);
      }
    }
  }
  return ids;
}

function withoutFallbacks(refs: Ref[], pairs: Map<string, string>): Ref[] {
  const present = new Set(refs.map((ref) => ref.id));
  return refs.filter((ref) => {
    const svg = pairs.get(ref.id);
    return typeof svg === 'undefined' || !present.has(svg);
  });
}

function parsedSlideRefs(slide: Slide): Ref[] {
  const refs: Ref[] = [];
  for (const shape of slide.shapes) {
    if (shape.kind === 'picture' && shape.source === 'slide') {
      const id = shape.svgPath ?? shape.mediaPath ?? shape.externalUrl;
      if (id !== null) {
        refs.push({ id, external: id === shape.externalUrl });
      }
    }
  }
  return refs;
}

async function slideRefs(
  zip: ZipArchive,
  slide: Slide,
  pairs: Map<string, string>,
): Promise<Ref[]> {
  const rels = await readRelationships(zip, slide.partPath);
  const extra = slide.extraMedia.map((id) => ({ id, external: false }));
  const all = [...parsedSlideRefs(slide), ...extra, ...imageRefs(rels)];
  return withoutFallbacks(all, pairs);
}

class UsageBook {
  readonly usages = new Map<string, Usage>();

  add(ref: Ref, origin: 'slide' | 'layout', slides: number[]): void {
    const existing = this.usages.get(ref.id);
    const usage = existing ?? {
      ref,
      origin,
      firstSlide: origin === 'slide' ? (slides[0] ?? null) : null,
      slides: new Set<number>(),
    };
    slides.forEach((index) => usage.slides.add(index));
    this.usages.set(ref.id, usage);
  }
}

async function masterOf(
  zip: ZipArchive,
  layoutPath: string,
): Promise<string | null> {
  const rels = await readRelationships(zip, layoutPath);
  const rel = Array.from(rels.values()).find((r) =>
    relTypeIs(r, 'slideMaster'),
  );
  return rel ? rel.target : null;
}

async function collectLayoutUsage(
  zip: ZipArchive,
  pres: Presentation,
  pairs: Map<string, string>,
  book: UsageBook,
): Promise<void> {
  const masters = new Map<string, string | null>();
  for (const path of pres.layoutPaths) {
    masters.set(path, await masterOf(zip, path));
  }
  const parts = [...pres.layoutPaths, ...pres.masterPaths];
  for (const part of parts) {
    const slides = pres.slides
      .filter(
        (s) =>
          s.layoutPath === part || masters.get(s.layoutPath ?? '') === part,
      )
      .map((s) => s.index);
    const rels = await readRelationships(zip, part);
    for (const ref of withoutFallbacks(imageRefs(rels), pairs)) {
      book.add(ref, 'layout', slides);
    }
  }
}

async function collectUsage(
  zip: ZipArchive,
  pres: Presentation,
  pairs: Map<string, string>,
): Promise<UsageBook> {
  const book = new UsageBook();
  for (const slide of pres.slides) {
    for (const ref of await slideRefs(zip, slide, pairs)) {
      book.add(ref, 'slide', [slide.index]);
    }
  }
  await collectLayoutUsage(zip, pres, pairs, book);
  return book;
}

interface Measured {
  format: ImageFormat;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  missing: boolean;
}

async function measure(zip: ZipArchive, path: string): Promise<Measured> {
  const entry = zip.entries.get(path);
  if (typeof entry === 'undefined') {
    const format = EXT_FORMATS.get(extensionOf(path)) ?? 'unknown';
    return { format, byteSize: null, width: null, height: null, missing: true };
  }
  const info = readImageSize(await zip.readBytes(path));
  return { ...info, byteSize: entry.size, missing: false };
}

function externalMeasure(url: string): Measured {
  const format =
    EXT_FORMATS.get(extensionOf(url.split(/[?#]/)[0] ?? '')) ?? 'unknown';
  return { format, byteSize: null, width: null, height: null, missing: false };
}

function baseAsset(
  usage: Usage,
  measured: Measured,
  pairs: Map<string, string>,
  cropped: Set<string>,
): ImageAsset {
  const { ref } = usage;
  const fallback = Array.from(pairs).find(([, svg]) => svg === ref.id);
  return {
    id: ref.id,
    archivePath: ref.external ? null : ref.id,
    externalUrl: ref.external ? ref.id : null,
    fallbackPngPath: fallback ? fallback[0] : null,
    ...measured,
    slides: Array.from(usage.slides).sort((a, b) => a - b),
    origin: usage.origin,
    cropped: cropped.has(ref.id),
    fileName: '',
  };
}

async function unusedAssets(
  zip: ZipArchive,
  known: Set<string>,
): Promise<ImageAsset[]> {
  const paths = Array.from(zip.entries.keys())
    .filter((path) => path.startsWith(MEDIA_PREFIX) && !known.has(path))
    .sort();
  const assets: ImageAsset[] = [];
  for (const path of paths) {
    const measured = await measure(zip, path);
    if (measured.format !== 'unknown') {
      assets.push({
        id: path,
        archivePath: path,
        externalUrl: null,
        fallbackPngPath: null,
        ...measured,
        slides: [],
        origin: 'unused',
        cropped: false,
        fileName: '',
      });
    }
  }
  return assets;
}

interface Namer {
  slug: string;
  slidePad: number;
  used: Set<string>;
  perSlide: Map<number, number>;
  layoutCount: number;
  unusedCount: number;
}

function nextFileName(
  namer: Namer,
  asset: ImageAsset,
  first: number | null,
): string {
  if (asset.archivePath === null) {
    return '';
  }
  const ext = extensionOf(asset.archivePath);
  const suffix = ext === '' ? '' : `.${ext}`;
  if (asset.origin === 'slide') {
    const slide = first ?? asset.slides[0] ?? 0;
    const n = (namer.perSlide.get(slide) ?? 0) + 1;
    namer.perSlide.set(slide, n);
    return `${namer.slug}-slajd-${pad(slide, namer.slidePad)}-${pad(n, NARROW_PAD)}${suffix}`;
  }
  if (asset.origin === 'layout') {
    namer.layoutCount += 1;
    return `${namer.slug}-uklad-${pad(namer.layoutCount, NARROW_PAD)}${suffix}`;
  }
  namer.unusedCount += 1;
  return `${namer.slug}-nieuzywany-${pad(namer.unusedCount, NARROW_PAD)}${suffix}`;
}

function nameAll(
  assets: ImageAsset[],
  firsts: Map<string, number | null>,
  namer: Namer,
): ImageAsset[] {
  return assets.map((asset) => {
    const raw = nextFileName(namer, asset, firsts.get(asset.id) ?? null);
    const fileName = raw === '' ? '' : uniqueName(raw, namer.used);
    return { ...asset, fileName };
  });
}

export async function buildImageInventory(
  zip: ZipArchive,
  pres: Presentation,
  deckFileName: string,
): Promise<ImageAsset[]> {
  const pairs = fallbackPairs(pres);
  const cropped = croppedIds(pres);
  const book = await collectUsage(zip, pres, pairs);
  const usages = Array.from(book.usages.values());
  const listed = await Promise.all(
    usages.map(async (usage) => {
      const measured = usage.ref.external
        ? externalMeasure(usage.ref.id)
        : await measure(zip, usage.ref.id);
      return baseAsset(usage, measured, pairs, cropped);
    }),
  );
  const known = new Set(listed.flatMap((a) => [a.id, a.fallbackPngPath ?? '']));
  const unused = await unusedAssets(zip, known);
  const local = listed.filter((a) => a.externalUrl === null);
  const external = listed.filter((a) => a.externalUrl !== null);
  const firsts = new Map(usages.map((u) => [u.ref.id, u.firstSlide]));
  const namer: Namer = {
    slug: deckSlug(deckFileName),
    slidePad: pres.slides.length >= WIDE_DECK ? WIDE_PAD : NARROW_PAD,
    used: new Set(),
    perSlide: new Map(),
    layoutCount: 0,
    unusedCount: 0,
  };
  return nameAll([...local, ...unused, ...external], firsts, namer);
}
