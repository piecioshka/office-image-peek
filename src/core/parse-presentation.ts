/* eslint-disable no-magic-numbers -- 0/1 defaults and index arithmetic */
import { readRelationships, relTypeIs } from './opc';
import {
  createContext,
  loadPart,
  parseSlide,
  type ParseContext,
} from './parse-slide';
import type { Presentation } from './types';
import { NS, PptxError, attr, children, child } from './xml';
import type { ZipArchive } from './zip/zip-reader';

const DEFAULT_MAIN_PART = 'ppt/presentation.xml';
const DEFAULT_SIZE = { cx: 9144000, cy: 6858000 };

async function findMainPart(zip: ZipArchive): Promise<string> {
  const rels = await readRelationships(zip, '');
  const main = Array.from(rels.values()).find(
    (rel) => rel.type.endsWith('/officeDocument') && !rel.external,
  );
  return main ? main.target : DEFAULT_MAIN_PART;
}

function readSize(root: Element): { cx: number; cy: number } {
  const sz = child(root, NS.p, 'sldSz');
  const cx = Number(sz ? attr(sz, 'cx') : Number.NaN);
  const cy = Number(sz ? attr(sz, 'cy') : Number.NaN);
  return Number.isFinite(cx) && Number.isFinite(cy) ? { cx, cy } : DEFAULT_SIZE;
}

function listedIds(
  root: Element,
  listName: string,
  itemName: string,
): string[] {
  const list = child(root, NS.p, listName);
  return (list ? children(list, NS.p, itemName) : [])
    .map((el) => attr(el, 'id', NS.r))
    .filter((id): id is string => typeof id === 'string');
}

async function layoutPathsOf(
  ctx: ParseContext,
  masterPaths: string[],
): Promise<string[]> {
  const masters = await Promise.all(masterPaths.map((p) => loadPart(ctx, p)));
  const paths = masters.flatMap((master) =>
    Array.from(master?.rels.values() ?? [])
      .filter((rel) => relTypeIs(rel, 'slideLayout'))
      .map((rel) => rel.target),
  );
  return Array.from(new Set(paths));
}

export async function parsePresentation(
  zip: ZipArchive,
): Promise<Presentation> {
  const mainPath = await findMainPart(zip);
  const ctx = createContext(zip);
  const main = zip.has(mainPath) ? await loadPart(ctx, mainPath) : null;
  if (main === null) {
    throw new PptxError('no-presentation', 'Missing presentation part');
  }
  const root = main.doc.documentElement;
  const targets = (ids: string[]) =>
    ids
      .flatMap((id) => main.rels.get(id) ?? [])
      .filter((rel) => !rel.external)
      .map((rel) => rel.target);
  const masterPaths = targets(listedIds(root, 'sldMasterIdLst', 'sldMasterId'));
  const slidePaths = targets(listedIds(root, 'sldIdLst', 'sldId'));
  const slides = await Promise.all(
    slidePaths.map((path, i) => parseSlide(ctx, path, i + 1)),
  );
  const layoutPaths = await layoutPathsOf(ctx, masterPaths);
  return { size: readSize(root), slides, layoutPaths, masterPaths };
}
