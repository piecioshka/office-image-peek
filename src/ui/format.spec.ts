/* eslint-disable no-magic-numbers -- byte counts */
import { describe, expect, it } from 'vitest';
import { formatSize } from './format';

describe('formatSize', () => {
  it('formats bytes, kilobytes and megabytes in base 1024', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
  });
});
