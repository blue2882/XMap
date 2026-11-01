import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractPptxSlides } from '@/features/import/pptx';

const slideXml = (text: string) =>
  `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>${text}</a:t></p:sld>`;

describe('extractPptxSlides slide order', () => {
  it('follows presentation.xml rel order, not filename numbering', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', slideXml('First file name'));
    zip.file('ppt/slides/slide2.xml', slideXml('Second file name'));
    zip.file(
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`,
    );
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const file = new File([buf], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const slides = await extractPptxSlides(file);
    expect(slides.map((s) => s.text)).toEqual(['Second file name', 'First file name']);
  });
});
