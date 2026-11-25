import { useCallback } from 'react';
import { usePreferences, type Lang } from './preferences';

const en = {
  appName: 'PPTX Peek',
  dropText: 'Drop a .pptx file or choose one',
  chooseFile: 'Choose file',
  opening: 'Opening…',
  errorInvalid: 'This is not a valid .pptx file',
  errorEncrypted: 'The file is password-protected or in the old .ppt format',
  shortcuts: 'Keyboard shortcuts',
  switchLanguage: 'Switch language',
  switchTheme: 'Switch theme',
  repository: 'Source code on GitHub',
  close: 'Close',
  shortcutHelp: 'Show this help',
  shortcutNavigate: 'Previous / next slide',
  shortcutEnds: 'First / last slide',
  shortcutOpen: 'Open a file',
  shortcutSelectAll: 'Select all images',
  shortcutDownload: 'Download selected images',
  slides: 'Slides',
  slideView: 'Slide preview',
  slideLabel: 'Slide {n}',
  hiddenSlide: 'hidden',
  boxChart: 'Chart',
  boxTable: 'Table',
  boxDiagram: 'Diagram',
  boxObject: 'Object',
  images: 'Images',
  scopeDeck: 'Whole deck ({n})',
  scopeSlide: 'Current slide ({n})',
  selectAll: 'Select all',
  downloadSelected: 'Download selected ({n})',
  downloading: 'Downloading… {done}/{total}',
  saveError: 'Could not save the images',
  groupSlide: 'From slides',
  groupLayout: 'From layout',
  groupUnused: 'Unused',
  groupExternal: 'External links',
  noImages: 'No images',
  download: 'Download {name}',
  downloadFallback: 'PNG (fallback)',
  downloadFallbackLabel: 'Download PNG fallback of {name}',
  badgeCropped: 'cropped on slide',
  badgeLayout: 'from layout',
  badgeMissing: 'missing from file',
  badgeExternal: 'external',
  goToSlide: 'Go to slide {n}',
  imageScope: 'Image scope',
};

export type MessageKey = keyof typeof en;

const pl: Record<MessageKey, string> = {
  appName: 'PPTX Peek',
  dropText: 'Upuść plik .pptx albo wybierz z dysku',
  chooseFile: 'Wybierz plik',
  opening: 'Otwieranie…',
  errorInvalid: 'To nie jest prawidłowy plik .pptx',
  errorEncrypted: 'Plik jest zaszyfrowany albo w starym formacie .ppt',
  shortcuts: 'Skróty klawiaturowe',
  switchLanguage: 'Zmień język',
  switchTheme: 'Zmień motyw',
  repository: 'Kod źródłowy na GitHubie',
  close: 'Zamknij',
  shortcutHelp: 'Pokaż tę pomoc',
  shortcutNavigate: 'Poprzedni / następny slajd',
  shortcutEnds: 'Pierwszy / ostatni slajd',
  shortcutOpen: 'Otwórz plik',
  shortcutSelectAll: 'Zaznacz wszystkie obrazki',
  shortcutDownload: 'Pobierz zaznaczone obrazki',
  slides: 'Slajdy',
  slideView: 'Podgląd slajdu',
  slideLabel: 'Slajd {n}',
  hiddenSlide: 'ukryty',
  boxChart: 'Wykres',
  boxTable: 'Tabela',
  boxDiagram: 'Diagram',
  boxObject: 'Obiekt',
  images: 'Obrazki',
  scopeDeck: 'Cała prezentacja ({n})',
  scopeSlide: 'Bieżący slajd ({n})',
  selectAll: 'Zaznacz wszystkie',
  downloadSelected: 'Pobierz zaznaczone ({n})',
  downloading: 'Pobieranie… {done}/{total}',
  saveError: 'Nie udało się zapisać obrazków',
  groupSlide: 'Ze slajdów',
  groupLayout: 'Z układu',
  groupUnused: 'Nieużywane',
  groupExternal: 'Linki zewnętrzne',
  noImages: 'Brak obrazków',
  download: 'Pobierz {name}',
  downloadFallback: 'PNG (zapasowy)',
  downloadFallbackLabel: 'Pobierz zapasowy PNG: {name}',
  badgeCropped: 'przycięty na slajdzie',
  badgeLayout: 'z układu',
  badgeMissing: 'brak w pliku',
  badgeExternal: 'zewnętrzny',
  goToSlide: 'Przejdź do slajdu {n}',
  imageScope: 'Zakres obrazków',
};

export const messages: Record<Lang, Record<MessageKey, string>> = { en, pl };

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function translate(
  lang: Lang,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  return messages[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function useT(): Translate {
  const { lang } = usePreferences();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
