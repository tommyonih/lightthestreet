/* Supabase client, loaded on demand so the offline game never downloads it unless accounts are configured. */
import type { SupabaseClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the env vars are missing (local dev without a project, tests): every cloud feature then hides itself. */
export const cloudEnabled = (): boolean => !!(SB_URL && SB_KEY);

let client: Promise<SupabaseClient> | null = null;
export function sb(): Promise<SupabaseClient> {
  if (!cloudEnabled()) return Promise.reject(new Error('Supabase is not configured'));
  return client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(SB_URL!, SB_KEY!, {
    // PKCE: the Google redirect comes back with ?code=, which the client swaps for a session on load
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
}
