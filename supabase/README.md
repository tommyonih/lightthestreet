# Supabase backend

Optional accounts, cloud saves and street reports. Without the env vars the game runs exactly as before: offline, no accounts, and the account button hidden. In this repository the game shares NextPawa's Supabase project and existing `public.profiles` table.

## What's in the database

| Table | One row per | Holds |
|---|---|---|
| `profiles` | player | Existing NextPawa profile row plus `display_name` (created on first game sign-in if missing and synced from the in-game name) |
| `saves` | player | The whole `GameState` JSON, its `ver`, and `game_time` (day×1440+minute) |
| `reports` | finished session or week | Day, week, cash, blackouts, happiness, trust, full `stats`, and `card_path` to the share card |
| storage `cards` (private) | report | 1080×1350 PNG share cards at `{user_id}/{kind}-{timestamp}.png` |

**Row Level Security** is on for the game-owned tables and the bucket. Each policy is `auth.uid() = user_id`, so a player can only see and change their own saves, reports and cards. The migration adds permission for authenticated users to update `profiles.display_name` without revoking any existing permissions that the NextPawa application needs. Card images are private and are shown through hour-long signed URLs (`listReports()` in `src/net/cloud.ts`).

## Sync rules

- localStorage is still the live save. A signed-in player's save is pushed 10s after the last save, and immediately when the app goes to the background.
- At sign-in (and at boot, if a session exists) the cloud save is pulled. **The save that's further along in game time wins.** It's never swapped while a game is running.
- "Start fresh" deletes the cloud save as well.
- A report and its card are filed when a week rolls over and when you tap "Show my Street Report".

## Setup (one time)

1. In the existing NextPawa Supabase project, paste **only** `migrations/20261021000000_game_tables.sql` into **SQL Editor** and run it. It extends the existing `public.profiles` table. Do **not** run `20261018000000_init.sql` in this shared project: that file creates its own `profiles` table and is only for a separate, standalone game database. Do not use `supabase db push` with both files in the same migration folder.
2. **Game environment variables.** The parent app already uses `NUXT_ENV_SUPABASE_URL` and `NUXT_ENV_SUPABASE_ANON_KEY`; the game build forwards those values to Vite as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The build reads the root `.env.local` for local builds and uses the Netlify build environment in production. If the parent variables aren't configured, add the Vite-prefixed equivalents instead. Only use the public anon/publishable key—never `service_role`—and redeploy after changing environment variables.
3. **Redirect URLs.** In Supabase → Authentication → URL Configuration, keep the Site URL set to the main NextPawa origin and add these exact URLs to **Redirect URLs**:
   - `http://localhost:5173/game`
   - `https://nextpawa.com/game/app/`
4. **Email/password** is on by default. "Confirm email" is on too, so new players get a link before they can sign in. Leave it on for production.
5. **Google sign-in:**
   1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type *Web application*.
   2. Add the authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   3. In Supabase → Authentication → Providers → Google, turn it on and paste in the client ID and secret.

## Changing the schema

Add a new file in `migrations/` (`YYYYMMDDHHMMSS_what.sql`). Never edit a migration that's already been applied. Every new table needs RLS enabled and owner-only policies in the same migration. If the change is to `GameState`, the normal `SAVE_VERSION`/`migrate()` rule still applies: cloud saves go through `migrate()` when they're pulled.

`20261018000000_init.sql` is a standalone-project bootstrap, not part of the shared NextPawa schema. For a standalone game-only Supabase project, run that file instead of `20261021000000_game_tables.sql`; do not run both.
