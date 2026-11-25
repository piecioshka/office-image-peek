/* eslint-disable no-magic-numbers -- hash length */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const VERSION_LINE = "const VERSION = 'dev';";
const PRECACHE_LINE = 'const PRECACHE = [];';
const VERSION_LENGTH = 12;

/** Production only: writes `sw.js` with the hashed asset names to precache. */
export function swPlugin(): Plugin {
  const emitted: { name: string; content: string | Uint8Array }[] = [];
  let publicDir = '';
  let outDir = '';
  return {
    name: 'office-image-peek-sw',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
      outDir = join(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      for (const [name, item] of Object.entries(bundle)) {
        emitted.push({
          name,
          content: item.type === 'chunk' ? item.code : item.source,
        });
      }
    },
    closeBundle() {
      const statics = readdirSync(publicDir).filter((name) => name !== 'sw.js');
      const files = [...emitted.map((item) => item.name), ...statics].sort();
      const hash = createHash('sha256');
      for (const item of emitted) {
        hash.update(item.name).update(item.content);
      }
      const version = hash.digest('hex').slice(0, VERSION_LENGTH);
      const template = readFileSync(join(publicDir, 'sw.js'), 'utf8');
      if (
        !template.includes(VERSION_LINE) ||
        !template.includes(PRECACHE_LINE)
      ) {
        throw new Error('public/sw.js placeholders not found');
      }
      const precache = ['./', ...files];
      const output = template
        .replace(VERSION_LINE, `const VERSION = '${version}';`)
        .replace(
          PRECACHE_LINE,
          `const PRECACHE = ${JSON.stringify(precache)};`,
        );
      writeFileSync(join(outDir, 'sw.js'), output);
    },
  };
}
