import type { ImageFormat } from '../core/image-size';
import { SORT_KEYS, type FormatFilter, type SortKey } from './arrange';
import { useT, type MessageKey } from './i18n';

const SORT_LABELS: Record<SortKey, MessageKey> = {
  file: 'sortFile',
  bytes: 'sortBytes',
  pixels: 'sortPixels',
};

function isSortKey(value: string): value is SortKey {
  return SORT_KEYS.some((key) => key === value);
}

export interface ImageFiltersProps {
  sort: SortKey;
  onSort(sort: SortKey): void;
  format: FormatFilter;
  formats: ImageFormat[];
  onFormat(format: FormatFilter): void;
}

export function ImageFilters({
  sort,
  onSort,
  format,
  formats,
  onFormat,
}: ImageFiltersProps) {
  const t = useT();
  return (
    <div className="images-filters">
      <label className="images-filter">
        {t('sortLabel')}
        <select
          className="select"
          value={sort}
          onChange={(event) => {
            const { value } = event.target;
            if (isSortKey(value)) {
              onSort(value);
            }
          }}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(SORT_LABELS[key])}
            </option>
          ))}
        </select>
      </label>
      <label className="images-filter">
        {t('formatLabel')}
        <select
          className="select"
          value={format}
          onChange={(event) => {
            const { value } = event.target;
            const match = formats.find((f) => f === value);
            onFormat(match ?? 'all');
          }}
        >
          <option value="all">{t('formatAll')}</option>
          {formats.map((f) => (
            <option key={f} value={f}>
              {f === 'unknown' ? '?' : f.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
