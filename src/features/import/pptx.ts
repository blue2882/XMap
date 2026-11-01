import JSZip from 'jszip';
import { createEmptyMap } from '@/domain/map-factory';
import { addChildNode } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';

export const MAX_PPTX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PPTX_ZIP_ENTRIES = 500;
export const MAX_PPTX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const PARAGRAPH_OPEN = /<a:p(?![Pp][Rr])(?:\s[^>]*)?>/g;
const LINE_BREAK = /<a:br(?:\s[^>]*)?\/?>/g;

/** Decode XML text entities once; `&amp;` last so `&amp;lt;` stays literal `&lt;`. */
export function stripXml(text: string): string {
  const withoutTags = text
    .replace(PARAGRAPH_OPEN, '\n')
    .replace(LINE_BREAK, '\n')
    .replace(/<[^>]+>/g, '');
  return withoutTags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsePresentationRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = m[0];
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

function slidePathFromRelTarget(target: string): string {
  const normalized = target.replace(/^\.\.\//, '');
  if (normalized.startsWith('ppt/')) return normalized;
  if (normalized.startsWith('slides/')) return `ppt/${normalized}`;
  return `ppt/${normalized}`;
}

async function orderedSlidePaths(zip: JSZip): Promise<string[]> {
  const presFile = zip.file('ppt/presentation.xml');
  const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
  if (presFile && relsFile) {
    const [presXml, relsXml] = await Promise.all([
      presFile.async('text'),
      relsFile.async('text'),
    ]);
    const rels = parsePresentationRels(relsXml);
    const rIds: string[] = [];
    for (const m of presXml.matchAll(/<p:sldId\b[^>]*\/?>/g)) {
      const rId = m[0].match(/\br:id="([^"]+)"/)?.[1];
      if (rId) rIds.push(rId);
    }
    const paths = rIds
      .map((rId) => {
        const target = rels.get(rId);
        return target ? slidePathFromRelTarget(target) : null;
      })
      .filter((p): p is string => p != null && zip.file(p) != null);
    if (paths.length > 0) return paths;
  }

  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });
}

function assertZipWithinLimits(zip: JSZip, fileBytes: number): void {
  // ZIP local file header magic is not checked; entry count and uncompressed totals are the guard.
  if (fileBytes > MAX_PPTX_FILE_BYTES) {
    throw new Error(`PPTX exceeds ${MAX_PPTX_FILE_BYTES} bytes`);
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_PPTX_ZIP_ENTRIES) {
    throw new Error('PPTX archive has too many entries');
  }
  let uncompressed = 0;
  for (const entry of entries) {
    const meta = entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
    const size = meta._data?.uncompressedSize;
    if (typeof size === 'number') {
      uncompressed += size;
      if (uncompressed > MAX_PPTX_UNCOMPRESSED_BYTES) {
        throw new Error('PPTX uncompressed size exceeds limit');
      }
    }
  }
}

async function loadPptxZip(file: File): Promise<JSZip> {
  if (file.size > MAX_PPTX_FILE_BYTES) {
    throw new Error(`PPTX exceeds ${MAX_PPTX_FILE_BYTES} bytes`);
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  assertZipWithinLimits(zip, file.size);
  return zip;
}

async function slideTexts(zip: JSZip): Promise<string[]> {
  const names = await orderedSlidePaths(zip);
  const texts: string[] = [];
  let readBytes = 0;
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('text');
    readBytes += xml.length;
    if (readBytes > MAX_PPTX_UNCOMPRESSED_BYTES) {
      throw new Error('PPTX slide text exceeds size limit');
    }
    const body = stripXml(xml);
    if (body) texts.push(body);
  }
  return texts;
}

export async function importPptxFile(file: File, title?: string): Promise<MindMapDocument> {
  const zip = await loadPptxZip(file);
  const slides = await slideTexts(zip);
  const deckName = title?.trim() || file.name.replace(/\.pptx$/i, '') || 'Imported deck';
  let map = createEmptyMap(deckName);
  if (slides.length === 0) {
    return map;
  }
  const rootText = slides[0].slice(0, 120) || deckName;
  map = {
    ...map,
    nodes: map.nodes.map((n) =>
      n.id === map.rootId ? { ...n, text: rootText } : n,
    ),
  };
  for (let i = 1; i < slides.length; i++) {
    const label = slides[i].slice(0, 80) || `Slide ${i + 1}`;
    const { map: next } = addChildNode(map, map.rootId, label);
    map = next;
  }
  return map;
}

export type PptxSlidePayload = { index: number; text: string };

export async function extractPptxSlides(file: File): Promise<PptxSlidePayload[]> {
  const zip = await loadPptxZip(file);
  const slides = await slideTexts(zip);
  return slides.map((text, index) => ({ index: index + 1, text }));
}
