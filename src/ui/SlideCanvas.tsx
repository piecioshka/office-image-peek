/* eslint-disable no-magic-numbers -- EMU geometry and font scaling */
import type { Crop, Rect, Shape, Slide } from '../core/types';
import type { Deck } from '../core/open-deck';
import type { ImageAsset } from '../core/inventory';
import { useT, type MessageKey } from './i18n';
import { findAsset, useInView, useObjectUrl } from './useObjectUrl';

type Mode = 'thumbnail' | 'full';

const EMU_PER_PT = 12700;
const TEXT_UNIT = 1000;
const DEFAULT_PT = 18;
const RENDERABLE = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const BOX_KEYS: Record<'chart' | 'table' | 'diagram' | 'object', MessageKey> = {
  chart: 'boxChart',
  table: 'boxTable',
  diagram: 'boxDiagram',
  object: 'boxObject',
};

/** Sets CSS custom properties through CSSOM (allowed by the CSP, unlike style=""). */
function cssVars(vars: Record<string, string>) {
  return (el: HTMLElement | SVGElement | null) => {
    if (el) {
      Object.entries(vars).forEach(([name, value]) =>
        el.style.setProperty(name, value),
      );
    }
  };
}

function labelSize(rect: Rect): number {
  return Math.min(rect.cx, rect.cy) / 5;
}

function Placeholder({ rect, label }: { rect: Rect; label: string }) {
  // Browsers clamp huge font sizes, so text is drawn in scaled-down units.
  const center = `translate(${rect.x + rect.cx / 2} ${rect.y + rect.cy / 2}) scale(${TEXT_UNIT})`;
  return (
    <g>
      <rect
        className="slide-box"
        x={rect.x}
        y={rect.y}
        width={rect.cx}
        height={rect.cy}
      />
      <text
        className="slide-box-label"
        transform={center}
        fontSize={labelSize(rect) / TEXT_UNIT}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

function formatLabel(asset: ImageAsset | null, path: string | null): string {
  if (asset !== null) {
    return asset.format === 'unknown' ? '?' : asset.format.toUpperCase();
  }
  const dot = path === null ? -1 : path.lastIndexOf('.');
  return path === null || dot < 0 ? '?' : path.slice(dot + 1).toUpperCase();
}

function isRenderable(asset: ImageAsset | null): asset is ImageAsset {
  return (
    asset !== null &&
    !asset.missing &&
    asset.archivePath !== null &&
    RENDERABLE.has(asset.format)
  );
}

const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };

/** A crop that removes a whole axis (or more) cannot be drawn: show it uncropped. */
function usableCrop(crop: Crop | null): Crop {
  return crop !== null && crop.l + crop.r < 1 && crop.t + crop.b < 1
    ? crop
    : NO_CROP;
}

function cropBox(rect: Rect, crop: Crop | null) {
  const c = usableCrop(crop);
  const width = rect.cx / (1 - c.l - c.r);
  const height = rect.cy / (1 - c.t - c.b);
  return { x: -c.l * width, y: -c.t * height, width, height };
}

interface PictureProps {
  deck: Deck;
  shape: Extract<Shape, { kind: 'picture' }>;
  enabled: boolean;
}

function pictureAsset(deck: Deck, shape: PictureProps['shape']) {
  const svg = findAsset(deck, shape.svgPath);
  return isRenderable(svg) ? svg : findAsset(deck, shape.mediaPath);
}

function Picture({ deck, shape, enabled }: PictureProps) {
  const asset = pictureAsset(deck, shape);
  const renderable = isRenderable(asset);
  const url = useObjectUrl(
    deck,
    renderable ? asset : null,
    'original',
    enabled,
  );
  const { rect } = shape;
  if (!renderable) {
    const path = shape.mediaPath ?? shape.externalUrl;
    return <Placeholder rect={rect} label={formatLabel(asset, path)} />;
  }
  const box = cropBox(rect, shape.crop);
  return (
    <svg
      x={rect.x}
      y={rect.y}
      width={rect.cx}
      height={rect.cy}
      overflow="hidden"
    >
      <image
        {...(url === null ? {} : { href: url })}
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        preserveAspectRatio="none"
      />
    </svg>
  );
}

function Text({ shape }: { shape: Extract<Shape, { kind: 'text' }> }) {
  const { rect } = shape;
  // One unit is one point, so font sizes stay small numbers that browsers honor.
  return (
    <g transform={`translate(${rect.x} ${rect.y}) scale(${EMU_PER_PT})`}>
      <foreignObject width={rect.cx / EMU_PER_PT} height={rect.cy / EMU_PER_PT}>
        <div className="slide-text">
          {shape.paragraphs.map((paragraph, i) => (
            <p
              key={i}
              className={paragraph.bold ? 'slide-bold' : ''}
              ref={cssVars({
                'font-size': `${paragraph.sizePt ?? DEFAULT_PT}px`,
              })}
            >
              {paragraph.text}
            </p>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}

function Background({
  deck,
  slide,
  enabled,
}: {
  deck: Deck;
  slide: Slide;
  enabled: boolean;
}) {
  const { background } = slide;
  const asset = findAsset(
    deck,
    background.kind === 'image' ? background.mediaPath : null,
  );
  const renderable = isRenderable(asset);
  const url = useObjectUrl(
    deck,
    renderable ? asset : null,
    'original',
    enabled,
  );
  const { cx, cy } = deck.presentation.size;
  if (background.kind === 'image' && url !== null) {
    return (
      <image
        href={url}
        x={0}
        y={0}
        width={cx}
        height={cy}
        preserveAspectRatio="none"
      />
    );
  }
  const fill = background.kind === 'color' ? background.color : null;
  return (
    <rect
      ref={cssVars(fill === null ? {} : { '--slide-bg': fill })}
      className="slide-background"
      x={0}
      y={0}
      width={cx}
      height={cy}
    />
  );
}

interface ShapeViewProps {
  deck: Deck;
  shape: Shape;
  enabled: boolean;
}

function ShapeView({ deck, shape, enabled }: ShapeViewProps) {
  const t = useT();
  switch (shape.kind) {
    case 'text':
      return <Text shape={shape} />;
    case 'picture':
      return <Picture deck={deck} shape={shape} enabled={enabled} />;
    default:
      return <Placeholder rect={shape.rect} label={t(BOX_KEYS[shape.label])} />;
  }
}

export interface SlideCanvasProps {
  deck: Deck;
  slide: Slide;
  mode: Mode;
}

export function SlideCanvas({ deck, slide, mode }: SlideCanvasProps) {
  const t = useT();
  const [observe, inView] = useInView();
  const enabled = mode === 'full' || inView;
  const { cx, cy } = deck.presentation.size;
  return (
    <svg
      ref={observe}
      className={`slide-canvas slide-canvas-${mode}`}
      viewBox={`0 0 ${cx} ${cy}`}
      role="img"
      aria-label={t('slideLabel', { n: slide.index })}
    >
      <Background deck={deck} slide={slide} enabled={enabled} />
      {slide.shapes.map((shape, i) => (
        <ShapeView key={i} deck={deck} shape={shape} enabled={enabled} />
      ))}
    </svg>
  );
}
