/* eslint-disable no-magic-numbers -- canvas origin and 1 px minimum */
import { assetBlob } from '../core/export';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';

const DRAWABLE = new Set(['jpeg', 'gif', 'webp', 'bmp', 'svg']);
const PNG = 'image/png';

export type CopyPlan = 'exact' | 'fallback' | 'convert' | null;

/**
 * Clipboards take PNG everywhere; other formats are redrawn as PNG. Browsers
 * re-encode clipboard images on write, so pixels survive but the bytes and
 * metadata (EXIF, GPS) do not: downloads remain the byte-exact path.
 */
export function copyPlan(asset: ImageAsset): CopyPlan {
  if (asset.missing || asset.archivePath === null) {
    return null;
  }
  if (asset.format === 'png') {
    return 'exact';
  }
  if (asset.fallbackPngPath !== null) {
    return 'fallback';
  }
  return DRAWABLE.has(asset.format) ? 'convert' : null;
}

export function canCopyImages(): boolean {
  return (
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  );
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be decoded'));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

async function redrawAsPng(blob: Blob, asset: ImageAsset): Promise<Blob> {
  const img = await loadImage(blob);
  const canvas = document.createElement('canvas');
  // SVGs without intrinsic size fall back to the size read from the file.
  canvas.width = img.naturalWidth || asset.width || 1;
  canvas.height = img.naturalHeight || asset.height || 1;
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error('PNG encoding failed'))),
      PNG,
    );
  });
}

async function pngFor(
  deck: Deck,
  asset: ImageAsset,
  plan: Exclude<CopyPlan, null>,
): Promise<Blob> {
  const variant = plan === 'fallback' ? 'fallback-png' : 'original';
  const blob = await assetBlob(deck, asset, variant);
  return plan === 'convert'
    ? redrawAsPng(blob, asset)
    : new Blob([blob], { type: PNG });
}

/**
 * Starts the clipboard write synchronously with a pending blob, which Safari
 * requires to keep the click's user activation.
 */
export function copyAsset(deck: Deck, asset: ImageAsset): Promise<void> {
  const plan = copyPlan(asset);
  if (plan === null) {
    return Promise.reject(new Error('Image cannot be copied'));
  }
  const item = new ClipboardItem({ [PNG]: pngFor(deck, asset, plan) });
  return navigator.clipboard.write([item]);
}
