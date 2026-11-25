/* eslint-disable no-magic-numbers, no-bitwise -- fixture constants, PNG/JPEG byte layout and CRC */
import { strToU8, zipSync, zlibSync } from 'fflate';

export interface Rect {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

export type FixtureShape =
  | {
      kind: 'text';
      text: string[];
      xfrm?: Rect;
      placeholder?: { type?: string; idx?: number };
      bold?: boolean;
      sizePt?: number;
    }
  | {
      kind: 'picture';
      media: string;
      xfrm: Rect;
      crop?: { l?: number; t?: number; r?: number; b?: number };
      svgMedia?: string;
      external?: string;
    }
  | { kind: 'chart'; xfrm: Rect; chartMedia?: string }
  | { kind: 'table'; xfrm: Rect };

export interface FixtureSlide {
  /** Zero-based index into `FixtureDeck.layouts` (default 0). */
  layout?: number;
  hidden?: boolean;
  background?: { color?: string; image?: string };
  shapes: FixtureShape[];
}

export interface FixtureLayout {
  placeholders: { type?: string; idx?: number; xfrm: Rect }[];
  logoMedia?: string;
  logoXfrm?: Rect;
}

export interface FixtureDeck {
  slideSize?: { cx: number; cy: number };
  layouts?: FixtureLayout[];
  slides: FixtureSlide[];
  media?: Record<string, Uint8Array>;
  extraEntries?: Record<string, Uint8Array>;
}

const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_ASVG = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main';
const NS_PKG_REL =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL = `${NS_R}`;
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const ROOT_NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;
const DEFAULT_SIZE = { cx: 9144000, cy: 6858000 };
const MASTER_TITLE: Rect = { x: 457200, y: 274638, cx: 8229600, cy: 1143000 };
const DEFAULT_LAYOUT: FixtureLayout = {
  placeholders: [{ type: 'title', xfrm: MASTER_TITLE }],
};
const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
};
const SP_TREE_HEAD =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ext(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
}

/** Collects the relationships of one part and hands out `rIdN` ids. */
class Rels {
  private readonly items: string[] = [];

  add(type: string, target: string, external = false): string {
    const id = `rId${this.items.length + 1}`;
    const mode = external ? ' TargetMode="External"' : '';
    this.items.push(
      `<Relationship Id="${id}" Type="${REL}/${type}" Target="${esc(target)}"${mode}/>`,
    );
    return id;
  }

  toXml(): string {
    return `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">${this.items.join('')}</Relationships>`;
  }
}

function xfrmXml(r: Rect): string {
  return `<a:xfrm><a:off x="${r.x}" y="${r.y}"/><a:ext cx="${r.cx}" cy="${r.cy}"/></a:xfrm>`;
}

function phXml(ph?: { type?: string; idx?: number }): string {
  if (typeof ph === 'undefined') {
    return '<p:nvPr/>';
  }
  const type = typeof ph.type === 'undefined' ? '' : ` type="${esc(ph.type)}"`;
  const idx = typeof ph.idx === 'undefined' ? '' : ` idx="${ph.idx}"`;
  return `<p:nvPr><p:ph${type}${idx}/></p:nvPr>`;
}

function textShapeXml(
  id: number,
  shape: Extract<FixtureShape, { kind: 'text' }>,
): string {
  const run = (text: string) =>
    `<a:r><a:rPr lang="en-US"${shape.bold ? ' b="1"' : ''}${
      typeof shape.sizePt === 'undefined' ? '' : ` sz="${shape.sizePt * 100}"`
    } dirty="0"/><a:t>${esc(text)}</a:t></a:r>`;
  const paragraphs = shape.text.map((t) => `<a:p>${run(t)}</a:p>`).join('');
  const spPr =
    typeof shape.xfrm === 'undefined'
      ? '<p:spPr/>'
      : `<p:spPr>${xfrmXml(shape.xfrm)}</p:spPr>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/>${phXml(shape.placeholder)}</p:nvSpPr>` +
    `${spPr}<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  );
}

function cropXml(crop?: {
  l?: number;
  t?: number;
  r?: number;
  b?: number;
}): string {
  if (typeof crop === 'undefined') {
    return '';
  }
  const parts = (['l', 't', 'r', 'b'] as const)
    .filter((side) => typeof crop[side] !== 'undefined')
    .map((side) => ` ${side}="${crop[side]}"`);
  return `<a:srcRect${parts.join('')}/>`;
}

function blipXml(
  rels: Rels,
  shape: Extract<FixtureShape, { kind: 'picture' }>,
): string {
  if (typeof shape.external !== 'undefined') {
    return `<a:blip r:link="${rels.add('image', shape.external, true)}"/>`;
  }
  const embed = rels.add('image', `../media/${shape.media}`);
  if (typeof shape.svgMedia === 'undefined') {
    return `<a:blip r:embed="${embed}"/>`;
  }
  const svg = rels.add('image', `../media/${shape.svgMedia}`);
  return (
    `<a:blip r:embed="${embed}"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">` +
    `<asvg:svgBlip xmlns:asvg="${NS_ASVG}" r:embed="${svg}"/></a:ext></a:extLst></a:blip>`
  );
}

function pictureXml(
  id: number,
  rels: Rels,
  shape: Extract<FixtureShape, { kind: 'picture' }>,
): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/>` +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
    `<p:blipFill>${blipXml(rels, shape)}${cropXml(shape.crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrmXml(shape.xfrm)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function frameXml(
  id: number,
  name: string,
  r: Rect,
  uri: string,
  data: string,
): string {
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name} ${id}"/>` +
    '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
    `<p:xfrm><a:off x="${r.x}" y="${r.y}"/><a:ext cx="${r.cx}" cy="${r.cy}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="${uri}">${data}</a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function tableXml(
  id: number,
  shape: Extract<FixtureShape, { kind: 'table' }>,
): string {
  const cell =
    '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></a:txBody><a:tcPr/></a:tc>';
  const tbl =
    '<a:tbl><a:tblPr firstRow="1" bandRow="1"/>' +
    `<a:tblGrid><a:gridCol w="${shape.xfrm.cx}"/></a:tblGrid>` +
    `<a:tr h="${shape.xfrm.cy}">${cell}</a:tr></a:tbl>`;
  return frameXml(id, 'Table', shape.xfrm, `${NS_A}/table`, tbl);
}

interface Charts {
  parts: Map<string, Uint8Array>;
  next: () => number;
}

function chartPartXml(rId: string): string {
  const fill =
    rId === ''
      ? ''
      : `<c:spPr><a:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></c:spPr>`;
  return (
    `${XML_DECL}<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    '<c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>' +
    '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:axId val="1"/><c:axId val="2"/></c:barChart>' +
    '</c:plotArea><c:plotVisOnly val="1"/></c:chart>' +
    `${fill}</c:chartSpace>`
  );
}

function chartXml(
  id: number,
  rels: Rels,
  charts: Charts,
  shape: Extract<FixtureShape, { kind: 'chart' }>,
): string {
  const n = charts.next();
  const chartRels = new Rels();
  const imageId =
    typeof shape.chartMedia === 'undefined'
      ? ''
      : chartRels.add('image', `../media/${shape.chartMedia}`);
  charts.parts.set(`ppt/charts/chart${n}.xml`, strToU8(chartPartXml(imageId)));
  charts.parts.set(
    `ppt/charts/_rels/chart${n}.xml.rels`,
    strToU8(chartRels.toXml()),
  );
  const rId = rels.add('chart', `../charts/chart${n}.xml`);
  const data = `<c:chart xmlns:c="${NS_C}" r:id="${rId}"/>`;
  return frameXml(id, 'Chart', shape.xfrm, NS_C, data);
}

function shapeXml(
  id: number,
  shape: FixtureShape,
  rels: Rels,
  charts: Charts,
): string {
  switch (shape.kind) {
    case 'text':
      return textShapeXml(id, shape);
    case 'picture':
      return pictureXml(id, rels, shape);
    case 'chart':
      return chartXml(id, rels, charts, shape);
    case 'table':
      return tableXml(id, shape);
    default:
      return '';
  }
}

function backgroundXml(bg: FixtureSlide['background'], rels: Rels): string {
  if (typeof bg === 'undefined') {
    return '';
  }
  if (typeof bg.image !== 'undefined') {
    const id = rels.add('image', `../media/${bg.image}`);
    const fill = `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
    return `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`;
  }
  const color = bg.color ?? 'FFFFFF';
  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
}

function slideXml(slide: FixtureSlide, rels: Rels, charts: Charts): string {
  const show = slide.hidden ? ' show="0"' : '';
  const bg = backgroundXml(slide.background, rels);
  const shapes = slide.shapes
    .map((s, i) => shapeXml(i + 2, s, rels, charts))
    .join('');
  return (
    `${XML_DECL}<p:sld ${ROOT_NS}${show}><p:cSld>${bg}<p:spTree>${SP_TREE_HEAD}${shapes}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

function placeholderSpXml(
  id: number,
  ph: { type?: string; idx?: number; xfrm: Rect },
): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Placeholder ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>${phXml(ph)}</p:nvSpPr>` +
    `<p:spPr>${xfrmXml(ph.xfrm)}</p:spPr>` +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit</a:t></a:r></a:p></p:txBody></p:sp>'
  );
}

function logoXml(id: number, rels: Rels, layout: FixtureLayout): string {
  if (typeof layout.logoMedia === 'undefined') {
    return '';
  }
  const rId = rels.add('image', `../media/${layout.logoMedia}`);
  const xfrm = layout.logoXfrm ?? { x: 0, y: 0, cx: 457200, cy: 457200 };
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Logo"/><p:cNvPicPr/><p:nvPr userDrawn="1"/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrmXml(xfrm)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function layoutXml(layout: FixtureLayout, rels: Rels): string {
  rels.add('slideMaster', '../slideMasters/slideMaster1.xml');
  const phs = layout.placeholders
    .map((ph, i) => placeholderSpXml(i + 2, ph))
    .join('');
  const logo = logoXml(layout.placeholders.length + 2, rels, layout);
  return (
    `${XML_DECL}<p:sldLayout ${ROOT_NS} type="cust" preserve="1"><p:cSld name="Layout"><p:spTree>${SP_TREE_HEAD}${phs}${logo}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
  );
}

function masterXml(layoutCount: number): string {
  const ids = Array.from({ length: layoutCount }, (_, i) => {
    return `<p:sldLayoutId id="${2147483649 + i}" r:id="rId${i + 1}"/>`;
  }).join('');
  const title = placeholderSpXml(2, { type: 'title', xfrm: MASTER_TITLE });
  const bg =
    '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
  return (
    `${XML_DECL}<p:sldMaster ${ROOT_NS}><p:cSld>${bg}<p:spTree>${SP_TREE_HEAD}${title}</p:spTree></p:cSld>` +
    `${CLR_MAP}<p:sldLayoutIdLst>${ids}</p:sldLayoutIdLst>` +
    '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'
  );
}

function presentationXml(
  slideCount: number,
  size: { cx: number; cy: number },
): string {
  const ids = Array.from({ length: slideCount }, (_, i) => {
    return `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`;
  }).join('');
  return (
    `${XML_DECL}<p:presentation ${ROOT_NS}>` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/>` +
    '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
  );
}

function presentationRels(slideCount: number): Rels {
  const rels = new Rels();
  rels.add('slideMaster', 'slideMasters/slideMaster1.xml');
  for (let i = 1; i <= slideCount; i += 1) {
    rels.add('slide', `slides/slide${i}.xml`);
  }
  return rels;
}

function contentTypesXml(
  deck: FixtureDeck,
  layoutCount: number,
  chartCount: number,
): string {
  const exts = new Set(Object.keys(deck.media ?? {}).map(ext));
  const defaults = [...exts]
    .filter((name) => typeof MEDIA_TYPES[name] !== 'undefined')
    .map(
      (name) =>
        `<Default Extension="${name}" ContentType="${MEDIA_TYPES[name]}"/>`,
    );
  const ml = 'application/vnd.openxmlformats-officedocument';
  const override = (part: string, type: string) =>
    `<Override PartName="/${part}" ContentType="${ml}.${type}+xml"/>`;
  const overrides = [
    override('ppt/theme/theme1.xml', 'theme'),
    override('ppt/presentation.xml', 'presentationml.presentation.main'),
    override('ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster'),
    ...Array.from({ length: layoutCount }, (_, i) =>
      override(
        `ppt/slideLayouts/slideLayout${i + 1}.xml`,
        'presentationml.slideLayout',
      ),
    ),
    ...deck.slides.map((_, i) =>
      override(`ppt/slides/slide${i + 1}.xml`, 'presentationml.slide'),
    ),
    ...Array.from({ length: chartCount }, (_, i) =>
      override(`ppt/charts/chart${i + 1}.xml`, 'drawingml.chart'),
    ),
  ];
  return (
    `${XML_DECL}<Types xmlns="${NS_CT}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    `<Default Extension="xml" ContentType="application/xml"/>${defaults.join('')}${overrides.join('')}</Types>`
  );
}

function rootRelsXml(): string {
  const rels = new Rels();
  rels.add('officeDocument', 'ppt/presentation.xml');
  return rels.toXml();
}

function layoutEntries(layouts: FixtureLayout[]): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  layouts.forEach((layout, i) => {
    const rels = new Rels();
    const xml = layoutXml(layout, rels);
    out[`ppt/slideLayouts/slideLayout${i + 1}.xml`] = strToU8(xml);
    out[`ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels`] = strToU8(
      rels.toXml(),
    );
  });
  return out;
}

function masterEntries(layoutCount: number): Record<string, Uint8Array> {
  const rels = new Rels();
  for (let i = 1; i <= layoutCount; i += 1) {
    rels.add('slideLayout', `../slideLayouts/slideLayout${i}.xml`);
  }
  rels.add('theme', '../theme/theme1.xml');
  return {
    'ppt/slideMasters/slideMaster1.xml': strToU8(masterXml(layoutCount)),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(rels.toXml()),
  };
}

function slideEntries(
  slides: FixtureSlide[],
  layoutCount: number,
  charts: Charts,
): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  slides.forEach((slide, i) => {
    const rels = new Rels();
    const layout = Math.min(slide.layout ?? 0, layoutCount - 1) + 1;
    rels.add('slideLayout', `../slideLayouts/slideLayout${layout}.xml`);
    out[`ppt/slides/slide${i + 1}.xml`] = strToU8(
      slideXml(slide, rels, charts),
    );
    out[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(rels.toXml());
  });
  return out;
}

function themeXml(): string {
  return (
    `${XML_DECL}<a:theme xmlns:a="${NS_A}" name="Fixture"><a:themeElements>` +
    '<a:clrScheme name="Fixture"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Fixture"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>' +
    '</a:themeElements></a:theme>'
  );
}

function mediaEntries(
  media: Record<string, Uint8Array>,
): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(media)) {
    out[`ppt/media/${name}`] = bytes;
  }
  return out;
}

export function buildPptx(spec: FixtureDeck): Uint8Array {
  const layouts = spec.layouts ?? [DEFAULT_LAYOUT];
  const parts = new Map<string, Uint8Array>();
  let chartCounter = 0;
  const charts: Charts = {
    parts,
    next: () => {
      chartCounter += 1;
      return chartCounter;
    },
  };
  const slides = slideEntries(spec.slides, layouts.length, charts);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      contentTypesXml(spec, layouts.length, chartCounter),
    ),
    '_rels/.rels': strToU8(rootRelsXml()),
    'ppt/presentation.xml': strToU8(
      presentationXml(spec.slides.length, spec.slideSize ?? DEFAULT_SIZE),
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      presentationRels(spec.slides.length).toXml(),
    ),
    'ppt/theme/theme1.xml': strToU8(themeXml()),
    ...masterEntries(layouts.length),
    ...layoutEntries(layouts),
    ...slides,
    ...Object.fromEntries(parts),
    ...mediaEntries(spec.media ?? {}),
    ...spec.extraEntries,
  };
  return zipSync(files);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(strToU8(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function rawPixels(w: number, h: number, seed: number): Uint8Array {
  const stride = 1 + w * 3;
  const raw = new Uint8Array(stride * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = y * stride + 1 + x * 3;
      raw[at] = (seed * 67 + x * 31) & 0xff;
      raw[at + 1] = (seed * 131 + y * 17) & 0xff;
      raw[at + 2] = (seed * 29 + x + y) & 0xff;
    }
  }
  return raw;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A decodable RGB PNG whose bytes differ per `seed`. */
export function tinyPng(w: number, h: number, seed: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return concatBytes([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSync(rawPixels(w, h, seed))),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

/** Minimal baseline JPEG skeleton with SOF0 dimensions; scan data is not decodable. */
export function tinyJpeg(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xdb,
    0x00,
    0x43,
    0x00,
    ...new Array<number>(64).fill(1),
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    h >> 8,
    h & 0xff,
    w >> 8,
    w & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x00,
    0xff,
    0xd9,
  ]);
}
