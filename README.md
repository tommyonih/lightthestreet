# Light Up the Street

A comedy survival sim about NEPA, prepaid meters, generators and neighbours. All money, units and tokens are fictional.

## Run it

```sh
npm install
npm run dev        # local dev server with hot reload
npm test           # headless balance play-throughs + regression tests
npm run build      # typecheck + production build into dist/
```

Project plan and roadmap: [docs/PLAN.md](docs/PLAN.md). Design rules: [docs/DESIGN.md](docs/DESIGN.md). Instructions for Claude Code: [CLAUDE.md](CLAUDE.md).

## Layout

| Folder | What lives there |
|---|---|
| `src/data/content.ts` | All content: neighbours, dialogue, hustles, shop, traits, backgrounds, achievements |
| `src/core/` | Utilities, types, game state + save/migration, audio |
| `src/game/sim.ts` | Clock, NEPA engine, meter, generator, batteries, needs — `tick()` |
| `src/game/events.ts` | Street events. Add one by appending to `EVENTS` |
| `src/game/schedule.ts` | Where each neighbour is right now. Routines live in `ROUTINES` in content |
| `src/game/memory.ts` | What neighbours remember (`MEMORY` in content), favours and grudges per neighbour |
| `src/game/challenges.ts` | Weekly challenges. Add one by appending to `CHALLENGES` (`count` finishes on the spot, `end` is judged at week end) |
| `src/render/shareCard.ts` | The 1080×1350 shareable card (session and week versions) |
| `src/game/world.ts` | Places and travel: where you are, walk/okada trips, opening hours, unlocks, place actions (`PLACE_ACTIONS`). Places and routes are `PLACES`/`PATHS` in content |
| `src/game/meetings.ts` | Street meetings and voting. Add a motion by appending to `MOTIONS` (give each neighbour a stance) |
| `src/game/` | Economy, generator, street fund, intro, eat/sleep actions |
| `src/render/` | Canvas street scene and character preview (the 2D Classic view) |
| `src/render3d/` | The 3D street (three.js, one lazy chunk): `scene.ts` loop/camera/lighting/picking, `world3d.ts` geometry, `people.ts` figures, `kit.ts` code-drawn textures, `space.ts` pure layout maths shared with tests |
| `src/ui/view.ts` | Picks 2D or 3D (`SET.view`), lazy-loads the 3D chunk, falls back to 2D if WebGL is missing or frames are slow |
| `src/ui/` | Modal, toast, HUD + street feed, phone apps (bottom sheet + tab bar), street clicks, screens, creator, results |
| `src/ui/map.ts` | Map app (SVG from `PLACES`/`PATHS`) and the place card that covers the street while you're out |
| `src/ui/shell.ts` | App behaviour: splash, service worker, install prompt, haptics, sheet swipe-to-close |
| `src/ui/icons.ts` | SVG line icons for the app chrome (`<i data-icon="name">` in markup) |
| `src/net/` | Optional Supabase backend: client, auth (email + Google), cloud save sync, reports. Setup: `supabase/README.md` |
| `supabase/migrations/` | Database tables, Row Level Security, storage bucket |
| `public/` | PWA manifest, offline service worker (`sw.js`), icons. Regenerate icons with `node scripts/make-icons.mjs` |
| `tests/` | Simulation tests (a scripted player runs a week per background) and a boot smoke test |

## Balance knobs

- `GRID`, `STEP`, `EVENT_CHANCE`, `applianceDrain()` in `src/game/sim.ts`
- `DRAIN_GEN` in `src/game/generator.ts`
- Hustle pay and cooldowns, shop prices in `src/data/content.ts`

Run `npm test` after changing them. The balance tests check grid uptime, blackouts per day, meter safety and event frequency.
