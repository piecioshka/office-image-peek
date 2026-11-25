import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { ImageActions, metaLine } from './ImageTile';
import { useT } from './i18n';
import { usePreferences } from './preferences';
import { useObjectUrl } from './useObjectUrl';

export interface ImagePreviewProps {
  deck: Deck;
  asset: ImageAsset;
  onClose(): void;
}

export function ImagePreview({ deck, asset, onClose }: ImagePreviewProps) {
  const t = useT();
  const { lang } = usePreferences();
  const [actual, setActual] = useState(false);
  const url = useObjectUrl(deck, asset, 'original', true);
  return (
    <div
      className="preview"
      role="group"
      aria-label={t('preview', { name: asset.fileName })}
    >
      <div className="preview-bar">
        <button type="button" className="button" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('backToSlide')}
        </button>
        <p className="preview-title">
          <span className="preview-name" title={asset.fileName}>
            {asset.fileName}
          </span>
          <span className="preview-meta">{metaLine(asset, lang)}</span>
        </p>
        <button
          type="button"
          className="button"
          aria-pressed={actual}
          onClick={() => setActual(!actual)}
        >
          {t('actualSize')}
        </button>
        <ImageActions deck={deck} asset={asset} />
      </div>
      <div
        className={actual ? 'preview-stage preview-actual' : 'preview-stage'}
      >
        {url !== null && (
          <img className="preview-img" src={url} alt={asset.fileName} />
        )}
      </div>
    </div>
  );
}
