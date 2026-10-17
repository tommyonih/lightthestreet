# Light Up the Street

A comedy survival sim about NEPA, prepaid meters, generators and neighbours. All money, units and tokens are fictional.

## Run it

```sh
npm install
npm run dev        # local dev server with hot reload
npm test           # headless balance play-throughs + regression tests
npm run build      # typecheck + production build into dist/
```

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
| `src/game/meetings.ts` | Street meetings and voting. Add a motion by appending to `MOTIONS` (give each neighbour a stance) |
| `src/game/` | Economy, generator, street fund, intro, eat/sleep actions |
| `src/render/` | Canvas street scene and character preview |
| `src/ui/` | Modal, toast, HUD, phone apps, street clicks, screens, creator, results |
| `tests/` | Simulation tests (a scripted player runs a week per background) and a boot smoke test |

## Balance knobs

- `GRID`, `STEP`, `EVENT_CHANCE`, `applianceDrain()` in `src/game/sim.ts`
- `DRAIN_GEN` in `src/game/generator.ts`
- Hustle pay and cooldowns, shop prices in `src/data/content.ts`

Run `npm test` after changing them. The balance tests check grid uptime, blackouts per day, meter safety and event frequency.
