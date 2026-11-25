import { Download } from 'lucide-react';
import { useState } from 'react';
import { assetBlob, downloadBlob, fallbackPngName } from '../core/export';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { formatSize } from './format';
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
}

const RENDERABLE = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function isSelectable(asset: ImageAsset): boolean {
  return !asset.missing && asset.archivePath !== null;
}

function metaLine(asset: ImageAsset, lang: Lang): string {
  const parts = [asset.format === 'unknown' ? '?' : asset.format.toUpperCase()];
  if (asset.width !== null && asset.height !== null) {
    parts.push(`${asset.width}×${asset.height}`);
  }
  if (asset.byteSize !== null) {
    parts.push(formatSize(asset.byteSize, lang));
  }
  return parts.join(' · ');
}

function Thumb({ deck, asset }: { deck: Deck; asset: ImageAsset }) {
  const [watch, seen] = useInView();
  const renderable = RENDERABLE.has(asset.format) && isSelectable(asset);
  const url = useObjectUrl(deck, asset, 'original', seen && renderable);
  return (
    <div ref={watch} className="tile-thumb">
      {url === null ? (
        <span className="tile-format">{asset.format.toUpperCase()}</span>
      ) : (
        <img className="tile-img" src={url} alt={asset.fileName} />
      )}
    </div>
  );
}

function Badges({ asset, t }: { asset: ImageAsset; t: Translate }) {
  return (
    <p className="tile-badges">
      {asset.cropped && <span className="badge">{t('badgeCropped')}</span>}
      {asset.origin === 'layout' && (
        <span className="badge">{t('badgeLayout')}</span>
      )}
      {asset.missing && <span className="badge">{t('badgeMissing')}</span>}
      {asset.externalUrl !== null && (
        <span className="badge">{t('badgeExternal')}</span>
      )}
    </p>
  );
}

function Chips({
  asset,
  onGoToSlide,
}: {
  asset: ImageAsset;
  onGoToSlide(slide: number): void;
}) {
  const t = useT();
  if (asset.origin !== 'slide') {
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

function Actions({ deck, asset }: { deck: Deck; asset: ImageAsset }) {
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
}: ImageTileProps) {
  const t = useT();
  const { lang } = usePreferences();
  return (
    <li className="tile">
      <Thumb deck={deck} asset={asset} />
      <div className="tile-body">
        <Name asset={asset} selected={selected} onToggle={onToggle} />
        <p className="tile-meta">{metaLine(asset, lang)}</p>
        <Chips asset={asset} onGoToSlide={onGoToSlide} />
        <Badges asset={asset} t={t} />
        {isSelectable(asset) && <Actions deck={deck} asset={asset} />}
      </div>
    </li>
  );
}

export { isSelectable };
