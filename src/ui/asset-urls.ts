import { assetBlob, type AssetVariant } from '../core/export';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';

/**
 * Deck-scoped object URLs: every view asking for the same asset and variant
 * shares one read and one Blob. `dispose` revokes everything handed out.
 */
export class AssetUrlCache {
  private readonly deck: Deck;
  private readonly urls = new Map<string, Promise<string | null>>();
  private readonly created = new Set<string>();
  private generation = Number();

  constructor(deck: Deck) {
    this.deck = deck;
  }

  get(asset: ImageAsset, variant: AssetVariant): Promise<string | null> {
    const key = `${variant}:${asset.id}`;
    const cached = this.urls.get(key);
    if (typeof cached !== 'undefined') {
      return cached;
    }
    const loading = this.load(asset, variant);
    this.urls.set(key, loading);
    return loading;
  }

  dispose(): void {
    this.generation++;
    this.urls.clear();
    this.created.forEach((url) => URL.revokeObjectURL(url));
    this.created.clear();
  }

  private async load(
    asset: ImageAsset,
    variant: AssetVariant,
  ): Promise<string | null> {
    const generation = this.generation;
    try {
      const blob = await assetBlob(this.deck, asset, variant);
      if (generation !== this.generation) {
        return null;
      }
      const url = URL.createObjectURL(blob);
      this.created.add(url);
      return url;
    } catch {
      return null;
    }
  }
}

const caches = new WeakMap<Deck, AssetUrlCache>();

/** The one cache of a deck, created on first use. */
export function urlCacheFor(deck: Deck): AssetUrlCache {
  const existing = caches.get(deck);
  if (typeof existing !== 'undefined') {
    return existing;
  }
  const created = new AssetUrlCache(deck);
  caches.set(deck, created);
  return created;
}
