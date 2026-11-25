import { useCallback, useState } from 'react';
import {
  downloadBlob,
  exportAsZip,
  exportToDirectory,
  supportsDirectoryExport,
} from '../core/export';
import { deckSlug, type ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { useT } from './i18n';

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
  zipName: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  if (supportsDirectoryExport() && window.showDirectoryPicker) {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await exportToDirectory(deck, assets, dir, onProgress);
    return;
  }
  const zip = await exportAsZip(deck, assets, onProgress);
  downloadBlob(zip, zipName);
}

/** Saves assets to a picked folder, or as a ZIP where folders are unavailable. */
export function useDownload(deck: Deck) {
  const t = useT();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useCallback(
    async (assets: ImageAsset[]) => {
      setFailed(false);
      setProgress({ done: 0, total: assets.length });
      try {
        const zipName = t('zipName', { deck: deckSlug(deck.fileName) });
        await save(deck, assets, zipName, (done, total) =>
          setProgress({ done, total }),
        );
      } catch (error) {
        setFailed(!isAbort(error));
      } finally {
        setProgress(null);
      }
    },
    [deck, t],
  );
  return { progress, failed, run };
}
