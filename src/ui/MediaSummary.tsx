/* eslint-disable no-magic-numbers -- percent conversion */
import { useMemo } from 'react';
import type { Deck } from '../core/open-deck';
import { summarizeMedia } from '../core/summary';
import { formatSize } from './format';
import { useT } from './i18n';
import { usePreferences } from './preferences';

export interface MediaSummaryProps {
  deck: Deck;
  onPreview(id: string): void;
}

export function MediaSummary({ deck, onPreview }: MediaSummaryProps) {
  const t = useT();
  const { lang } = usePreferences();
  const summary = useMemo(
    () => summarizeMedia(deck.assets, deck.fileSize),
    [deck.assets, deck.fileSize],
  );
  if (summary.count === 0) {
    return null;
  }
  const size = (bytes: number) => formatSize(bytes, lang);
  const percent = `${Math.round(summary.share * 100)}%`;
  return (
    <section className="summary" aria-label={t('summary')}>
      <dl className="summary-list">
        <div className="summary-row">
          <dt>{t('summaryImages')}</dt>
          <dd>
            {summary.count} · {size(summary.totalBytes)} ·{' '}
            {t('summaryOfFile', { percent })}
          </dd>
        </div>
        {summary.unusedCount > 0 && (
          <div className="summary-row">
            <dt>{t('summaryUnused')}</dt>
            <dd>
              {summary.unusedCount} · {size(summary.unusedBytes)}
            </dd>
          </div>
        )}
        {summary.located.length > 0 && (
          <div className="summary-row summary-warning">
            <dt>{t('summaryLocated')}</dt>
            <dd>
              <ol className="summary-largest">
                {summary.located.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className="summary-link"
                      title={t('preview', { name: asset.fileName })}
                      onClick={() => onPreview(asset.id)}
                    >
                      {asset.fileName}
                    </button>
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        )}
        <div className="summary-row">
          <dt>{t('summaryLargest')}</dt>
          <dd>
            <ol className="summary-largest">
              {summary.largest.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="summary-link"
                    title={t('preview', { name: asset.fileName })}
                    onClick={() => onPreview(asset.id)}
                  >
                    {asset.fileName}
                  </button>{' '}
                  {size(asset.byteSize ?? 0)}
                </li>
              ))}
            </ol>
          </dd>
        </div>
      </dl>
    </section>
  );
}
