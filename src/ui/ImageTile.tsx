/* eslint-disable no-magic-numbers -- empty list checks */
import { Download } from 'lucide-react';
import { useState } from 'react';
import { assetBlob, downloadBlob, fallbackPngName } from '../core/export';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { CopyButton } from './CopyButton';
import { formatSize } from './format';
import { exifDetails, formatCoords } from './meta-format';
import { useT, type Translate } from './i18n';
import { usePreferences, type Lang } from './preferences';
import { useInView, useObjectUrl } from './useObjectUrl';

export interface ImageTileProps {
  deck: Deck;
  asset: ImageAsset;
  selected: boolean;
  /** `range` is true for a Shift-click, which extends the selection from the last tile. */
  onToggle(id: string, range: boolean): void;
  onGoToSlide(slide: number): void;
  onPreview(id: string): void;
}

const RENDERABLE = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function isSelectable(asset: ImageAsset): boolean {
  return !asset.missing && asset.archivePath !== null;
}

export function metaLine(asset: ImageAsset, lang: Lang): string {
  const parts = [asset.format === 'unknown' ? '?' : asset.format.toUpperCase()];
  if (asset.width !== null && asset.height !== null) {
    parts.push(`${asset.width}×${asset.height}`);
  }
  if (asset.byteSize !== null) {
    parts.push(formatSize(asset.byteSize, lang));
  }
  return parts.join(' · ');
}

function Thumb({
  deck,
  asset,
  onPreview,
}: {
  deck: Deck;
  asset: ImageAsset;
  onPreview(id: string): void;
}) {
  const t = useT();
  const [watch, seen] = useInView();
  const renderable = RENDERABLE.has(asset.format) && isSelectable(asset);
  const url = useObjectUrl(deck, asset, 'original', seen && renderable);
  return (
    <div ref={watch} className="tile-thumb">
      {url === null ? (
        <span className="tile-format">{asset.format.toUpperCase()}</span>
      ) : (
        <button
          type="button"
          className="tile-preview"
          aria-label={t('preview', { name: asset.fileName })}
          title={t('preview', { name: asset.fileName })}
          onClick={() => onPreview(asset.id)}
        >
          <img className="tile-img" src={url} alt="" />
        </button>
      )}
    </div>
  );
}

function MetaBadge({ asset, t }: { asset: ImageAsset; t: Translate }) {
  const { gps } = asset.meta;
  if (gps !== null) {
    return (
      <span
        className="badge badge-warning"
        title={t('locationTitle', { coords: formatCoords(gps) })}
      >
        {t('badgeLocation')}
      </span>
    );
  }
  const details = exifDetails(asset.meta);
  return details === null ? null : (
    <span className="badge" title={t('exifTitle', { details })}>
      EXIF
    </span>
  );
}

function Badges({
  deck,
  asset,
  t,
}: {
  deck: Deck;
  asset: ImageAsset;
  t: Translate;
}) {
  return (
    <p className="tile-badges">
      <MetaBadge asset={asset} t={t} />
      {asset.cropped && <span className="badge">{t('badgeCropped')}</span>}
      {asset.origin === 'layout' && deck.kind === 'pptx' && (
        <span className="badge">{t('badgeLayout')}</span>
      )}
      {asset.missing && <span className="badge">{t('badgeMissing')}</span>}
      {asset.externalUrl !== null && (
        <span className="badge">{t('badgeExternal')}</span>
      )}
    </p>
  );
}

function SheetChips({ deck, asset }: { deck: Deck; asset: ImageAsset }) {
  const t = useT();
  const names = asset.slides.map(
    (n) => deck.places.find((p) => p.index === n)?.name ?? String(n),
  );
  if (names.length === 0) {
    return asset.origin === 'slide' ? (
      <p className="tile-chips">
        <span className="chip chip-static">{t('inCells')}</span>
      </p>
    ) : null;
  }
  return (
    <p className="tile-chips">
      {names.map((name) => (
        <span
          key={name}
          className="chip chip-static"
          title={t('onSheet', { name })}
        >
          {name}
        </span>
      ))}
    </p>
  );
}

function Chips({
  deck,
  asset,
  onGoToSlide,
}: {
  deck: Deck;
  asset: ImageAsset;
  onGoToSlide(slide: number): void;
}) {
  const t = useT();
  if (deck.kind === 'xlsx' && asset.origin !== 'unused') {
    return <SheetChips deck={deck} asset={asset} />;
  }
  if (deck.kind !== 'pptx' || asset.origin !== 'slide') {
    return null;
  }
  return (
    <p className="tile-chips">
      {asset.slides.map((slide) => (
        <button
          key={slide}
          type="button"
          className="chip"
          title={t('goToSlide', { n: slide })}
          onClick={() => onGoToSlide(slide)}
        >
          {slide}
        </button>
      ))}
    </p>
  );
}

export function ImageActions({
  deck,
  asset,
}: {
  deck: Deck;
  asset: ImageAsset;
}) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const save = (variant: 'original' | 'fallback-png') => {
    const name =
      variant === 'original' ? asset.fileName : fallbackPngName(asset);
    setFailed(false);
    assetBlob(deck, asset, variant).then(
      (blob) => downloadBlob(blob, name),
      () => setFailed(true),
    );
  };
  const label = t('download', { name: asset.fileName });
  return (
    <div className="tile-actions">
      <button
        type="button"
        className="button icon-button"
        aria-label={label}
        title={label}
        onClick={() => save('original')}
      >
        <Download size={16} aria-hidden="true" />
      </button>
      <CopyButton deck={deck} asset={asset} />
      {asset.fallbackPngPath !== null && (
        <button
          type="button"
          className="button"
          aria-label={t('downloadFallbackLabel', { name: asset.fileName })}
          onClick={() => save('fallback-png')}
        >
          {t('downloadFallback')}
        </button>
      )}
      {failed && (
        <p className="tile-error" role="alert">
          {t('saveError')}
        </p>
      )}
    </div>
  );
}

function Name({
  asset,
  selected,
  onToggle,
}: Pick<ImageTileProps, 'asset' | 'selected' | 'onToggle'>) {
  const text = asset.externalUrl ?? asset.fileName;
  if (!isSelectable(asset)) {
    return (
      <span className="tile-name" title={text}>
        {text}
      </span>
    );
  }
  return (
    <label className="tile-check">
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => {
          const native = event.nativeEvent;
          onToggle(asset.id, native instanceof MouseEvent && native.shiftKey);
        }}
      />
      <span className="tile-name" title={asset.fileName}>
        {asset.fileName}
      </span>
    </label>
  );
}

export function ImageTile({
  deck,
  asset,
  selected,
  onToggle,
  onGoToSlide,
  onPreview,
}: ImageTileProps) {
  const t = useT();
  const { lang } = usePreferences();
  return (
    <li className="tile">
      <Thumb deck={deck} asset={asset} onPreview={onPreview} />
      <div className="tile-body">
        <Name asset={asset} selected={selected} onToggle={onToggle} />
        <p className="tile-meta">{metaLine(asset, lang)}</p>
        <Chips deck={deck} asset={asset} onGoToSlide={onGoToSlide} />
        <Badges deck={deck} asset={asset} t={t} />
        {isSelectable(asset) && <ImageActions deck={deck} asset={asset} />}
      </div>
    </li>
  );
}

export { isSelectable };
