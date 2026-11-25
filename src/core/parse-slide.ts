import { readRelationships, relTypeIs, type Relationship } from './opc';
import {
  collectPlaceholderRects,
  parseShapes,
  pick,
  type PartData,
  type PlaceholderRect,
} from './parse-shapes';
import type { Background, Shape, Slide } from './types';
import { NS, attr, parseXml } from './xml';
import type { ZipArchive } from './zip/zip-reader';

export interface ParseContext {
  zip: ZipArchive;
  parts: Map<string, Promise<PartData | null>>;
  placeholders: Map<string, PlaceholderRect[]>;
}

export function createContext(zip: ZipArchive): ParseContext {
  return { zip, parts: new Map(), placeholders: new Map() };
}

async function readPart(
  zip: ZipArchive,
  path: string,
): Promise<PartData | null> {
  if (!zip.has(path)) {
    return null;
  }
  const doc = parseXml(await zip.readText(path));
  return { path, doc, rels: await readRelationships(zip, path) };
}

/** Loads and caches a part; `null` when the archive has no such entry. */
export function loadPart(
  ctx: ParseContext,
  path: string,
): Promise<PartData | null> {
  const cached = ctx.parts.get(path);
  if (typeof cached !== 'undefined') {
    return cached;
  }
  const loaded = readPart(ctx.zip, path);
  ctx.parts.set(path, loaded);
  return loaded;
}

function firstRel(
  part: PartData | null,
  kind: 'slideLayout' | 'slideMaster',
): Relationship | undefined {
  const rels = Array.from(part?.rels.values() ?? []);
  return rels.find((rel) => relTypeIs(rel, kind));
}

function placeholdersOf(
  ctx: ParseContext,
  part: PartData | null,
): PlaceholderRect[] {
  if (part === null) {
    return [];
  }
  const cached = ctx.placeholders.get(part.path);
  if (typeof cached !== 'undefined') {
    return cached;
  }
  const rects = collectPlaceholderRects(part);
  ctx.placeholders.set(part.path, rects);
  return rects;
}

function backgroundOf(part: PartData | null): Background | null {
  const cSld = pick(part?.doc.documentElement, NS.p, 'cSld');
  const bgPr = pick(pick(cSld, NS.p, 'bg'), NS.p, 'bgPr');
  if (typeof pick(cSld, NS.p, 'bg') === 'undefined') {
    return null;
  }
  const rgb = pick(pick(bgPr, NS.a, 'solidFill'), NS.a, 'srgbClr');
  const color = rgb ? attr(rgb, 'val') : null;
  if (typeof color === 'string') {
    return { kind: 'color', color: `#${color.toUpperCase()}` };
  }
  const blip = pick(pick(bgPr, NS.a, 'blipFill'), NS.a, 'blip');
  const embed = blip ? attr(blip, 'embed', NS.r) : null;
  const rel = part?.rels.get(embed ?? '');
  if (rel && !rel.external) {
    return { kind: 'image', mediaPath: rel.target };
  }
  return { kind: 'none' };
}

function inheritedPictures(
  ctx: ParseContext,
  part: PartData | null,
  source: 'layout' | 'master',
): Shape[] {
  return part
    ? parseShapes({ part, source, inherited: [placeholdersOf(ctx, part)] })
    : [];
}

async function mediaOf(ctx: ParseContext, path: string): Promise<string[]> {
  const part = await loadPart(ctx, path);
  const rels = part ? Array.from(part.rels.values()) : [];
  return rels
    .filter((rel) => relTypeIs(rel, 'image') && !rel.external)
    .map((rel) => rel.target);
}

async function extraMediaOf(
  ctx: ParseContext,
  slide: PartData,
): Promise<string[]> {
  const rels = Array.from(slide.rels.values()).filter(
    (rel) =>
      !rel.external &&
      (relTypeIs(rel, 'chart') || relTypeIs(rel, 'diagramDrawing')),
  );
  const lists = await Promise.all(rels.map((rel) => mediaOf(ctx, rel.target)));
  return Array.from(new Set(lists.flat()));
}

function emptySlide(partPath: string, index: number): Slide {
  return {
    index,
    partPath,
    hidden: false,
    showLayoutShapes: true,
    showMasterShapes: true,
    background: { kind: 'none' },
    shapes: [],
    layoutPath: null,
    extraMedia: [],
  };
}

function showsMasterShapes(part: PartData | null): boolean {
  return part?.doc.documentElement.getAttribute('showMasterSp') !== '0';
}

function visibleShapes(
  ctx: ParseContext,
  chain: { layout: PartData | null; master: PartData | null },
  show: { layout: boolean; master: boolean },
): Shape[] {
  return [
    ...(show.master ? inheritedPictures(ctx, chain.master, 'master') : []),
    ...(show.layout ? inheritedPictures(ctx, chain.layout, 'layout') : []),
  ];
}

export async function parseSlide(
  ctx: ParseContext,
  partPath: string,
  index: number,
): Promise<Slide> {
  const part = await loadPart(ctx, partPath);
  if (part === null) {
    return emptySlide(partPath, index);
  }
  const layoutRel = firstRel(part, 'slideLayout');
  const layout = layoutRel ? await loadPart(ctx, layoutRel.target) : null;
  const masterRel = firstRel(layout, 'slideMaster');
  const master = masterRel ? await loadPart(ctx, masterRel.target) : null;
  const inherited = [placeholdersOf(ctx, layout), placeholdersOf(ctx, master)];
  const showLayout = showsMasterShapes(part);
  const showMaster = showLayout && showsMasterShapes(layout);
  return {
    index,
    partPath,
    hidden: part.doc.documentElement.getAttribute('show') === '0',
    showLayoutShapes: showLayout,
    showMasterShapes: showMaster,
    background: backgroundOf(part) ??
      backgroundOf(layout) ??
      backgroundOf(master) ?? { kind: 'none' },
    shapes: [
      ...visibleShapes(
        ctx,
        { layout, master },
        { layout: showLayout, master: showMaster },
      ),
      ...parseShapes({ part, source: 'slide', inherited }),
    ],
    layoutPath: layoutRel ? layoutRel.target : null,
    extraMedia: await extraMediaOf(ctx, part),
  };
}
