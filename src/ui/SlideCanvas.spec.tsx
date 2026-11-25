// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- EMU fixture geometry */
import { NO_META } from '../core/image-meta';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Deck } from '../core/open-deck';
import type { ImageAsset } from '../core/inventory';
import type { Shape, Slide } from '../core/types';
import { SlideCanvas } from './SlideCanvas';

function asset(id: string, format: ImageAsset['format']): ImageAsset {
  return {
    id,
    archivePath: id,
    externalUrl: null,
    fallbackPngPath: null,
    format,
    byteSize: 4,
    width: 10,
    height: 10,
    slides: [1],
    origin: 'slide',
    cropped: false,
    meta: NO_META,
    missing: false,
    fileName: id.split('/').pop() ?? id,
  };
}

function makeDeck(shapes: Shape[]): { deck: Deck; slide: Slide } {
  const slide: Slide = {
    index: 3,
    partPath: 'ppt/slides/slide3.xml',
    hidden: false,
    showLayoutShapes: true,
    showMasterShapes: true,
    background: { kind: 'color', color: '#FFFFFF' },
    shapes,
    layoutPath: null,
    extraMedia: [],
  };
  const deck: Deck = {
    fileName: 'x.pptx',
    fileSize: 4,
    zip: {
      entries: new Map(),
      has: () => true,
      readBytes: () => Promise.resolve(new Uint8Array([1, 2, 3, 4])),
      readPrefix: () => Promise.resolve(new Uint8Array(0)),
      readText: () => Promise.resolve(''),
    },
    presentation: {
      size: { cx: 12192000, cy: 6858000 },
      slides: [slide],
      layoutPaths: [],
      masterPaths: [],
    },
    assets: [asset('ppt/media/a.png', 'png'), asset('ppt/media/b.emf', 'emf')],
  };
  return { deck, slide };
}

const RECT = { x: 0, y: 0, cx: 800, cy: 500 };

beforeEach(() => {
  document.documentElement.lang = 'en';
});

describe('SlideCanvas', () => {
  it('renders an svg with the slide size as viewBox and a label', () => {
    const { deck, slide } = makeDeck([]);
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 12192000 6858000');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Slide 3');
  });

  it('crops a picture through a nested svg', () => {
    const { deck, slide } = makeDeck([
      {
        kind: 'picture',
        rect: RECT,
        mediaPath: 'ppt/media/a.png',
        svgPath: null,
        externalUrl: null,
        crop: { l: 0.1, t: 0, r: 0.1, b: 0 },
        source: 'slide',
      },
    ]);
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    const nested = container.querySelector('svg svg');
    expect(nested?.getAttribute('x')).toBe('0');
    expect(nested?.getAttribute('y')).toBe('0');
    expect(nested?.getAttribute('width')).toBe('800');
    expect(nested?.getAttribute('height')).toBe('500');
    expect(nested?.getAttribute('overflow')).toBe('hidden');
    const image = nested?.querySelector('image');
    expect(image?.getAttribute('x')).toBe('-100');
    expect(image?.getAttribute('width')).toBe('1000');
    expect(image?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('draws a picture uncropped when the crop leaves nothing', () => {
    const { deck, slide } = makeDeck([
      {
        kind: 'picture',
        rect: RECT,
        mediaPath: 'ppt/media/a.png',
        svgPath: null,
        externalUrl: null,
        crop: { l: 0.6, t: 0, r: 0.5, b: 0 },
        source: 'slide',
      },
    ]);
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    const image = container.querySelector('svg svg image');
    expect(image?.getAttribute('x')).toBe('0');
    expect(image?.getAttribute('width')).toBe('800');
  });

  it('passes a solid background color to the CSS through --slide-bg', () => {
    const { deck, slide } = makeDeck([]);
    slide.background = { kind: 'color', color: '#ABCDEF' };
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    const rect = container.querySelector<SVGRectElement>('.slide-background');
    expect(rect?.style.getPropertyValue('--slide-bg')).toBe('#ABCDEF');
    expect(rect?.hasAttribute('fill')).toBe(false);
  });

  it('labels a picture that cannot be rendered with its format', () => {
    const { deck, slide } = makeDeck([
      {
        kind: 'picture',
        rect: RECT,
        mediaPath: 'ppt/media/b.emf',
        svgPath: null,
        externalUrl: null,
        crop: null,
        source: 'slide',
      },
    ]);
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    expect(container.textContent).toContain('EMF');
    expect(container.querySelector('image')).toBeNull();
  });

  it('renders text paragraphs', () => {
    const { deck, slide } = makeDeck([
      {
        kind: 'text',
        rect: RECT,
        paragraphs: [{ text: 'Hello deck', bold: true, sizePt: 24 }],
      },
    ]);
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    const paragraph = container.querySelector('.slide-text p');
    expect(paragraph?.textContent).toBe('Hello deck');
    expect(paragraph?.classList.contains('slide-bold')).toBe(true);
  });

  it('labels a chart placeholder box in the active language', () => {
    const { deck, slide } = makeDeck([
      { kind: 'placeholder-box', rect: RECT, label: 'chart' },
    ]);
    const { container } = render(
      <SlideCanvas deck={deck} slide={slide} mode="full" />,
    );
    expect(container.textContent).toContain('Chart');
  });
});
