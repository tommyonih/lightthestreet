# Project Plan — Light Up the Street

## Pitch

You've just moved onto a Lagos-style street. NEPA takes the light whenever it likes. Keep your meter topped up, your generator fuelled, your phone charged and your belly full, and stay on good terms with the neighbours who share your compound, your gist and your street fund. It's a comedy survival sim for phones, playable in short sessions, and every currency in it is fictional.

**Audience:** 18+ (age gate on start), mainly Nigerian and diaspora players who will recognise the jokes.
**Platform:** mobile web, installable as a PWA, with a phone-sized window on desktop.
**Quality bar:** feel like a polished native life-sim app (reference: *LagosLife*), not a web toy.

## Features

### Shipped
| Area | What it does | Code |
|---|---|---|
| Power sim | Grid flips on/off, prepaid meter drain, generator (fuel, condition, noise), solar/inverter, power bank, appliances | `game/sim.ts`, `game/generator.ts`, `game/economy.ts` |
| Needs | Happiness, hunger, fun, phone battery. Eat and sleep actions | `game/sim.ts`, `game/actions.ts` |
| Character | Name, gender, skin, hair, outfit, traits, background (sets starting cash/gear) | `ui/creator.ts`, `data/content.ts` |
| Hustles | Timed jobs with cooldowns; some need power or phone | `game/jobs.ts`, `render/jobScene.ts` |
| Neighbours | Schedules (porch / out / indoors), relationship score, memory of favours and grudges | `game/schedule.ts`, `game/memory.ts` |
| Street events | Random events with cooldowns | `game/events.ts` |
| Street fund | Shared transformer fund, who's owing, who's paid | `game/fund.ts` |
| Meetings | Periodic street meetings; motions, neighbour stances, voting, policies that change the sim | `game/meetings.ts` |
| Weekly challenges | Drawn per week, `count` or `end` judged, history kept | `game/challenges.ts` |
| Progress | Objectives, achievements, intro sequence with scripted first blackout | `game/progress.ts`, `game/intro.ts` |
| Share | 1080×1350 session/week card, copy summary | `render/shareCard.ts`, `ui/share.ts` |
| App shell | PWA, offline, splash, install prompt, tab bar, bottom sheets, haptics, street feed | `ui/shell.ts`, `ui/phone.ts`, `public/` |
| Places & travel | Neighbourhood map (street, junction, market, fuel station, campus, DisCo office, church), walk/okada trips, opening hours, unlocks, hustles at places, gen/appliances only at home, shop delivery fee | `game/world.ts`, `ui/map.ts` |
| Accounts (optional) | Supabase auth (email/password + Google), cloud save sync, session/week reports with share cards | `net/`, `ui/account.ts`, `supabase/` |

### Roadmap (Phase 2, in order)
1. **Feels like a real phone app** — ✓ mostly done (shell, PWA, tab bar, sheets, haptics). Remaining: screen transitions polish, card/icon consistency pass.
2. **Better visuals and art.** Sprite-quality street, idle animations, day/night lighting, weather effects, character expressions. Full plan: [GRAPHICS_PLAN.md](GRAPHICS_PLAN.md).
   - *Proposed alternative:* a low-poly 3D neighbourhood with several places and map navigation, which would replace Phases 2–5 of the graphics plan. See [PLAN_3D.md](PLAN_3D.md).
3. **Deeper life simulation.** Careers (hustles → jobs with levels), relationships, rent and bills, health, life timeline, stats dashboard, full event log.

Not planned for now: progression/retention systems (streaks, daily rewards), multiplayer, real money. Next backend step when wanted: a report-history screen built on `listReports()`.

## Screens

| Screen | id | Purpose |
|---|---|---|
| Welcome | `scr-welcome` | Play / Continue / How to play / sound |
| Age gate | `scr-age` | 18+ check |
| Rules | `scr-rules` | How to play |
| Creator | `scr-create` | Build your character, live canvas preview |
| Game | `scr-game` | HUD tiles, street canvas, action bar, street feed, tab bar |
| Results | `scr-results` | Street Report, share, resume, new game |

In-game phone (bottom sheet), tabs in `ui/phone.ts`:
- **Tab bar:** Home (closes the sheet), Meter, People, Map, Apps
- **Apps grid:** Meter, Power, People, Map, Week, Wallet, Shop, Hustle, Gist, Tasks

Away from home, a place card (`#placeCard`) covers the street view: who's there, what to do, and the way home.

Overlays: modal (`ui/modal.ts`), toasts (`ui/toast.ts`), share sheet, splash.

## Data model (save schema)

The whole game is one JSON object saved to `localStorage`. Signed-in players also get a copy in Supabase (`profiles`, `saves`, `reports` tables and a private `cards` bucket, all owner-only via RLS); details in [supabase/README.md](../supabase/README.md).

| Key | Contents |
|---|---|
| `luts_save_v1` | `GameState` (versioned by `ver`, currently `SAVE_VERSION = 8`) |
| `luts_settings` | `Settings { sound, motion }`, kept separate so toggles never touch the save |

`GameState` (full definition: `src/core/types.ts`), grouped:

- **Identity:** `name, gender, skin, hair, outfit, traits[], bg`
- **Clock and world:** `day, minute, weather, temp, gridOn, nextFlip, flashUntil, lastEvent`
- **Power gear:** `meterUnits, meterNo, pendingCredit, fuel, gen, genCond, genOn, solar, inverter, invCharge, powerbank, pbankCharges, lamp, fridgeEff, fanRecharge, fanBat`
- **Appliances:** `fanOn, tvOn, fridgeOn`
- **Needs:** `happiness, hunger, fun, phone, noise, lastFoodDay`
- **Money:** `cash, hustleCd{}, job: Job | null`
- **Street:** `trust, fund, fundGoal, owing[], youPaid, streetlightFixed`
- **Neighbours:** `npcs: NpcState[]` (`rel, owing, paid, met, greetDay, dashDay, mem[], favourDay, grudgeDay, coldUntil`)
- **World:** `loc, trip, visited[], unlocked[]` (v7), `waypoint` (v8)
- **Civics:** `policies: Policies, meetings: MeetingRecord[], nextMeetingDay`
- **Weeks:** `week: WeekState, weekHistory[]`
- **Progress:** `stats: Stats, obj: Objective[], ach[], log[], intro, introT, flags, evCd{}`

Rules:
- Every schema change bumps `SAVE_VERSION` and adds a `migrate()` step. Old saves must always load.
- Times are absolute game minutes (`day*1440 + minute`).
- Static content (neighbour definitions, items, text) lives in `data/content.ts`. The save stores only ids and per-player state.

## Tech stack decisions

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict` | Large state object; types catch save/schema mistakes |
| Framework | None (vanilla DOM + Canvas 2D) | Small bundle, fast on cheap Android phones, full control of rendering |
| 3D street | three.js, lazy chunk (~155 kB gz), 2D Classic kept as fallback | WebGL scene graph without writing an engine; loads only for players in 3D mode ([PLAN_3D.md](PLAN_3D.md)) |
| Build | Vite 5 | Fast dev server, simple static output |
| Tests | Vitest + jsdom | Run the real markup headlessly; scripted players play full weeks for balance |
| Storage | `localStorage` | Works offline, enough for one save |
| Backend | Supabase (Postgres + Auth + Storage), optional | Cloud save and accounts with no server code; RLS keeps each player's data private; client is a lazy chunk |
| Offline/install | Hand-written service worker + web manifest | No plugin dependency; we control the cache |
| Hosting | Vercel, static, deploys from `main` | Zero config |
| Fonts | Nunito via Google Fonts, system fallback | Friendly, rounded, heavy weights read well small |
| Audio | WebAudio tones generated in code | No asset files to download |

Revisit only if saves outgrow localStorage (→ IndexedDB), or a feature needs trusted server logic such as leaderboards (→ Supabase Edge Functions; a client can't be trusted to report its own score).
