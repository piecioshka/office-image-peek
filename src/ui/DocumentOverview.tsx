/* eslint-disable no-magic-numbers -- empty list check */
import { FileSpreadsheet, FileText } from 'lucide-react';
import type { Deck } from '../core/open-deck';
import { useT } from './i18n';

/** Center column for Word and Excel files, which have no slides to show. */
export function DocumentOverview({ deck }: { deck: Deck }) {
  const t = useT();
  const isWorkbook = deck.kind === 'xlsx';
  const Icon = isWorkbook ? FileSpreadsheet : FileText;
  const countOn = (sheet: number) =>
    deck.assets.filter((a) => a.slides.includes(sheet)).length;
  return (
    <section className="overview" aria-label={t('overview')}>
      <Icon size={40} aria-hidden="true" className="overview-icon" />
      <h2 className="overview-title">
        {t(isWorkbook ? 'kindXlsx' : 'kindDocx')}
      </h2>
      <p className="overview-hint">{t('overviewHint')}</p>
      {isWorkbook && deck.places.length > 0 && (
        <table className="overview-table">
          <thead>
            <tr>
              <th scope="col">{t('sheetColumn')}</th>
              <th scope="col">{t('imagesColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {deck.places.map((place) => (
              <tr key={place.index}>
                <td>{place.name}</td>
                <td>{countOn(place.index)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
