import { describe, expect, it } from 'vitest';
import { stripXml } from '@/features/import/pptx';

describe('stripXml', () => {
  it('does not treat a:pPr as a paragraph break', () => {
    const xml =
      '<a:pPr><a:defRPr/></a:pPr><a:p><a:t>Hello</a:t></a:p>';
    expect(stripXml(xml)).toBe('Hello');
  });

  it('preserves paragraph breaks from a:p', () => {
    const xml = '<a:p><a:t>Line one</a:t></a:p><a:p><a:t>Line two</a:t></a:p>';
    expect(stripXml(xml)).toBe('Line one\nLine two');
  });

  it('decodes amp last so amp-lt sequences are not double-decoded', () => {
    expect(stripXml('<a:t>&amp;lt;tag&amp;gt;</a:t>')).toBe('&lt;tag&gt;');
  });

  it('decodes normal entities', () => {
    expect(stripXml('<a:t>Fish &amp; chips</a:t>')).toBe('Fish & chips');
  });
});
