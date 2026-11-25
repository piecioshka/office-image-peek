import { buildImageInventory, type ImageAsset } from './inventory';
import {
  buildOfficeInventory,
  officeLayout,
  type DocumentKind,
  type Place,
} from './office-inventory';
import { readRelationships } from './opc';
import { parsePresentation } from './parse-presentation';
import type { Presentation } from './types';
import { PptxError } from './xml';
import { openZip, type ZipArchive } from './zip/zip-reader';

export interface Deck {
  kind: DocumentKind;
  fileName: string;
  /** Size of the opened file in bytes. */
  fileSize: number;
  zip: ZipArchive;
  /** Slides of a presentation; empty for Word and Excel files. */
  presentation: Presentation;
  /** Sheets of a workbook; empty otherwise. */
  places: Place[];
  assets: ImageAsset[];
}

const NO_SLIDES: Presentation = {
  size: { cx: 0, cy: 0 },
  slides: [],
  layoutPaths: [],
  masterPaths: [],
};

async function mainPart(
  zip: ZipArchive,
): Promise<{ kind: DocumentKind; path: string }> {
  const rels = await readRelationships(zip, '');
  const main = Array.from(rels.values()).find(
    (rel) => rel.type.endsWith('/officeDocument') && !rel.external,
  );
  const path = main?.target ?? 'ppt/presentation.xml';
  if (path.startsWith('word/')) {
    return { kind: 'docx', path };
  }
  return path.startsWith('xl/')
    ? { kind: 'xlsx', path }
    : { kind: 'pptx', path };
}

/** Opens a presentation, document or workbook lazily; errors propagate. */
export async function openDeck(file: File): Promise<Deck> {
  const zip = await openZip(file);
  const base = { fileName: file.name, fileSize: file.size, zip };
  const main = await mainPart(zip);
  if (main.kind === 'pptx') {
    const presentation = await parsePresentation(zip);
    const assets = await buildImageInventory(zip, presentation, file.name);
    return { ...base, kind: 'pptx', presentation, places: [], assets };
  }
  if (!zip.has(main.path)) {
    throw new PptxError('no-presentation', 'Main document part is missing');
  }
  const layout = await officeLayout(zip, main.kind, main.path);
  const assets = await buildOfficeInventory(zip, layout, file.name);
  return {
    ...base,
    kind: main.kind,
    presentation: NO_SLIDES,
    places: layout.places,
    assets,
  };
}
