/* eslint-disable no-magic-numbers -- index arithmetic on paths */
import { NS, attr, descendants, parseXml } from './xml';
import type { ZipArchive } from './zip/zip-reader';

export interface Relationship {
  id: string;
  type: string;
  /** Resolved archive path, or the raw URL when `external`. */
  target: string;
  external: boolean;
}

export type RelKind =
  | 'image'
  | 'slide'
  | 'slideLayout'
  | 'slideMaster'
  | 'chart'
  | 'diagramDrawing'
  | 'notesSlide';

export function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf('/');
  const dir = partPath.slice(0, slash + 1);
  const name = partPath.slice(slash + 1);
  return `${dir}_rels/${name}.rels`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveTarget(partPath: string, target: string): string {
  const decoded = safeDecode(target);
  const base = decoded.startsWith('/') ? [] : partPath.split('/').slice(0, -1);
  const segments = [...base];
  for (const part of decoded.split('/')) {
    if (part === '..') {
      segments.pop();
    } else if (part !== '.' && part !== '') {
      segments.push(part);
    }
  }
  return segments.join('/');
}

export function relTypeIs(rel: Relationship, kind: RelKind): boolean {
  return rel.type.slice(rel.type.lastIndexOf('/') + 1) === kind;
}

function toRelationship(
  el: Element,
  partPath: string,
): Relationship | undefined {
  const id = attr(el, 'Id');
  const target = attr(el, 'Target');
  if (typeof id === 'undefined' || typeof target === 'undefined') {
    return;
  }
  const external = attr(el, 'TargetMode') === 'External';
  return {
    id,
    type: attr(el, 'Type') ?? '',
    target: external ? target : resolveTarget(partPath, target),
    external,
  };
}

export async function readRelationships(
  zip: ZipArchive,
  partPath: string,
): Promise<Map<string, Relationship>> {
  const result = new Map<string, Relationship>();
  const relsPath = relsPathFor(partPath);
  if (!zip.has(relsPath)) {
    return result;
  }
  const doc = parseXml(await zip.readText(relsPath));
  for (const el of descendants(doc.documentElement, NS.rel, 'Relationship')) {
    const rel = toRelationship(el, partPath);
    if (typeof rel !== 'undefined') {
      result.set(rel.id, rel);
    }
  }
  return result;
}
