import type { ChangeEvent } from 'react';
import { ArrowLeft, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/ui/icon-button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ThemePreference } from '@/domain/schemas';
import { cn } from '@/lib/utils';
import { isCloudSyncDisabledInThisBuild, supabaseDeployConfigMessage } from '@/lib/supabase';
import { useLibraryStore } from '@/stores/library-store';

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const settings = useLibraryStore((s) => s.settings);
  const setTheme = useLibraryStore((s) => s.setTheme);
  const updateSettings = useLibraryStore((s) => s.updateSettings);

  const handleThemeSelect = (value: ThemePreference) => {
    setTheme(value);
  };

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateSettings({ anthropicApiKey: event.target.value });
  };

  const handleSessionOnlyChange = (checked: boolean) => {
    updateSettings({ anthropicApiKeySessionOnly: checked });
  };

  return (
    <div className="h-full overflow-y-auto pt-[clamp(20px,4vh,44px)] pb-12">
      <div className="mx-auto grid w-full max-w-180 grid-cols-1 gap-6 px-1 sm:px-0">
        <header className="flex items-center gap-3">
          <IconButton label="Back to library" variant="default" asChild>
            <Link to="/">
              <ArrowLeft />
            </Link>
          </IconButton>
          <h1 className="type-page">Settings</h1>
        </header>
        {isCloudSyncDisabledInThisBuild ? (
          <div
            role="status"
            className="rounded-xl border border-line bg-sunken px-4 py-3 text-sm text-ink"
          >
            {supabaseDeployConfigMessage}
          </div>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Theme preference is stored on this device only.</CardDescription>
          </CardHeader>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1"
          >
            {THEMES.map(({ value, label, icon: Icon }) => {
              const active = settings.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleThemeSelect(value)}
                  className={cn(
                    'flex min-h-9.5 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,box-shadow,color] duration-150',
                    active
                      ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(20_22_40/0.14),0_0_0_1px_var(--color-line)]'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI import</CardTitle>
            <CardDescription>
              Used locally for AI deck import. Sent only to Anthropic when you run AI import. There
              is no server-side vault in this app — anyone with access to this browser profile or
              device backup can read a saved key from local storage.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key">Anthropic API key</Label>
              <Input
                id="api-key"
                type="password"
                autoComplete="off"
                placeholder="sk-ant-..."
                value={settings.anthropicApiKey}
                onChange={handleApiKeyChange}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="api-key-session">Session-only key storage</Label>
                <p className="text-sm text-muted">
                  When enabled, your key is kept in this tab&apos;s session storage and is not written
                  into the library IndexedDB blob. You will need to re-enter it after closing the
                  browser.
                </p>
              </div>
              <Switch
                id="api-key-session"
                checked={settings.anthropicApiKeySessionOnly}
                onCheckedChange={handleSessionOnlyChange}
                aria-label="Store API key for this session only"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
