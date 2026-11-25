import type { ImageFormat } from '../core/image-size';
import type { ImageAsset } from '../core/inventory';

export type SortKey = 'file' | 'bytes' | 'pixels';
export type FormatFilter = ImageFormat | 'all';

export const SORT_KEYS: SortKey[] = ['file', 'bytes', 'pixels'];

function pixels(asset: ImageAsset): number | null {
  return asset.width !== null && asset.height !== null
    ? asset.width * asset.height
    : null;
}

const MEASURE: Record<
  Exclude<SortKey, 'file'>,
  (a: ImageAsset) => number | null
> = {
  bytes: (a) => a.byteSize,
  pixels,
};

/** Largest first; assets without the measure keep their file order at the end. */
function byMeasure(measure: (a: ImageAsset) => number | null) {
  return (a: ImageAsset, b: ImageAsset): number => {
    const left = measure(a);
    const right = measure(b);
    if (left === null || right === null) {
      return Number(left === null) - Number(right === null);
    }
    return right - left;
  };
}

/** Formats present in the deck, in a stable alphabetical order. */
export function formatsOf(assets: ImageAsset[]): ImageFormat[] {
  return Array.from(new Set(assets.map((a) => a.format))).sort();
}

/** Applies the format filter and sort order; the sort is stable. */
export function arrange(
  assets: ImageAsset[],
  sort: SortKey,
  format: FormatFilter,
): ImageAsset[] {
  const kept =
    format === 'all' ? assets : assets.filter((a) => a.format === format);
  return sort === 'file' ? kept : [...kept].sort(byMeasure(MEASURE[sort]));
}
