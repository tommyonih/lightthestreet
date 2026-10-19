interface ImportMetaEnv {
  /** Supabase project URL. Leave unset to run fully offline with no accounts. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key. Safe in the client: Row Level Security does the protecting. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
