// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture data */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildPptx,
  tinyJpeg,
  tinyPng,
  type FixtureDeck,
} from '../../test/fixtures/build-pptx';
import {
  assetBlob,
  exportAsZip,
  exportToDirectory,
  fallbackPngName,
  readAssetBytes,
  type DirectoryTarget,
} from './export';
import type { ImageAsset } from './inventory';
import { openDeck } from './open-deck';

const PNG = tinyPng(4, 3, 1);
const JPEG = tinyJpeg(10, 20);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150"></svg>',
);
const R = { x: 0, y: 0, cx: 100, cy: 100 };

const FIXTURE: FixtureDeck = {
  media: {
    'a.png': PNG,
    'b.jpeg': JPEG,
    'c.svg': SVG,
    'c.png': tinyPng(2, 2, 5),
  },
  slides: [
    {
      shapes: [
        { kind: 'picture', media: 'a.png', xfrm: R },
        { kind: 'picture', media: 'b.jpeg', xfrm: R },
        { kind: 'picture', media: 'c.png', xfrm: R, svgMedia: 'c.svg' },
        { kind: 'picture', media: 'gone.png', xfrm: R },
      ],
    },
  ],
};

async function sha(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Compression method (offset 10) of the first central directory record. */
function firstCentralMethod(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const central = bytes.findIndex(
    (_, i) => view.getUint32(i, true) === 0x02014b50,
  );
  return view.getUint16(central + 10, true);
}

async function expectJpegAndSvg(
  assets: ImageAsset[],
  out: Record<string, Uint8Array>,
): Promise<void> {
  const png = assets.find((a) => a.id === 'ppt/media/a.png');
  const pngEntry = png ? out[png.fileName] : null;
  expect(pngEntry && (await sha(pngEntry))).toBe(await sha(PNG));
  const jpeg = assets.find((a) => a.id === 'ppt/media/b.jpeg');
  const svg = assets.find((a) => a.format === 'svg');
  const jpegEntry = jpeg ? out[jpeg.fileName] : null;
  const svgEntry = svg ? out[svg.fileName] : null;
  expect(jpegEntry && (await sha(jpegEntry))).toBe(await sha(JPEG));
  expect(svgEntry && (await sha(svgEntry))).toBe(await sha(SVG));
}

async function deck() {
  const file = new File([buildPptx(FIXTURE).slice()], 'Demo.pptx');
  return openDeck(file);
}

function fakeDirectory(): {
  dir: DirectoryTarget;
  files: Map<string, Uint8Array[]>;
} {
  const files = new Map<string, Uint8Array[]>();
  const dir: DirectoryTarget = {
    getFileHandle: async (name) => ({
      createWritable: async () => {
        const chunks: Uint8Array[] = [];
        files.set(name, chunks);
        return {
          write: async (data) => {
            chunks.push(data);
          },
          close: async () => {
            files.set(name, chunks);
          },
        };
      },
    }),
  };
  return { dir, files };
}

describe('export', () => {
  it('exported bytes have the same SHA-256 as the archive entry', async () => {
    const d = await deck();
    const png = d.assets.find((a) => a.id === 'ppt/media/a.png');
    const jpeg = d.assets.find((a) => a.id === 'ppt/media/b.jpeg');
    expect(png && jpeg).toBeTruthy();
    if (!png || !jpeg) {
      return;
    }
    expect(await sha(await readAssetBytes(d, png, 'original'))).toBe(
      await sha(PNG),
    );
    expect(await sha(await readAssetBytes(d, jpeg, 'original'))).toBe(
      await sha(JPEG),
    );
    expect((await assetBlob(d, jpeg, 'original')).type).toBe('image/jpeg');
  });

  it('zip export stores entries uncompressed and byte-exact', async () => {
    const d = await deck();
    const blob = await exportAsZip(d, d.assets);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const out = unzipSync(bytes);
    expect(Object.keys(out)).toHaveLength(3);
    await expectJpegAndSvg(d.assets, out);
    expect(firstCentralMethod(bytes)).toBe(0);
  });

  it('zip export reports progress after each asset', async () => {
    const d = await deck();
    const progress: [number, number][] = [];
    await exportAsZip(d, d.assets, (done, total) =>
      progress.push([done, total]),
    );
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('directory export writes every non-missing asset', async () => {
    const d = await deck();
    const { dir, files } = fakeDirectory();
    const progress: [number, number][] = [];
    const result = await exportToDirectory(d, d.assets, dir, (done, total) =>
      progress.push([done, total]),
    );
    expect(result).toEqual({ written: 3, skipped: 1 });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    const png = d.assets.find((a) => a.id === 'ppt/media/a.png');
    const chunks = png ? files.get(png.fileName) : null;
    expect(chunks).toBeTruthy();
    if (!chunks) {
      return;
    }
    expect(await sha(chunks[0] ?? new Uint8Array())).toBe(await sha(PNG));
  });

  it('aborts the writable and rejects when a write fails', async () => {
    const d = await deck();
    let aborted = 0;
    const dir: DirectoryTarget = {
      getFileHandle: async () => ({
        createWritable: async () => ({
          write: async () => {
            throw new Error('disk full');
          },
          close: async () => {},
          abort: async () => {
            aborted++;
          },
        }),
      }),
    };
    await expect(exportToDirectory(d, d.assets, dir)).rejects.toThrow(
      'disk full',
    );
    expect(aborted).toBe(1);
  });

  it('fallback png export uses the png bytes', async () => {
    const d = await deck();
    const svg = d.assets.find((a) => a.format === 'svg');
    expect(svg).toBeTruthy();
    if (!svg) {
      return;
    }
    expect(fallbackPngName(svg)).toBe(
      svg.fileName.replace(/\.svg$/, '-zapasowy.png'),
    );
    const bytes = await readAssetBytes(d, svg, 'fallback-png');
    expect(await sha(bytes)).toBe(await sha(tinyPng(2, 2, 5)));
    expect((await assetBlob(d, svg, 'fallback-png')).type).toBe('image/png');
    expect((await assetBlob(d, svg, 'original')).type).toBe('image/svg+xml');
  });
});
