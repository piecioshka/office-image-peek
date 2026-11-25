import { useCallback, useState } from 'react';
import {
  downloadBlob,
  exportAsZip,
  exportToDirectory,
  supportsDirectoryExport,
} from '../core/export';
import { deckSlug, type ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';

export interface Progress {
  done: number;
  total: number;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function save(
  deck: Deck,
  assets: ImageAsset[],
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  if (supportsDirectoryExport() && window.showDirectoryPicker) {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await exportToDirectory(deck, assets, dir, onProgress);
    return;
  }
  const zip = await exportAsZip(deck, assets, onProgress);
  downloadBlob(zip, `${deckSlug(deck.fileName)}-obrazki.zip`);
}

/** Saves assets to a picked folder, or as a ZIP where folders are unavailable. */
export function useDownload(deck: Deck) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useCallback(
    async (assets: ImageAsset[]) => {
      setFailed(false);
      setProgress({ done: 0, total: assets.length });
      try {
        await save(deck, assets, (done, total) => setProgress({ done, total }));
      } catch (error) {
        setFailed(!isAbort(error));
      } finally {
        setProgress(null);
      }
    },
    [deck],
  );
  return { progress, failed, run };
}
