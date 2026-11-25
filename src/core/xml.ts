/* eslint-disable no-magic-numbers -- index arithmetic */
export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  asvg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
} as const;

export type PptxErrorCode = 'bad-xml' | 'no-presentation';

export class PptxError extends Error {
  readonly code: PptxErrorCode;

  constructor(code: PptxErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PptxError';
    this.code = code;
  }
}

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new PptxError('bad-xml', 'Malformed XML');
  }
  return doc;
}

export function children(el: Element, ns: string, local: string): Element[] {
  return Array.from(el.children).filter(
    (node) => node.namespaceURI === ns && node.localName === local,
  );
}

export function child(
  el: Element,
  ns: string,
  local: string,
): Element | undefined {
  return children(el, ns, local)[0];
}

export function descendants(el: Element, ns: string, local: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(ns, local));
}

export function attr(
  el: Element,
  local: string,
  ns?: string,
): string | undefined {
  const value =
    typeof ns === 'undefined'
      ? el.getAttribute(local)
      : el.getAttributeNS(ns, local);
  if (value === null) {
    return;
  }
  return value;
}
