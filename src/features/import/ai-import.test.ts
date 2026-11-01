import { describe, expect, it } from 'vitest';
import { redactApiKeyLikeText, sanitizeAnthropicError } from '@/features/import/ai-import-errors';
import { parseAiImportFromModelText, parseAiImportPayload } from '@/features/import/ai-import-schemas';

describe('sanitizeAnthropicError', () => {
  it('maps 401 to a short message without raw body', () => {
    expect(sanitizeAnthropicError(401, '{"type":"error","error":{"message":"invalid x-api-key"}}')).toBe(
      'Invalid API key. Check Settings.',
    );
  });

  it('redacts key-like substrings in API error messages', () => {
    const body = JSON.stringify({ error: { message: 'Bad key sk-ant-api03-secret' } });
    expect(sanitizeAnthropicError(400, body)).toBe('Bad key [redacted]');
  });
});

describe('redactApiKeyLikeText', () => {
  it('redacts sk-ant tokens', () => {
    expect(redactApiKeyLikeText('leak sk-ant-api03-abc')).toBe('leak [redacted]');
  });
});

describe('parseAiImportPayload', () => {
  it('accepts a shallow valid tree', () => {
    const payload = parseAiImportFromModelText(
      'Here is JSON:\n{"title":"Deck","root":"Topic","nodes":[{"text":"A","children":[]}]}',
    );
    expect(payload.root).toBe('Topic');
    expect(payload.nodes).toHaveLength(1);
  });

  it('rejects non-string text nodes', () => {
    expect(() => parseAiImportPayload({ nodes: [{ text: 42 }] })).toThrow(
      'AI returned an invalid mind map shape.',
    );
  });

  it('rejects excessive node counts', () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({
      text: `p${i}`,
      children: Array.from({ length: 10 }, (_, j) => ({ text: `c${i}-${j}` })),
    }));
    expect(() => parseAiImportPayload({ nodes })).toThrow(/too many nodes/);
  });
});
