import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Same project the previous static app wrote to. Publishable key is safe in the browser; RLS is the boundary. */
const DEFAULT_SUPABASE_URL = 'https://mvkavyeptcatpteuzpbg.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_Zyw8kNPadT5DJVgfIR9iAg_2o00OZrU';

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
