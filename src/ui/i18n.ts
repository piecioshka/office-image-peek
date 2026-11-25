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
  slidesPlaceholder: 'Slides',
  slideViewPlaceholder: 'Slide preview',
  imagesPlaceholder: 'Images',
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
  slidesPlaceholder: 'Slajdy',
  slideViewPlaceholder: 'Podgląd slajdu',
  imagesPlaceholder: 'Obrazki',
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
