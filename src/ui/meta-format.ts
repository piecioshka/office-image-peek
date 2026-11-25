/* eslint-disable no-magic-numbers -- coordinate precision */
import type { GeoPoint, ImageMeta } from '../core/image-meta';

/** `52.22977, 21.01167`: five decimals is about one metre. */
export function formatCoords(point: GeoPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

/** Camera and capture time joined for a tooltip, or null when neither is known. */
export function exifDetails(meta: ImageMeta): string | null {
  const parts = [meta.camera, meta.taken].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : parts.join(' · ');
}
