const API_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;

export const redactApiKeyLikeText = (text: string): string =>
  text.replace(API_KEY_PATTERN, '[redacted]');

export const sanitizeAnthropicError = (status: number, rawBody: string): string => {
  switch (status) {
    case 401:
      return 'Invalid API key. Check Settings.';
    case 403:
      return 'Anthropic rejected this request. Check your API key permissions.';
    case 429:
      return 'Rate limited. Wait a moment and try again.';
  }

  const trimmed = rawBody.trim();
  if (trimmed) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        const err = (parsed as { error?: { message?: unknown } }).error;
        if (typeof err?.message === 'string' && err.message.trim()) {
          return redactApiKeyLikeText(err.message.trim());
        }
      }
    } catch {
      /* fall through */
    }
  }

  return `AI import request failed (${status}).`;
};
