import { buildImageInventory, type ImageAsset } from './inventory';
import { parsePresentation } from './parse-presentation';
import type { Presentation } from './types';
import { openZip, type ZipArchive } from './zip/zip-reader';

export interface Deck {
  fileName: string;
  zip: ZipArchive;
  presentation: Presentation;
  assets: ImageAsset[];
}

/** Opens a deck lazily; `ZipError` / `PptxError` propagate to the caller. */
export async function openDeck(file: File): Promise<Deck> {
  const zip = await openZip(file);
  const presentation = await parsePresentation(zip);
  const assets = await buildImageInventory(zip, presentation, file.name);
  return { fileName: file.name, zip, presentation, assets };
}
