import type { Settings } from '@/domain/schemas';

export const ANTHROPIC_API_KEY_SESSION_STORAGE_KEY = 'mindmaps.settings.anthropic-api-key.session';

export const readSessionAnthropicApiKey = (): string => {
  try {
    return sessionStorage.getItem(ANTHROPIC_API_KEY_SESSION_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

export const writeSessionAnthropicApiKey = (key: string): void => {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      sessionStorage.setItem(ANTHROPIC_API_KEY_SESSION_STORAGE_KEY, trimmed);
    } else {
      sessionStorage.removeItem(ANTHROPIC_API_KEY_SESSION_STORAGE_KEY);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
};

/** Strip persisted API key when session-only mode is enabled. */
export const redactPersistedSettings = (settings: Settings): Settings => {
  if (!settings.anthropicApiKeySessionOnly) return settings;
  return { ...settings, anthropicApiKey: '' };
};

/** Merge session-stored key after loading library settings from disk. */
export const mergeSessionAnthropicApiKey = (settings: Settings): Settings => {
  if (!settings.anthropicApiKeySessionOnly) return settings;
  return { ...settings, anthropicApiKey: readSessionAnthropicApiKey() };
};

export const syncAnthropicApiKeySideStorage = (before: Settings, after: Settings): void => {
  if (after.anthropicApiKeySessionOnly) {
    writeSessionAnthropicApiKey(after.anthropicApiKey);
    return;
  }
  if (before.anthropicApiKeySessionOnly && !after.anthropicApiKeySessionOnly) {
    writeSessionAnthropicApiKey('');
  }
};
