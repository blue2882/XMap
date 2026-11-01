export const AI_IMPORT_LIMITS = {
  maxSlides: 40,
  maxCharsPerSlide: 4_000,
  maxTotalPromptChars: 120_000,
  maxTreeDepth: 8,
  maxNodesTotal: 500,
  maxChildrenPerNode: 50,
  maxNodeTextLength: 200,
  maxDeckTitleLength: 200,
  maxTokens: 4_096,
} as const;

export const getAnthropicModelId = (): string =>
  import.meta.env.VITE_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5';
