/* eslint-disable no-magic-numbers -- 0 sums and 0..1 shares */
import type { ImageAsset } from './inventory';

export interface MediaSummary {
  count: number;
  totalBytes: number;
  /** Share of the file taken by images, 0..1. */
  share: number;
  unusedCount: number;
  unusedBytes: number;
  /** Images that carry a GPS position in their EXIF data. */
  located: ImageAsset[];
  largest: ImageAsset[];
}

const LARGEST = 3;

function bytesOf(assets: ImageAsset[]): number {
  return assets.reduce((sum, a) => sum + (a.byteSize ?? 0), 0);
}

/** How much of the file the stored images take, and where the weight sits. */
export function summarizeMedia(
  assets: ImageAsset[],
  fileSize: number,
): MediaSummary {
  const stored = assets.filter((a) => a.byteSize !== null);
  const unused = stored.filter((a) => a.origin === 'unused');
  const totalBytes = bytesOf(stored);
  return {
    count: stored.length,
    totalBytes,
    share: fileSize > 0 ? Math.min(1, totalBytes / fileSize) : 0,
    unusedCount: unused.length,
    unusedBytes: bytesOf(unused),
    located: stored.filter((a) => a.meta.gps !== null),
    largest: [...stored]
      .sort((a, b) => (b.byteSize ?? 0) - (a.byteSize ?? 0))
      .slice(0, LARGEST),
  };
}
