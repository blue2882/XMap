import JSZip from 'jszip';
import { createEmptyMap } from '@/domain/map-factory';
import { addChildNode } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';

function stripXml(text: string): string {
  return text
    .replace(/<a:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function slideTexts(zip: JSZip): Promise<string[]> {
  const names = Object.keys(zip.files)
    .filter((n) => n.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });
  const texts: string[] = [];
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('text');
    const body = stripXml(xml);
    if (body) texts.push(body);
  }
  return texts;
}

export async function importPptxFile(file: File, title?: string): Promise<MindMapDocument> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
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
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const slides = await slideTexts(zip);
  return slides.map((text, index) => ({ index: index + 1, text }));
}
