# CLAUDE.md — Light Up the Street

A comedy survival sim about NEPA, prepaid meters, generators and neighbours, built as an installable phone-style web app. All money, units and tokens are fictional.

Read these before planning a feature:
- [docs/PLAN.md](docs/PLAN.md): features, screens, save schema, tech decisions, roadmap
- [docs/DESIGN.md](docs/DESIGN.md): look, feel, tone and UI rules

## Commands

```sh
npm run dev        # Vite dev server
npm test           # Vitest + jsdom: headless week-long play-throughs, balance checks, regressions
npm run typecheck  # tsc --noEmit (covers src/ AND tests/)
npm run build      # typecheck + production build to dist/ (this is what Vercel runs)
```

A change is done only when `npm test` and `npm run build` both pass. Deploys go out from `main` on Vercel (github.com/Marvellousabio/lightthestreet).

## Stack and hard rules

- Vanilla TypeScript, Vite, HTML/CSS, Canvas 2D and three.js for the 3D street. **No framework.** Runtime dependencies: `@supabase/supabase-js` and `three`, both loaded lazily (`three` only when the 3D view starts). Nothing outside `src/render3d/` may import `three`. Don't add a package without asking.
- The 2D street is a permanent fallback (no WebGL, slow phones, user choice). Every street feature must work in both views; the 3D view reads game state and reports taps through `streetHit()` in `ui/interact.ts`, it never changes game state itself.
- When Supabase is configured, an account is required to play (sign up / log in, or Google). Without it (tests, local dev with no `.env.local`) the game plays fully offline and signed out. `localStorage` is the live save; wrap every storage call in try/catch, as `src/core/state.ts` does.
- Inside nextpawa.com the game runs in an iframe at `/game/app/` (built by the parent repo's `scripts/build-game.mjs`). It shares the site's origin and Supabase session; Google sign-in navigates the top window and returns through the site's `/auth/callback` (`VITE_AUTH_RETURN`).
- Supabase (optional accounts, cloud save, reports) lives in `src/net/` and `supabase/`; see [supabase/README.md](supabase/README.md). `core/` and `game/` never import `net/`. Network code plugs in through hooks (`onSave`, `onWeekEnd`). Every cloud feature must no-op when `cloudEnabled()` is false (as in tests and local dev without `.env.local`).
- Schema changes go in a **new** file in `supabase/migrations/`. Every table gets RLS with owner-only policies in the same migration. Only the anon key goes in the client; never the service_role key.
- Offline-first PWA: `public/sw.js` caches the app shell. If you add a static asset the app needs offline, add it there and bump the cache name.
- `light-up-the-street.html` is the **legacy single-file version**. Don't edit it or port features back into it.

## Where things go

| Adding… | Put it in |
|---|---|
| Neighbours, dialogue, hustles, shop items, traits, backgrounds, achievements, routines, memory kinds | `src/data/content.ts` (data only, no logic) |
| A street event | append to `EVENTS` in `src/game/events.ts` |
| A meeting motion | append to `MOTIONS` in `src/game/meetings.ts`, with a stance for every neighbour |
| A weekly challenge | append to `CHALLENGES` in `src/game/challenges.ts` |
| Our products (NextPawa, Verispon, Tapmonie, Pressmonie) | names, taglines, real URLs and referral codes in `PARTNERS` (`src/data/content.ts`); real links only via `partnerLink()` in `game/economy.ts` (shows nothing until a URL is set). Online deals and escrow in `game/orders.ts`. Products are used with game money; real-world links stay labelled "separate & optional" |
| Net Baby / Local Baby birth roll, debt | `BIRTHS`, `DEBT_RATE` in `src/data/content.ts`; rules in `src/game/birth.ts`; the reveal screen in `src/ui/birthReveal.ts` |
| Billboard / banner ads for our products | copy in `ADS` (`src/data/content.ts`); artwork drawn by `src/render/ads.ts`; the product sheet is `src/ui/products.ts` |
| The city map (welcome background, Map tab) | `src/render3d/city.ts` (3D, lazy); on-screen control in `src/ui/cityMap.ts` |
| Account screens (sign up, log in, date of birth, reset) | `src/ui/account.ts`; Supabase calls in `src/net/auth.ts` |
| A place on the map | `PLACES` + a route in `PATHS` (`src/data/content.ts`); things to do there go in `PLACE_ACTIONS` in `src/game/world.ts`; its 3D set is a builder in `BUILD` (`src/render3d/sets.ts`) plus a layout in `SETS` (`src/render3d/space.ts`, tested) |
| Game rules or simulation | `src/game/` (one file per system; `sim.ts` owns `tick()`) |
| Shared types / state / save / audio / haptics | `src/core/` |
| Anything drawn on a canvas | `src/render/` (2D) and, for the 3D street, `src/render3d/` (layout maths without three.js go in `space.ts` so tests can cover them) |
| Supabase client, auth, cloud save/reports | `src/net/` (`supabase.ts`, `auth.ts`, `cloud.ts`) |
| Database tables, RLS, storage policies | `supabase/migrations/` |
| DOM UI: sheets, modals, HUD, phone apps | `src/ui/`. New phone apps go in `src/ui/phone.ts` (`Tab`, `APPS`, render map) |
| App-chrome icons | `src/ui/icons.ts`, used as `<i data-icon="name">` |
| Static markup for screens | `index.html` |
| Styles | `src/styles.css`, using the `:root` tokens |
| Tests | `tests/*.test.ts`, using `useHeadlessGame()` from `tests/harness.ts` |

Dependency direction: `data` → `core` → `game` → `render` → `net` → `ui` → `main.ts`. `src/game/` must not touch the DOM directly. It goes through `toast`, `openModal` and the HUD helpers, which the tests stub out.

## Changing game state (important)

- `G` in `src/core/state.ts` is the single live game state, and it is a live ES-module binding. Import it; never copy it.
- Adding or renaming a field in `GameState`:
  1. update `src/core/types.ts`
  2. give it a default in `freshState()`
  3. bump `SAVE_VERSION` and add an `if (s.ver < N)` step to `migrate()` so old saves keep working
  4. add a test that migrates an old-version save if the step does anything beyond setting defaults
- Scheduled times are **absolute game minutes** (`T()` = `day*1440 + minute`), never minute-of-day.
- Day stamps that mean "never" use `NEVER` (-99), not 0.

## Testing

- Test seams: `setModalDriver` (auto-answers modals), `setHeadless` (silences toasts), `setScreenGate`. Use them, not mocks of game modules.
- The balance tests check grid uptime, blackouts per day, meter safety and event frequency. If a balance change breaks them, either retune the change or explain why the threshold should move. Don't loosen a threshold silently.
- After changing anything in `src/render/` or `src/render3d/`, run the app (`npm run dev`) and look at it in both views (the 2D/3D button in the HUD). Tests don't check visuals, and headless Chrome renders WebGL in software, so frame rate must be checked on a real phone.

## Code style

- Match the surrounding code: compact, data-driven, short JSDoc on non-obvious fields, comments that explain *why*.
- Player-facing text is plain, short standard English with light humour, no Pidgin (see DESIGN.md → Voice). Code, comments and commit messages are in plain English too.
- Respect `SET.motion` (and `prefers-reduced-motion`) for any new animation or particle effect, and `SET.sound` for audio.
- Escape user-provided strings (player name) with `esc()` before putting them in HTML.

## Working style

- Work through the roadmap in PLAN.md one step at a time. Finish and verify a step before starting the next.
- Keep commits small and named for what they do. Don't commit or push unless asked.
- Update the README layout table and this file when you add a new folder or a new extension point.
