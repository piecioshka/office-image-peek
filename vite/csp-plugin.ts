/* eslint-disable no-magic-numbers -- regex group index */
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

const CHARSET_META = /<meta charset[^>]*>/;
const BOOT_SCRIPT = /<script>([\s\S]*?)<\/script>/;

function buildCsp(bootHash: string): string {
  return [
    "default-src 'self'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "style-src 'self'",
    `script-src 'self' 'sha256-${bootHash}'`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** Production only: injects the CSP meta with the hash of the inline boot script. */
export function cspPlugin(): Plugin {
  return {
    name: 'pptx-peek-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const match = BOOT_SCRIPT.exec(html);
        if (!match?.[1]) {
          throw new Error('Inline boot script not found in index.html');
        }
        const hash = createHash('sha256').update(match[1]).digest('base64');
        const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(hash)}" />`;
        return html.replace(
          CHARSET_META,
          (charset) => `${charset}\n    ${meta}`,
        );
      },
    },
  };
}
