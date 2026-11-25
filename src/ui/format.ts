/* eslint-disable no-magic-numbers -- 1024-based units */
const KILOBYTE = 1024;
const UNITS = ['B', 'KB', 'MB'];

/** Binary size with one decimal above bytes: `512 B`, `2.4 KB`, `2.4 MB`. */
export function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KILOBYTE && unit < UNITS.length - 1) {
    value /= KILOBYTE;
    unit += 1;
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${UNITS[unit]}`;
}
