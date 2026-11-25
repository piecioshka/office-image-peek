import { zipSync } from 'fflate';
import type { ImageFormat } from './image-size';
import type { ImageAsset } from './inventory';
import type { Deck } from './open-deck';

export type AssetVariant = 'original' | 'fallback-png';

/** The subset of `FileSystemDirectoryHandle` that export needs. */
export interface DirectoryTarget {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{
    createWritable(): Promise<{
      write(data: Uint8Array<ArrayBuffer>): Promise<void>;
      close(): Promise<void>;
      abort?(): Promise<void>;
    }>;
  }>;
}

const MIME: Record<ImageFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  emf: 'image/emf',
  wmf: 'image/wmf',
  unknown: 'application/octet-stream',
};

export function fallbackPngName(asset: ImageAsset): string {
  return `${asset.fileName.replace(/\.[^.]+$/, '')}-zapasowy.png`;
}

export async function readAssetBytes(
  deck: Deck,
  asset: ImageAsset,
  variant: AssetVariant,
): Promise<Uint8Array> {
  const path =
    variant === 'fallback-png' ? asset.fallbackPngPath : asset.archivePath;
  if (path === null) {
    throw new Error(`No archive entry for ${asset.id} (${variant})`);
  }
  return deck.zip.readBytes(path);
}

export async function assetBlob(
  deck: Deck,
  asset: ImageAsset,
  variant: AssetVariant,
): Promise<Blob> {
  const bytes = await readAssetBytes(deck, asset, variant);
  const type = variant === 'fallback-png' ? 'image/png' : MIME[asset.format];
  return new Blob([bytes.slice()], { type });
}

function exportable(assets: ImageAsset[]): ImageAsset[] {
  return assets.filter((a) => !a.missing && a.archivePath !== null);
}

export async function exportAsZip(
  deck: Deck,
  assets: ImageAsset[],
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const asset of exportable(assets)) {
    files[asset.fileName] = await readAssetBytes(deck, asset, 'original');
  }
  return new Blob([zipSync(files, { level: 0 }).slice()], {
    type: 'application/zip',
  });
}

export async function exportToDirectory(
  deck: Deck,
  assets: ImageAsset[],
  dir: DirectoryTarget,
  onProgress?: (done: number, total: number) => void,
): Promise<{ written: number; skipped: number }> {
  const list = exportable(assets);
  let written = 0;
  for (const asset of list) {
    const bytes = await readAssetBytes(deck, asset, 'original');
    const handle = await dir.getFileHandle(asset.fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes.slice());
      await writable.close();
    } catch (error) {
      await writable.abort?.();
      throw error;
    }
    written++;
    onProgress?.(written, list.length);
  }
  return { written, skipped: assets.length - list.length };
}

const REVOKE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function supportsDirectoryExport(): boolean {
  return 'showDirectoryPicker' in window;
}
