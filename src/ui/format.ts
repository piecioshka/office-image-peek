/* eslint-disable no-magic-numbers -- 1024-based units */
import type { Lang } from './preferences';

const KILOBYTE = 1024;
const UNITS = ['B', 'KB', 'MB'];

/** Binary size with one decimal above bytes: `2.4 MB`, decimal comma in Polish. */
export function formatSize(bytes: number, lang: Lang = 'en'): string {
  let value = bytes;
  let unit = 0;
  while (value >= KILOBYTE && unit < UNITS.length - 1) {
    value /= KILOBYTE;
    unit += 1;
  }
  if (unit === 0) {
    return `${bytes} B`;
  }
  const number = value.toFixed(1);
  return `${lang === 'pl' ? number.replace('.', ',') : number} ${UNITS[unit]}`;
}
