import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_ENV_HINT =
  'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).';

const readSupabaseEnv = (): { url: string; anonKey: string } | null => {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url && anonKey) return { url, anonKey };
  return null;
};

const env = readSupabaseEnv();

if (!env && import.meta.env.DEV && import.meta.env.MODE !== 'test') {
  throw new Error(`Supabase is not configured. ${SUPABASE_ENV_HINT}`);
}

export const isSupabaseConfigured = env !== null;

const supabaseUrl = env?.url ?? 'http://127.0.0.1:54321';
const supabaseAnonKey = env?.anonKey ?? 'supabase-not-configured';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/** OAuth / email links must include Vite `base` (e.g. `/XMap/` on GitHub Pages). */
export const getAuthRedirectUrl = (): string =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;

export const supabaseConfigMessage = SUPABASE_ENV_HINT;

export const supabaseDeployConfigMessage =
  'Cloud sync not configured—set VITE_SUPABASE_* in deploy secrets.';

/** Production builds without Supabase env vars (GitHub Pages secrets, etc.). */
export const isCloudSyncDisabledInThisBuild = !isSupabaseConfigured && import.meta.env.PROD;

