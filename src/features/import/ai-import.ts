import { createEmptyMap } from '@/domain/map-factory';
import { addChildNode } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';
import type { PptxSlidePayload } from '@/features/import/pptx';

export type AiImportInput = {
  apiKey: string;
  deckTitle: string;
  slides: PptxSlidePayload[];
};

type AiNode = { text: string; children?: AiNode[] };

type AiResponse = {
  title?: string;
  root?: string;
  nodes?: AiNode[];
};

const MODEL = 'claude-sonnet-4-20250514';

function applyTree(map: MindMapDocument, parentId: string, nodes: AiNode[]): MindMapDocument {
  let current = map;
  for (const node of nodes) {
    const { map: next, newNodeId } = addChildNode(current, parentId, node.text.slice(0, 200));
    current = next;
    if (node.children?.length && newNodeId) {
      current = applyTree(current, newNodeId, node.children);
    }
  }
  return current;
}

export async function importWithAnthropic(input: AiImportInput): Promise<MindMapDocument> {
  const { apiKey, deckTitle, slides } = input;
  if (!apiKey.trim()) {
    throw new Error('Add your Anthropic API key in Settings.');
  }
  const slideBlock = slides
    .map((s) => `Slide ${s.index}:\n${s.text.slice(0, 4000)}`)
    .join('\n\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Convert this presentation into a mind map JSON tree. Return ONLY valid JSON with shape {"title":"...","root":"central topic","nodes":[{"text":"...","children":[]}]} — no markdown. Deck: ${deckTitle}\n\n${slideBlock}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Anthropic request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('AI response did not include JSON.');
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AiResponse;
  const title = parsed.title?.trim() || deckTitle;
  let map = createEmptyMap(title);
  const rootText = parsed.root?.trim() || title;
  map = {
    ...map,
    nodes: map.nodes.map((n) =>
      n.id === map.rootId ? { ...n, text: rootText } : n,
    ),
  };
  if (parsed.nodes?.length) {
    map = applyTree(map, map.rootId, parsed.nodes);
  }
  return map;
}
