/* eslint-disable no-magic-numbers -- 0/1 defaults and index arithmetic */
import { readImageSize, type ImageFormat } from './image-size';
import { readRelationships, relTypeIs, type Relationship } from './opc';
import type { Presentation, Slide } from './types';
import { NS, attr, descendants, parseXml } from './xml';
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

const HEADER_BYTES = 262_144;
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

interface PartInfo {
  rels: Map<string, Relationship>;
  /** Fallback PNG path -> SVG paths it backs, within this part. */
  pairs: Map<string, Set<string>>;
  /** Image ids with a non-zero crop in this part. */
  cropped: Set<string>;
}

interface Analysis {
  infos: Map<string, PartInfo>;
  /** SVG path -> its fallback PNG path, from any part. */
  fallbackOf: Map<string, string>;
  cropped: Set<string>;
}

function targetOf(rels: Map<string, Relationship>, id: string | undefined) {
  const rel = rels.get(id ?? '');
  return rel && !rel.external ? rel.target : null;
}

function isCropped(blip: Element): boolean {
  const src = Array.from(blip.parentElement?.children ?? []).find(
    (el) => el.localName === 'srcRect' && el.namespaceURI === NS.a,
  );
  return (
    typeof src !== 'undefined' &&
    Array.from(src.attributes).some((a) => Number(a.value) > 0)
  );
}

function readBlip(blip: Element, info: PartInfo): void {
  const png = targetOf(info.rels, attr(blip, 'embed', NS.r));
  const svgEl = descendants(blip, NS.asvg, 'svgBlip')[0];
  const svg = svgEl ? targetOf(info.rels, attr(svgEl, 'embed', NS.r)) : null;
  if (svg !== null && png !== null && svg !== png) {
    info.pairs.set(png, (info.pairs.get(png) ?? new Set()).add(svg));
  }
  const id = svg ?? png;
  if (id !== null && isCropped(blip)) {
    info.cropped.add(id);
  }
}

async function analyzePart(zip: ZipArchive, path: string): Promise<PartInfo> {
  const info: PartInfo = {
    rels: await readRelationships(zip, path),
    pairs: new Map(),
    cropped: new Set(),
  };
  if (zip.has(path)) {
    const doc = parseXml(await zip.readText(path));
    for (const blip of descendants(doc.documentElement, NS.a, 'blip')) {
      readBlip(blip, info);
    }
  }
  return info;
}

async function analyze(zip: ZipArchive, pres: Presentation): Promise<Analysis> {
  const paths = [
    ...pres.slides.map((s) => s.partPath),
    ...pres.layoutPaths,
    ...pres.masterPaths,
  ];
  const analysis: Analysis = {
    infos: new Map(),
    fallbackOf: new Map(),
    cropped: new Set(),
  };
  for (const path of paths) {
    const info = await analyzePart(zip, path);
    analysis.infos.set(path, info);
    info.cropped.forEach((id) => analysis.cropped.add(id));
    for (const [png, svgs] of info.pairs) {
      svgs.forEach((svg) => analysis.fallbackOf.set(svg, png));
    }
  }
  return analysis;
}

function withoutFallbacks(refs: Ref[], pairs: Map<string, Set<string>>): Ref[] {
  const present = new Set(refs.map((ref) => ref.id));
  return refs.filter((ref) => {
    const svgs = pairs.get(ref.id);
    return (
      typeof svgs === 'undefined' ||
      !Array.from(svgs).some((svg) => present.has(svg))
    );
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

function slideRefs(slide: Slide, info: PartInfo): Ref[] {
  const extra = slide.extraMedia.map((id) => ({ id, external: false }));
  const all = [...parsedSlideRefs(slide), ...extra, ...imageRefs(info.rels)];
  return withoutFallbacks(all, info.pairs);
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
  analysis: Analysis,
  book: UsageBook,
): Promise<void> {
  const masters = new Map<string, string | null>();
  for (const path of pres.layoutPaths) {
    masters.set(path, await masterOf(zip, path));
  }
  for (const part of [...pres.layoutPaths, ...pres.masterPaths]) {
    const slides = pres.slides
      .filter(
        (s) =>
          s.layoutPath === part || masters.get(s.layoutPath ?? '') === part,
      )
      .map((s) => s.index);
    const info = analysis.infos.get(part);
    const refs = info ? withoutFallbacks(imageRefs(info.rels), info.pairs) : [];
    refs.forEach((ref) => book.add(ref, 'layout', slides));
  }
}

async function collectUsage(
  zip: ZipArchive,
  pres: Presentation,
  analysis: Analysis,
): Promise<UsageBook> {
  const book = new UsageBook();
  for (const slide of pres.slides) {
    const info = analysis.infos.get(slide.partPath);
    const refs = info ? slideRefs(slide, info) : [];
    refs.forEach((ref) => book.add(ref, 'slide', [slide.index]));
  }
  await collectLayoutUsage(zip, pres, analysis, book);
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
  const info = readImageSize(await zip.readPrefix(path, HEADER_BYTES));
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
  analysis: Analysis,
): ImageAsset {
  const { ref } = usage;
  return {
    id: ref.id,
    archivePath: ref.external ? null : ref.id,
    externalUrl: ref.external ? ref.id : null,
    fallbackPngPath: analysis.fallbackOf.get(ref.id) ?? null,
    ...measured,
    slides: Array.from(usage.slides).sort((a, b) => a - b),
    origin: usage.origin,
    cropped: analysis.cropped.has(ref.id),
    fileName: '',
  };
}

async function unusedAssets(
  zip: ZipArchive,
  known: Set<string>,
): Promise<ImageAsset[]> {
  const paths = Array.from(zip.entries.keys())
    .filter((path) => path.startsWith(MEDIA_PREFIX) && !known.has(path))
    .sort(new Intl.Collator('en', { numeric: true }).compare);
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
  const analysis = await analyze(zip, pres);
  const book = await collectUsage(zip, pres, analysis);
  const usages = Array.from(book.usages.values());
  const listed: ImageAsset[] = [];
  for (const usage of usages) {
    const measured = usage.ref.external
      ? externalMeasure(usage.ref.id)
      : await measure(zip, usage.ref.id);
    listed.push(baseAsset(usage, measured, analysis));
  }
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
