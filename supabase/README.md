# Supabase backend

Optional accounts, cloud saves and street reports. Without the env vars the game runs exactly as before: offline, no accounts, and the account button hidden.

## What's in the database

| Table | One row per | Holds |
|---|---|---|
| `profiles` | player | `display_name` (synced from the in-game name), `email` (copied from auth). Created by a trigger on sign-up |
| `saves` | player | The whole `GameState` JSON, its `ver`, and `game_time` (day×1440+minute) |
| `reports` | finished session or week | Day, week, cash, blackouts, happiness, trust, full `stats`, and `card_path` to the share card |
| storage `cards` (private) | report | 1080×1350 PNG share cards at `{user_id}/{kind}-{timestamp}.png` |

**Row Level Security** is on for every table and the bucket. Each policy is `auth.uid() = user_id` (or `= id`), so a player can only see and change their own rows. The only `profiles` column clients can update is `display_name`. Card images are private and are shown through hour-long signed URLs (`listReports()` in `src/net/cloud.ts`).

## Sync rules

- localStorage is still the live save. A signed-in player's save is pushed 10s after the last save, and immediately when the app goes to the background.
- At sign-in (and at boot, if a session exists) the cloud save is pulled. **The save that's further along in game time wins.** It's never swapped while a game is running.
- "Start fresh" deletes the cloud save as well.
- A report and its card are filed when a week rolls over and when you tap "Show my Street Report".

## Setup (one time)

1. **Create a project** at [supabase.com](https://supabase.com/dashboard).
2. **Run the migration.** Paste `migrations/20261018000000_init.sql` into **SQL Editor** and run it. Or with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Env vars.** Copy `.env.example` to `.env.local` and fill in the URL and the **anon** key (Project Settings → API). Never use the `service_role` key in the app. Add the same two vars in **Vercel → Settings → Environment Variables** and redeploy (Vite bakes them in at build time).
4. **Redirect URLs.** In Authentication → URL Configuration, set **Site URL** to your Vercel URL and add these to **Redirect URLs**:
   - `http://localhost:5173/`
   - `https://<your-app>.vercel.app/`
5. **Email/password** is on by default. "Confirm email" is on too, so new players get a link before they can sign in. Leave it on for production.
6. **Google sign-in:**
   1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type *Web application*.
   2. Add the authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   3. In Supabase → Authentication → Providers → Google, turn it on and paste in the client ID and secret.

## Changing the schema

Add a new file in `migrations/` (`YYYYMMDDHHMMSS_what.sql`). Never edit a migration that's already been applied. Every new table needs RLS enabled and owner-only policies in the same migration. If the change is to `GameState`, the normal `SAVE_VERSION`/`migrate()` rule still applies: cloud saves go through `migrate()` when they're pulled.
