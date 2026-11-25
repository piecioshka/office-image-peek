import { useEffect, useState } from 'react';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { urlCacheFor } from './asset-urls';

type Variant = 'original' | 'fallback-png';

function noop(): void {
  // Nothing to clean up.
}

/** The inventory entry for an archive path (assets are keyed by it). */
export function findAsset(deck: Deck, path: string | null): ImageAsset | null {
  if (path === null) {
    return null;
  }
  return deck.assets.find((asset) => asset.id === path) ?? null;
}

/**
 * Lazily resolves an asset to a shared object URL from the deck-scoped cache.
 * Stays `null` while `enabled` is false or the asset is unreadable.
 */
export function useObjectUrl(
  deck: Deck,
  asset: ImageAsset | null,
  variant: Variant,
  enabled: boolean,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (
      !enabled ||
      asset === null ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return noop;
    }
    let cancelled = false;
    urlCacheFor(deck)
      .get(asset, variant)
      .then((resolved) => {
        if (!cancelled) {
          setUrl(resolved);
        }
      });
    return () => {
      cancelled = true;
      setUrl(null);
    };
  }, [deck, asset, variant, enabled]);
  return url;
}

/** Revokes every object URL of the deck when it is replaced or unmounted. */
export function useReleaseUrls(deck: Deck): void {
  useEffect(() => () => urlCacheFor(deck).dispose(), [deck]);
}

/** True once the element has been on screen; eager where observers are missing. */
export function useInView(): [(el: Element | null) => void, boolean] {
  const eager = typeof IntersectionObserver === 'undefined';
  const [seen, setSeen] = useState(false);
  const [element, setElement] = useState<Element | null>(null);
  useEffect(() => {
    if (eager || seen || element === null) {
      return noop;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [eager, seen, element]);
  return [setElement, eager || seen];
}
