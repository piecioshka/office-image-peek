/** Position and size in EMU. */
export interface Rect {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

/** Fractions 0..1 of each side cut away, from `a:srcRect`. */
export interface Crop {
  l: number;
  t: number;
  r: number;
  b: number;
}

export type Background =
  | { kind: 'color'; color: string }
  | { kind: 'image'; mediaPath: string }
  | { kind: 'none' };

export type Shape =
  | {
      kind: 'text';
      rect: Rect;
      paragraphs: { text: string; bold: boolean; sizePt: number | null }[];
    }
  | {
      kind: 'picture';
      rect: Rect;
      mediaPath: string | null;
      svgPath: string | null;
      externalUrl: string | null;
      crop: Crop | null;
      source: 'slide' | 'layout' | 'master';
    }
  | {
      kind: 'placeholder-box';
      rect: Rect;
      label: 'chart' | 'table' | 'diagram' | 'object';
    };

export interface Slide {
  index: number;
  partPath: string;
  hidden: boolean;
  background: Background;
  shapes: Shape[];
  layoutPath: string | null;
  /** Media paths reached through chart/diagram relationships of this slide. */
  extraMedia: string[];
}

export interface Presentation {
  size: { cx: number; cy: number };
  slides: Slide[];
  layoutPaths: string[];
  masterPaths: string[];
}
