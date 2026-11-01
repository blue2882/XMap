import { z } from 'zod';
import { AI_IMPORT_LIMITS } from '@/features/import/ai-import-limits';

const { maxTreeDepth, maxChildrenPerNode, maxNodeTextLength, maxNodesTotal, maxDeckTitleLength } =
  AI_IMPORT_LIMITS;

export type ValidatedAiNode = {
  text: string;
  children?: ValidatedAiNode[];
};

export type ValidatedAiImportPayload = {
  title?: string;
  root?: string;
  nodes?: ValidatedAiNode[];
};

const aiNodeSchema = (depthRemaining: number): z.ZodType<ValidatedAiNode> => {
  const childSchema =
    depthRemaining > 0
      ? z
          .array(z.lazy(() => aiNodeSchema(depthRemaining - 1)))
          .max(maxChildrenPerNode)
          .optional()
      : z.undefined().optional();

  return z.object({
    text: z.string().min(1).max(maxNodeTextLength),
    children: childSchema,
  });
};

export const aiImportPayloadSchema = z.object({
  title: z.string().max(maxDeckTitleLength).optional(),
  root: z.string().max(maxNodeTextLength).optional(),
  nodes: z.array(aiNodeSchema(maxTreeDepth - 1)).max(maxChildrenPerNode).optional(),
});

const anthropicTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const anthropicMessagesResponseSchema = z.object({
  content: z
    .array(z.union([anthropicTextBlockSchema, z.object({ type: z.string() }).passthrough()]))
    .optional(),
  stop_reason: z.string().optional(),
});

const countNodes = (nodes: ValidatedAiNode[] | undefined): number => {
  if (!nodes?.length) return 0;
  let total = 0;
  for (const node of nodes) {
    total += 1;
    total += countNodes(node.children);
  }
  return total;
};

export const parseAiImportPayload = (json: unknown): ValidatedAiImportPayload => {
  const parsed = aiImportPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('AI returned an invalid mind map shape.');
  }
  const nodeCount = countNodes(parsed.data.nodes);
  if (nodeCount > maxNodesTotal) {
    throw new Error(`AI mind map has too many nodes (max ${maxNodesTotal}).`);
  }
  return parsed.data;
};

export const extractJsonObjectFromModelText = (text: string): unknown => {
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('AI response did not include JSON.');
  }
  const slice = text.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    throw new Error('AI response JSON could not be parsed.');
  }
};

export const parseAiImportFromModelText = (text: string): ValidatedAiImportPayload => {
  const json = extractJsonObjectFromModelText(text);
  return parseAiImportPayload(json);
};
