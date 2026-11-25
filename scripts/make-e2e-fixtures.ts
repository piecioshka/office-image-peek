/* eslint-disable no-magic-numbers -- fixture geometry in EMU */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildPptx, tinyPng } from '../test/fixtures/build-pptx.ts';

// A real 64x48 JPEG (magick -size 64x48 xc:#3366cc -quality 90 jpg:-).
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAwAEADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAcI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Al7UCSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//Z';

const SIZE = { cx: 12192000, cy: 6858000 };
const FRAME = { x: 914400, y: 1371600, cx: 4572000, cy: 3429000 };
const FRAME_RIGHT = { ...FRAME, x: 6705600 };
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#c0504d"/></svg>',
);

const media: Record<string, Uint8Array> = {
  'logo.png': tinyPng(32, 32, 1),
  'photo.png': tinyPng(64, 48, 2),
  'cropped.png': tinyPng(64, 48, 3),
  'photo.jpg': Uint8Array.from(Buffer.from(JPEG_BASE64, 'base64')),
  'vector.png': tinyPng(64, 48, 4),
  'vector.svg': SVG,
  'chart-bg.png': tinyPng(64, 48, 5),
  'unused.png': tinyPng(16, 16, 6),
};

const deck = buildPptx({
  slideSize: SIZE,
  media,
  layouts: [
    {
      placeholders: [
        {
          type: 'title',
          xfrm: { x: 914400, y: 274638, cx: 10363200, cy: 914400 },
        },
      ],
      logoMedia: 'logo.png',
      logoXfrm: { x: 11277600, y: 228600, cx: 457200, cy: 457200 },
    },
  ],
  slides: [
    {
      shapes: [
        {
          kind: 'text',
          text: ['PPTX Peek demo'],
          placeholder: { type: 'title' },
        },
        {
          kind: 'text',
          text: ['Embedded images, byte for byte'],
          xfrm: { ...FRAME, cy: 914400 },
          sizePt: 28,
        },
      ],
    },
    {
      shapes: [
        { kind: 'picture', media: 'photo.png', xfrm: FRAME },
        {
          kind: 'picture',
          media: 'cropped.png',
          xfrm: FRAME_RIGHT,
          crop: { l: 0.1, r: 0.1 },
        },
      ],
    },
    {
      background: { color: 'FDF3D7' },
      shapes: [
        { kind: 'picture', media: 'photo.jpg', xfrm: FRAME },
        { kind: 'text', text: ['A real JPEG'], bold: true, xfrm: FRAME_RIGHT },
      ],
    },
    {
      shapes: [
        {
          kind: 'picture',
          media: 'vector.png',
          svgMedia: 'vector.svg',
          xfrm: FRAME,
        },
        { kind: 'chart', xfrm: FRAME_RIGHT, chartMedia: 'chart-bg.png' },
      ],
    },
    {
      hidden: true,
      shapes: [{ kind: 'text', text: ['Hidden slide'], xfrm: FRAME }],
    },
  ],
});

const sources: Record<string, { base64: string; sha256: string }> = {};
for (const [name, bytes] of Object.entries(media)) {
  sources[`ppt/media/${name}`] = {
    base64: Buffer.from(bytes).toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

mkdirSync('e2e/fixtures', { recursive: true });
writeFileSync('e2e/fixtures/demo.pptx', deck);
writeFileSync(
  'e2e/fixtures/demo-sources.json',
  `${JSON.stringify(sources, null, 2)}\n`,
);
