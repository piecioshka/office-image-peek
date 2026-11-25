/* eslint-disable no-magic-numbers -- fixture ids */
/** Minimal Word and Excel packages with pictures in the usual places. */
import { strToU8, zipSync } from 'fflate';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const ML = 'application/vnd.openxmlformats-officedocument';

function rels(items: [string, string, string][]): Uint8Array {
  const body = items
    .map(
      ([id, type, target]) =>
        `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`,
    )
    .join('');
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">${body}</Relationships>`,
  );
}

function contentTypes(main: string, mainType: string): Uint8Array {
  return strToU8(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      `<Override PartName="/${main}" ContentType="${ML}.${mainType}+xml"/></Types>`,
  );
}

const blip = (rid: string) =>
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic>`;

function rootRels(target: string): Uint8Array {
  return rels([['rId1', 'officeDocument', target]]);
}

export interface FixtureDocx {
  /** Media names (in word/media) drawn in the body, in order. */
  body: string[];
  /** Media names drawn in the single header. */
  header?: string[];
  media: Record<string, Uint8Array>;
}

export function buildDocx(spec: FixtureDocx): Uint8Array {
  const bodyRels = spec.body.map((name, i): [string, string, string] => [
    `rId${i + 10}`,
    'image',
    `media/${name}`,
  ]);
  const header = spec.header ?? [];
  const docRels: [string, string, string][] = [...bodyRels];
  const files: Record<string, Uint8Array> = {};
  if (header.length > 0) {
    docRels.push(['rIdH', 'header', 'header1.xml']);
    files['word/header1.xml'] = strToU8(
      `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="${A}" xmlns:r="${R}">${header.map((_, i) => blip(`rId${i + 1}`)).join('')}</w:hdr>`,
    );
    files['word/_rels/header1.xml.rels'] = rels(
      header.map((name, i) => [`rId${i + 1}`, 'image', `media/${name}`]),
    );
  }
  const paragraphs = bodyRels.map(
    ([id]) => `<w:p><w:r><w:drawing>${blip(id)}</w:drawing></w:r></w:p>`,
  );
  files['word/document.xml'] = strToU8(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="${A}" xmlns:r="${R}"><w:body>${paragraphs.join('')}</w:body></w:document>`,
  );
  files['word/_rels/document.xml.rels'] = rels(docRels);
  for (const [name, bytes] of Object.entries(spec.media)) {
    files[`word/media/${name}`] = bytes;
  }
  return zipSync({
    '[Content_Types].xml': contentTypes(
      'word/document.xml',
      'wordprocessingml.document.main',
    ),
    '_rels/.rels': rootRels('word/document.xml'),
    ...files,
  });
}

export interface FixtureSheet {
  name: string;
  /** Media names (in xl/media) anchored in the sheet's drawing. */
  pictures: string[];
}

export interface FixtureXlsx {
  sheets: FixtureSheet[];
  /** Media names placed inside cells through rich values. */
  inCells?: string[];
  media: Record<string, Uint8Array>;
}

function addSheet(
  files: Record<string, Uint8Array>,
  sheet: FixtureSheet,
  n: number,
): void {
  const hasDrawing = sheet.pictures.length > 0;
  files[`xl/worksheets/sheet${n}.xml`] = strToU8(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheetData/>${hasDrawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`,
  );
  if (!hasDrawing) {
    return;
  }
  files[`xl/worksheets/_rels/sheet${n}.xml.rels`] = rels([
    ['rId1', 'drawing', `../drawings/drawing${n}.xml`],
  ]);
  const anchors = sheet.pictures
    .map(
      (_, i) =>
        `<xdr:oneCellAnchor><xdr:pic><xdr:blipFill><a:blip r:embed="rId${i + 1}"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor>`,
    )
    .join('');
  files[`xl/drawings/drawing${n}.xml`] = strToU8(
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${A}" xmlns:r="${R}">${anchors}</xdr:wsDr>`,
  );
  files[`xl/drawings/_rels/drawing${n}.xml.rels`] = rels(
    sheet.pictures.map((name, i) => [
      `rId${i + 1}`,
      'image',
      `../media/${name}`,
    ]),
  );
}

export function buildXlsx(spec: FixtureXlsx): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  spec.sheets.forEach((sheet, i) => addSheet(files, sheet, i + 1));
  const sheetList = spec.sheets
    .map(
      (s, i) =>
        `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');
  files['xl/workbook.xml'] = strToU8(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>${sheetList}</sheets></workbook>`,
  );
  const wbRels: [string, string, string][] = spec.sheets.map((_, i) => [
    `rId${i + 1}`,
    'worksheet',
    `worksheets/sheet${i + 1}.xml`,
  ]);
  const inCells = spec.inCells ?? [];
  if (inCells.length > 0) {
    files['xl/richData/richValueRel.xml'] = strToU8(
      `<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="${R}">${inCells.map((_, i) => `<rel r:id="rId${i + 1}"/>`).join('')}</richValueRels>`,
    );
    files['xl/richData/_rels/richValueRel.xml.rels'] = rels(
      inCells.map((name, i) => [`rId${i + 1}`, 'image', `../media/${name}`]),
    );
    files['xl/_rels/workbook.xml.rels'] = rels([
      ...wbRels,
      ['rIdRv', 'richValueRel', 'richData/richValueRel.xml'],
    ]);
  } else {
    files['xl/_rels/workbook.xml.rels'] = rels(wbRels);
  }
  for (const [name, bytes] of Object.entries(spec.media)) {
    files[`xl/media/${name}`] = bytes;
  }
  return zipSync({
    '[Content_Types].xml': contentTypes(
      'xl/workbook.xml',
      'spreadsheetml.sheet.main',
    ),
    '_rels/.rels': rootRels('xl/workbook.xml'),
    ...files,
  });
}
