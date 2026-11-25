/* eslint-disable no-magic-numbers -- 0/1 defaults and counters */
import {
  analyzePart,
  deckSlug,
  externalMeasure,
  extensionOf,
  measure,
  NARROW_PAD,
  pad,
  uniqueName,
  unusedAssets,
  withoutFallbacks,
  type ImageAsset,
  type PartInfo,
  type Ref,
} from './inventory';
import { readRelationships, type Relationship } from './opc';
import { NS, attr, parseXml } from './xml';
import type { ZipArchive } from './zip/zip-reader';

export type DocumentKind = 'pptx' | 'docx' | 'xlsx';

/** A named place pictures belong to: a sheet of a workbook. */
export interface Place {
  index: number;
  name: string;
}

interface Source {
  path: string;
  origin: 'slide' | 'layout';
  /** Sheet number, or null for the document body and in-cell pictures. */
  place: number | null;
}

export interface OfficeLayout {
  kind: 'docx' | 'xlsx';
  mediaPrefix: string;
  sources: Source[];
  places: Place[];
}

const RICH_VALUE_RELS = 'xl/richData/richValueRel.xml';
const BODY_PARTS = new Set(['footnotes', 'endnotes', 'comments']);
const HEADER_PARTS = new Set(['header', 'footer']);

function relKind(rel: Relationship): string {
  return rel.type.slice(rel.type.lastIndexOf('/') + 1);
}

function internal(rels: Map<string, Relationship>): Relationship[] {
  return Array.from(rels.values()).filter((rel) => !rel.external);
}

async function wordLayout(
  zip: ZipArchive,
  main: string,
): Promise<OfficeLayout> {
  const sources: Source[] = [{ path: main, origin: 'slide', place: null }];
  for (const rel of internal(await readRelationships(zip, main))) {
    if (BODY_PARTS.has(relKind(rel))) {
      sources.push({ path: rel.target, origin: 'slide', place: null });
    } else if (HEADER_PARTS.has(relKind(rel))) {
      sources.push({ path: rel.target, origin: 'layout', place: null });
    }
  }
  return { kind: 'docx', mediaPrefix: 'word/media/', sources, places: [] };
}

async function sheetSources(
  zip: ZipArchive,
  sheet: string,
  place: number,
): Promise<Source[]> {
  const sources: Source[] = [];
  const rels = internal(await readRelationships(zip, sheet));
  // A sheet background picture hangs off the sheet itself.
  if (rels.some((rel) => relKind(rel) === 'image')) {
    sources.push({ path: sheet, origin: 'slide', place });
  }
  for (const rel of rels) {
    if (relKind(rel) === 'drawing') {
      sources.push({ path: rel.target, origin: 'slide', place });
    } else if (relKind(rel) === 'vmlDrawing') {
      sources.push({ path: rel.target, origin: 'layout', place });
    }
  }
  return sources;
}

async function excelLayout(
  zip: ZipArchive,
  main: string,
): Promise<OfficeLayout> {
  const rels = await readRelationships(zip, main);
  const doc = parseXml(await zip.readText(main));
  const sheets = Array.from(doc.getElementsByTagName('*')).filter(
    (el) => el.localName === 'sheet',
  );
  const places: Place[] = [];
  const sources: Source[] = [];
  for (const [i, el] of sheets.entries()) {
    const target = rels.get(attr(el, 'id', NS.r) ?? '')?.target;
    places.push({ index: i + 1, name: attr(el, 'name') ?? `${i + 1}` });
    if (typeof target === 'string') {
      sources.push(...(await sheetSources(zip, target, i + 1)));
    }
  }
  if (zip.has(RICH_VALUE_RELS)) {
    sources.push({ path: RICH_VALUE_RELS, origin: 'slide', place: null });
  }
  return { kind: 'xlsx', mediaPrefix: 'xl/media/', sources, places };
}

/** Finds where a Word document or Excel workbook keeps its pictures. */
export function officeLayout(
  zip: ZipArchive,
  kind: 'docx' | 'xlsx',
  main: string,
): Promise<OfficeLayout> {
  return kind === 'docx' ? wordLayout(zip, main) : excelLayout(zip, main);
}

/** Relationship ids in the order the part's XML first mentions them. */
async function mentionOrder(zip: ZipArchive, path: string): Promise<string[]> {
  if (!zip.has(path)) {
    return [];
  }
  const doc = parseXml(await zip.readText(path));
  const order = new Set<string>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    for (const a of Array.from(el.attributes)) {
      // DrawingML uses r:embed/r:id/r:link; VML header images use o:relid.
      if (a.namespaceURI === NS.r || a.localName === 'relid') {
        order.add(a.value);
      }
    }
  }
  return Array.from(order);
}

async function orderedRefs(
  zip: ZipArchive,
  path: string,
  info: PartInfo,
): Promise<Ref[]> {
  const images = Array.from(info.rels.values()).filter(
    (rel) => relKind(rel) === 'image',
  );
  const position = new Map(
    (await mentionOrder(zip, path)).map((id, i) => [id, i]),
  );
  const rank = (rel: Relationship) => position.get(rel.id) ?? images.length;
  const refs = [...images]
    .sort((a, b) => rank(a) - rank(b))
    .map((rel) => ({ id: rel.target, external: rel.external }));
  return withoutFallbacks(refs, info.pairs);
}

interface Usage {
  ref: Ref;
  origin: 'slide' | 'layout';
  places: Set<number>;
}

interface Collected {
  usages: Map<string, Usage>;
  fallbackOf: Map<string, string>;
  cropped: Set<string>;
}

function record(collected: Collected, ref: Ref, source: Source): void {
  const usage = collected.usages.get(ref.id) ?? {
    ref,
    origin: source.origin,
    places: new Set<number>(),
  };
  if (source.origin === 'slide') {
    usage.origin = 'slide';
  }
  if (source.place !== null) {
    usage.places.add(source.place);
  }
  collected.usages.set(ref.id, usage);
}

async function collect(
  zip: ZipArchive,
  layout: OfficeLayout,
): Promise<Collected> {
  const collected: Collected = {
    usages: new Map(),
    fallbackOf: new Map(),
    cropped: new Set(),
  };
  for (const source of layout.sources) {
    const info = await analyzePart(zip, source.path);
    info.cropped.forEach((id) => collected.cropped.add(id));
    for (const [png, svgs] of info.pairs) {
      svgs.forEach((svg) => collected.fallbackOf.set(svg, png));
    }
    for (const ref of await orderedRefs(zip, source.path, info)) {
      record(collected, ref, source);
    }
  }
  return collected;
}

async function toAsset(
  zip: ZipArchive,
  usage: Usage,
  collected: Collected,
): Promise<ImageAsset> {
  const { ref } = usage;
  const measured = ref.external
    ? externalMeasure(ref.id)
    : await measure(zip, ref.id);
  return {
    id: ref.id,
    archivePath: ref.external ? null : ref.id,
    externalUrl: ref.external ? ref.id : null,
    fallbackPngPath: collected.fallbackOf.get(ref.id) ?? null,
    ...measured,
    slides: Array.from(usage.places).sort((a, b) => a - b),
    origin: usage.origin,
    cropped: collected.cropped.has(ref.id),
    fileName: '',
  };
}

/** Export-name stem per group, with sheet numbers for workbook drawings. */
function stemOf(asset: ImageAsset, kind: 'docx' | 'xlsx'): string {
  if (asset.origin === 'unused') {
    return 'nieuzywany';
  }
  if (asset.origin === 'layout') {
    return 'naglowek';
  }
  if (kind === 'docx') {
    return 'obraz';
  }
  const sheet = asset.slides[0];
  return typeof sheet === 'number'
    ? `arkusz-${pad(sheet, NARROW_PAD)}`
    : 'komorka';
}

function nameAll(
  assets: ImageAsset[],
  kind: 'docx' | 'xlsx',
  fileName: string,
): ImageAsset[] {
  const slug = deckSlug(fileName);
  const counters = new Map<string, number>();
  const used = new Set<string>();
  return assets.map((asset) => {
    if (asset.archivePath === null) {
      return asset;
    }
    const stem = stemOf(asset, kind);
    const n = (counters.get(stem) ?? 0) + 1;
    counters.set(stem, n);
    const ext = extensionOf(asset.archivePath);
    const raw = `${slug}-${stem}-${pad(n, NARROW_PAD)}${ext === '' ? '' : `.${ext}`}`;
    return { ...asset, fileName: uniqueName(raw, used) };
  });
}

/** The image inventory of a Word document or Excel workbook. */
export async function buildOfficeInventory(
  zip: ZipArchive,
  layout: OfficeLayout,
  fileName: string,
): Promise<ImageAsset[]> {
  const collected = await collect(zip, layout);
  const listed: ImageAsset[] = [];
  for (const usage of collected.usages.values()) {
    listed.push(await toAsset(zip, usage, collected));
  }
  const known = new Set(listed.flatMap((a) => [a.id, a.fallbackPngPath ?? '']));
  const unused = await unusedAssets(zip, known, layout.mediaPrefix);
  const local = listed.filter((a) => a.externalUrl === null);
  const external = listed.filter((a) => a.externalUrl !== null);
  const bySheet = (a: ImageAsset) => a.slides[0] ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...local].sort((a, b) => bySheet(a) - bySheet(b));
  return nameAll([...ordered, ...unused, ...external], layout.kind, fileName);
}
