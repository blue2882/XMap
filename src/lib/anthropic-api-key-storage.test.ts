import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@/domain/schemas';
import {
  ANTHROPIC_API_KEY_SESSION_STORAGE_KEY,
  mergeSessionAnthropicApiKey,
  redactPersistedSettings,
  writeSessionAnthropicApiKey,
} from '@/lib/anthropic-api-key-storage';

const baseSettings = (): Settings => ({
  theme: 'system',
  anthropicApiKey: 'sk-ant-test-key',
  anthropicApiKeySessionOnly: false,
});

describe('anthropic-api-key-storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    });
  });

  it('redacts persisted key when session-only is enabled', () => {
    const settings = { ...baseSettings(), anthropicApiKeySessionOnly: true };
    expect(redactPersistedSettings(settings).anthropicApiKey).toBe('');
  });

  it('merges session key after rehydrate', () => {
    writeSessionAnthropicApiKey('sk-ant-from-session');
    const merged = mergeSessionAnthropicApiKey({
      ...baseSettings(),
      anthropicApiKey: '',
      anthropicApiKeySessionOnly: true,
    });
    expect(merged.anthropicApiKey).toBe('sk-ant-from-session');
    expect(sessionStorage.getItem(ANTHROPIC_API_KEY_SESSION_STORAGE_KEY)).toBe('sk-ant-from-session');
  });
});
