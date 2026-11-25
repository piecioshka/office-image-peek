/* eslint-disable no-magic-numbers -- 0/1 defaults and index arithmetic */
import type { Relationship } from './opc';
import type { Crop, Rect, Shape } from './types';
import { NS, attr, child, children, descendants } from './xml';

export interface PartData {
  path: string;
  doc: Document;
  rels: Map<string, Relationship>;
}

interface PlaceholderKey {
  type: string | null;
  idx: string | null;
}

export interface PlaceholderRect {
  key: PlaceholderKey;
  rect: Rect;
}

export type ShapeSource = 'slide' | 'layout' | 'master';

export interface ShapeEnv {
  part: PartData;
  source: ShapeSource;
  /** Placeholder rects of the layout, then the master. */
  inherited: PlaceholderRect[][];
}

/** Maps child-space coordinates of a group to slide coordinates. */
interface Transform {
  x: number;
  y: number;
  sx: number;
  sy: number;
  chX: number;
  chY: number;
}

const IDENTITY: Transform = { x: 0, y: 0, sx: 1, sy: 1, chX: 0, chY: 0 };
const FONT_SIZE_SCALE = 100;
const CROP_SCALE = 100000;
const NS_CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

export function pick(
  el: Element | undefined,
  ns: string,
  local: string,
): Element | undefined {
  return typeof el === 'undefined' ? el : child(el, ns, local);
}

export function shapeTree(part: PartData): Element | undefined {
  return pick(pick(part.doc.documentElement, NS.p, 'cSld'), NS.p, 'spTree');
}

function intAttr(el: Element | undefined, name: string): number | null {
  const raw = typeof el === 'undefined' ? null : attr(el, name);
  const value = typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function readXfrm(xfrm: Element | undefined): Rect | null {
  const off = pick(xfrm, NS.a, 'off');
  const ext = pick(xfrm, NS.a, 'ext');
  const x = intAttr(off, 'x');
  const y = intAttr(off, 'y');
  const cx = intAttr(ext, 'cx');
  const cy = intAttr(ext, 'cy');
  if (x === null || y === null || cx === null || cy === null) {
    return null;
  }
  return { x, y, cx, cy };
}

function xfrmElement(el: Element): Element | undefined {
  if (el.localName === 'graphicFrame') {
    return pick(el, NS.p, 'xfrm');
  }
  return pick(pick(el, NS.p, 'spPr'), NS.a, 'xfrm');
}

function applyTransform(t: Transform, r: Rect): Rect {
  return {
    x: Math.round(t.x + (r.x - t.chX) * t.sx),
    y: Math.round(t.y + (r.y - t.chY) * t.sy),
    cx: Math.round(r.cx * t.sx),
    cy: Math.round(r.cy * t.sy),
  };
}

function groupTransform(group: Element, parent: Transform): Transform {
  const xfrm = pick(pick(group, NS.p, 'grpSpPr'), NS.a, 'xfrm');
  const own = readXfrm(xfrm);
  const chOff = pick(xfrm, NS.a, 'chOff');
  const chExt = pick(xfrm, NS.a, 'chExt');
  const chX = intAttr(chOff, 'x');
  const chY = intAttr(chOff, 'y');
  const chCx = intAttr(chExt, 'cx');
  const chCy = intAttr(chExt, 'cy');
  if (own === null || chX === null || chY === null) {
    return parent;
  }
  const abs = applyTransform(parent, own);
  return {
    x: abs.x,
    y: abs.y,
    sx: chCx ? abs.cx / chCx : 1,
    sy: chCy ? abs.cy / chCy : 1,
    chX,
    chY,
  };
}

function placeholderOf(el: Element): PlaceholderKey | null {
  const nv = Array.from(el.children).find(
    (node) => node.namespaceURI === NS.p && node.localName.startsWith('nv'),
  );
  const ph = pick(pick(nv, NS.p, 'nvPr'), NS.p, 'ph');
  if (typeof ph === 'undefined') {
    return null;
  }
  return { type: attr(ph, 'type') ?? null, idx: attr(ph, 'idx') ?? null };
}

function matchTier(
  key: PlaceholderKey,
  tier: PlaceholderRect[],
): Rect | undefined {
  const exact = tier.find(
    (c) => c.key.type === key.type && c.key.idx === key.idx,
  );
  const byIdx = tier.find((c) => key.idx !== null && c.key.idx === key.idx);
  const byType = tier.find((c) => key.type !== null && c.key.type === key.type);
  return (exact ?? byIdx ?? byType)?.rect;
}

function inheritedRect(
  key: PlaceholderKey,
  tiers: PlaceholderRect[][],
): Rect | null {
  if (key.type === null && key.idx === null) {
    return null;
  }
  for (const tier of tiers) {
    const found = matchTier(key, tier);
    if (typeof found !== 'undefined') {
      return found;
    }
  }
  return null;
}

function resolveRect(el: Element, env: ShapeEnv, xf: Transform): Rect | null {
  const own = readXfrm(xfrmElement(el));
  if (own !== null) {
    return applyTransform(xf, own);
  }
  const key = placeholderOf(el);
  return key === null ? null : inheritedRect(key, env.inherited);
}

/** Rects of top-level placeholders that carry their own position. */
export function collectPlaceholderRects(part: PartData): PlaceholderRect[] {
  const tree = shapeTree(part);
  const out: PlaceholderRect[] = [];
  for (const el of tree ? Array.from(tree.children) : []) {
    const key = placeholderOf(el);
    const rect = readXfrm(xfrmElement(el));
    if (key !== null && rect !== null) {
      out.push({ key, rect });
    }
  }
  return out;
}

function paragraphOf(p: Element): {
  text: string;
  bold: boolean;
  sizePt: number | null;
} {
  const runs = children(p, NS.a, 'r');
  const rPr = pick(runs[0], NS.a, 'rPr');
  const size = intAttr(rPr, 'sz');
  return {
    text: runs.map((run) => pick(run, NS.a, 't')?.textContent ?? '').join(''),
    bold: typeof rPr !== 'undefined' && attr(rPr, 'b') === '1',
    sizePt: size === null ? null : size / FONT_SIZE_SCALE,
  };
}

function textShape(el: Element, rect: Rect): Shape | null {
  const body = pick(el, NS.p, 'txBody');
  const paragraphs = (body ? children(body, NS.a, 'p') : []).map(paragraphOf);
  if (!paragraphs.some((p) => p.text.trim() !== '')) {
    return null;
  }
  return { kind: 'text', rect, paragraphs };
}

function cropOf(blipFill: Element | undefined): Crop | null {
  const src = pick(blipFill, NS.a, 'srcRect');
  if (typeof src === 'undefined') {
    return null;
  }
  const side = (name: string) => (intAttr(src, name) ?? 0) / CROP_SCALE;
  return { l: side('l'), t: side('t'), r: side('r'), b: side('b') };
}

function pictureShape(el: Element, rect: Rect, env: ShapeEnv): Shape | null {
  const blipFill = pick(el, NS.p, 'blipFill');
  const blip = pick(blipFill, NS.a, 'blip');
  if (typeof blip === 'undefined') {
    return null;
  }
  const rel = (id: string | undefined) => env.part.rels.get(id ?? '');
  const embed = rel(attr(blip, 'embed', NS.r));
  const link = rel(attr(blip, 'link', NS.r));
  const svg = rel(
    attr(descendants(blip, NS.asvg, 'svgBlip')[0] ?? blip, 'embed', NS.r),
  );
  const external = [embed, link].find((r) => r?.external);
  return {
    kind: 'picture',
    rect,
    mediaPath: embed && !embed.external ? embed.target : null,
    svgPath: svg && !svg.external && svg !== embed ? svg.target : null,
    externalUrl: external ? external.target : null,
    crop: cropOf(blipFill),
    source: env.source,
  };
}

function frameLabel(el: Element): 'chart' | 'table' | 'diagram' | 'object' {
  const data = descendants(el, NS.a, 'graphicData')[0];
  const uri = data ? (attr(data, 'uri') ?? '') : '';
  if (uri === NS_CHART) {
    return 'chart';
  }
  if (uri.endsWith('/table')) {
    return 'table';
  }
  return uri.endsWith('/diagram') ? 'diagram' : 'object';
}

function buildShape(el: Element, env: ShapeEnv, xf: Transform): Shape | null {
  const isPicture = el.localName === 'pic';
  const ownedByLayout = env.source !== 'slide';
  if (ownedByLayout && (!isPicture || placeholderOf(el) !== null)) {
    return null;
  }
  const rect = resolveRect(el, env, xf);
  if (rect === null) {
    return null;
  }
  if (isPicture) {
    return pictureShape(el, rect, env);
  }
  if (el.localName === 'graphicFrame') {
    return { kind: 'placeholder-box', rect, label: frameLabel(el) };
  }
  return el.localName === 'sp' ? textShape(el, rect) : null;
}

/** Only the `mc:Fallback` branch is read, never `mc:Choice` as well. */
function fallbackOf(el: Element): Element | undefined {
  return child(el, NS.mc, 'Fallback');
}

function shapesFrom(el: Element, env: ShapeEnv, xf: Transform): Shape[] {
  if (el.namespaceURI === NS.mc && el.localName === 'AlternateContent') {
    const fallback = fallbackOf(el);
    return fallback ? walkChildren(fallback, env, xf) : [];
  }
  if (el.namespaceURI !== NS.p) {
    return [];
  }
  if (el.localName === 'grpSp') {
    return walkChildren(el, env, groupTransform(el, xf));
  }
  const shape = buildShape(el, env, xf);
  return shape === null ? [] : [shape];
}

function walkChildren(parent: Element, env: ShapeEnv, xf: Transform): Shape[] {
  return Array.from(parent.children).flatMap((el) => shapesFrom(el, env, xf));
}

export function parseShapes(env: ShapeEnv): Shape[] {
  const tree = shapeTree(env.part);
  return tree ? walkChildren(tree, env, IDENTITY) : [];
}
