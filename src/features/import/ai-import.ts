import { createEmptyMap } from '@/domain/map-factory';
import { addChildNode } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';
import type { PptxSlidePayload } from '@/features/import/pptx';
import { sanitizeAnthropicError } from '@/features/import/ai-import-errors';
import { AI_IMPORT_LIMITS, getAnthropicModelId } from '@/features/import/ai-import-limits';
import {
  anthropicMessagesResponseSchema,
  parseAiImportFromModelText,
  type ValidatedAiNode,
} from '@/features/import/ai-import-schemas';

export type AiImportInput = {
  apiKey: string;
  deckTitle: string;
  slides: PptxSlidePayload[];
};

type NodeBudget = { remaining: number };

const buildSlidePromptBlock = (slides: PptxSlidePayload[]): string => {
  const capped = slides.slice(0, AI_IMPORT_LIMITS.maxSlides);
  const blocks: string[] = [];
  let totalChars = 0;

  for (const slide of capped) {
    const body = slide.text.slice(0, AI_IMPORT_LIMITS.maxCharsPerSlide);
    const block = `Slide ${slide.index}:\n${body}`;
    if (totalChars + block.length > AI_IMPORT_LIMITS.maxTotalPromptChars) {
      break;
    }
    blocks.push(block);
    totalChars += block.length + 2;
  }

  if (slides.length > capped.length) {
    blocks.push(
      `(Only the first ${AI_IMPORT_LIMITS.maxSlides} slides were sent; ${slides.length - capped.length} omitted.)`,
    );
  }

  return blocks.join('\n\n');
};

const applyTree = (
  map: MindMapDocument,
  parentId: string,
  nodes: ValidatedAiNode[],
  budget: NodeBudget,
): MindMapDocument => {
  let current = map;
  for (const node of nodes) {
    if (budget.remaining <= 0) return current;
    budget.remaining -= 1;
    const { map: next, newNodeId } = addChildNode(
      current,
      parentId,
      node.text.slice(0, AI_IMPORT_LIMITS.maxNodeTextLength),
    );
    current = next;
    if (node.children?.length && newNodeId) {
      current = applyTree(current, newNodeId, node.children, budget);
    }
  }
  return current;
};

export async function importWithAnthropic(input: AiImportInput): Promise<MindMapDocument> {
  const { apiKey, deckTitle, slides } = input;
  if (!apiKey.trim()) {
    throw new Error('Add your Anthropic API key in Settings.');
  }

  const title = deckTitle.trim().slice(0, AI_IMPORT_LIMITS.maxDeckTitleLength) || 'Imported deck';
  const slideBlock = buildSlidePromptBlock(slides);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: getAnthropicModelId(),
      max_tokens: AI_IMPORT_LIMITS.maxTokens,
      messages: [
        {
          role: 'user',
          content: `Convert this presentation into a mind map JSON tree. Return ONLY valid JSON with shape {"title":"...","root":"central topic","nodes":[{"text":"...","children":[]}]} — no markdown. Deck: ${title}\n\n${slideBlock}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(sanitizeAnthropicError(response.status, errText));
  }

  const rawBody: unknown = await response.json();
  const parsedResponse = anthropicMessagesResponseSchema.safeParse(rawBody);
  if (!parsedResponse.success) {
    throw new Error('AI import returned an unexpected response.');
  }

  if (parsedResponse.data.stop_reason === 'max_tokens') {
    throw new Error('AI response was cut off. Try a smaller deck or fewer slides.');
  }

  const textBlock = parsedResponse.data.content?.find(
    (block): block is { type: 'text'; text: string } =>
      block.type === 'text' && typeof block.text === 'string',
  );
  const text = textBlock?.text ?? '';
  if (!text.trim()) {
    throw new Error('AI response did not include text content.');
  }

  const parsed = parseAiImportFromModelText(text);
  const mapTitle = parsed.title?.trim() || title;
  let map = createEmptyMap(mapTitle);
  const rootText = parsed.root?.trim() || mapTitle;
  map = {
    ...map,
    nodes: map.nodes.map((n) => (n.id === map.rootId ? { ...n, text: rootText } : n)),
  };
  if (parsed.nodes?.length) {
    map = applyTree(map, map.rootId, parsed.nodes, {
      remaining: AI_IMPORT_LIMITS.maxNodesTotal,
    });
  }
  return map;
}
