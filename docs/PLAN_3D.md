# 3D Plan: from one street to a neighbourhood you can walk

Goal: turn the side-on street into a small 3D neighbourhood with several places to visit. Players walk or take an okada between them, and a map tells them where to go. The simulation, tone and fictional economy stay the same. The world just gets bigger and you can walk around in it.

Read with [PLAN.md](PLAN.md) (features, save schema) and [GRAPHICS_PLAN.md](GRAPHICS_PLAN.md) (lighting goals, performance rules).

## Where we are, and what changes

| Today | In 3D |
|---|---|
| One side-on street, 860×470 Canvas 2D | Stylised low-poly 3D neighbourhood, WebGL |
| Neighbours are `porch`, `in` or `out` (off-screen) | `out` becomes a real place: the market, church, office, campus. You can go and find them there |
| Hustles are a timer and a job scene | Each hustle happens somewhere: POS at the junction, barbing at Skippo's shop, freelancing at the cyber café |
| Everything is one tap away | Places take game time to reach, so *where you are when NEPA strikes* matters |
| No navigation needed | A minimap, a full Map app, waypoints and a path on the ground guide the player |

**This changes a decision in GRAPHICS_PLAN.md.** That plan rejects photoreal 3D as too heavy for cheap Android phones. This plan stays inside that rule: flat-shaded low-poly art (think *Crossy Road* or *Townscaper*, warm Lagos colours), baked lighting and a fixed tilted camera. If we go ahead, 3D replaces GRAPHICS_PLAN Phases 2–5 (Pixi, environment art, character rigs). Phase 1 (the Canvas light map) is already done and becomes the 2D fallback.

## The neighbourhood (places)

Eight places at launch, laid out so the walk between them takes a few seconds and each one has a reason to visit.

```
                 ┌──────────┐         ┌────────────┐
                 │  CHURCH  │         │  CAMPUS &  │
                 │ (Sunday) │         │ CYBER CAFÉ │
                 └────┬─────┘         └─────┬──────┘
                      │                     │
 ┌────────┐     ┌─────┴─────────────────────┴─────┐     ┌──────────────┐
 │ MARKET │─────│            THE JUNCTION         │─────│ FUEL STATION │
 └────────┘     │   bus stop · POS stand · okada  │     └──────────────┘
                └───────┬──────────────────┬──────┘
                        │                  │
               ┌────────┴───────┐   ┌──────┴────────┐
               │  YOUR STREET   │   │  DisCo OFFICE │
               │ compound, porch│   │ (fictional)   │
               │ transformer    │   └───────────────┘
               │ Skippo's shop  │
               │ Mama K's stand │
               └────────────────┘
```

| Place | id | What you do there | Who you'll find (from `ROUTINES`) |
|---|---|---|---|
| Your street | `street` | Home: meter, gen, appliances, porch gist, transformer, meetings | Most neighbours on the porch; Skippo; Mama K |
| The Junction | `junction` | POS hustle, delivery pickups, okada/keke rank, hub to everywhere | Emeka "looking for work" |
| Market | `market` | Buy food (cheaper than Mama K, but you walk), lamp, power bank | Aunty Caro 7–10am "collecting gist" |
| Fuel station | `fuel` | Buy fuel. Queues and price spikes come from events | Random people, fuel-queue events |
| DisCo office | `disco` | Fix meter faults, complain about estimated billing, buy units over the counter when your phone is dead | Customer care who "will escalate" |
| Electronics & solar shop | `shop` (inside the market) | Inverter, solar, big gen, fridge | Aunty Solar on some days |
| Campus & cyber café | `campus` | Freelance hustle (they have a gen), charge your phone for a fee | Chidera at lectures, Tunde hunting hotspot |
| Church | `church` | Sunday morning only: mood, trust, gist | Landlord, Aunty Caro (front row), Papa Nnanna, Chairman |
| Chairman's office | (off-map) | Stays "out"; we only see him on the street | — |

Rules for places:
- **The street stays the heart.** The power sim, meetings and street fund all happen there. Other places add errands, choices and flavour.
- **Places unlock** as the story moves on (the intro only shows the street; the market and junction open on Day 1 afternoon; the DisCo office opens on your first meter fault). A locked place shows on the map as "??? — you never waka reach there".
- **Opening hours** match the joke: the DisCo office runs 9–4 on weekdays and "closes early on Friday"; the market runs 7–7.
- The shop phone app keeps working remotely (delivery fee + delay), so players who never want to travel can still play.

## Navigation and the map

The aim: a new player never wonders where to go or how to get there.

1. **Minimap** (top-right, under the HUD tiles). A north-up circle with your position, nearby neighbours as coloured dots, and an arrow at the edge pointing to the active waypoint. Tap it to open the full map.
2. **Map app** (new phone tab `map` in `ui/phone.ts`). A hand-drawn style 2D map of the neighbourhood, drawn on canvas from the same `PLACES` data:
   - each place shows its name, open/closed, and who's there right now (from `whereabouts()`)
   - tap a place: **Walk there** (free, takes game minutes), **Take okada** (₦, faster, rain makes it pricier) or **Set waypoint**
   - a search row: "Find Aunty Caro" → "She dey market till 10am" → Set waypoint
3. **Waypoints.** One active at a time. A glowing path appears on the ground (amber, the colour of light), a beacon over the target and a distance/time chip ("Market · 4 min waka"). It clears when you arrive.
4. **Guided "Go to" everywhere.** Any action that needs a place offers to take you there:
   - Hustle app: "Barbing — at Skippo's shop · Go there"
   - Tasks/objectives: "Buy fuel → Fuel station" with a Go button
   - Neighbour cards: "Chidera dey campus · Find am"
   - Events: "Fuel scarcity! Queue for fuel station don start" → waypoint
5. **Arrival.** A short place card slides in ("📍 The Junction: okada, POS, wahala"). The first visit gives a small fun boost and is logged in the feed.
6. **Street signs and landmarks** in the 3D world (painted signboards, the transformer, a big mango tree), so people can also learn the layout by sight.

Tap-to-walk is the main control: tap the ground and your character walks there along the path graph. A virtual joystick is optional (Settings), off by default. The camera is a fixed 3/4 view that follows the player, with pinch to zoom between two levels. No free orbit, because that is fiddly on phones.

## Gameplay changes (game logic, testable headlessly)

Travel only matters if it changes decisions. Keep it light:

- **Where you are matters during blackouts.** If you're away, you can't start the gen or switch off appliances (the meter keeps draining). You get a toast: "⚡ NEPA don take light — and you dey market! Your fridge dey suffer."
- **Errands take time.** Walking costs game minutes (the street to the junction is about 10 min, the market about 20). The okada is about 3× faster and costs ₦.
- **Hustles happen at places.** Starting a hustle walks you there, or offers an okada. While you work you are at that place.
- **Neighbours are findable.** You can greet and gist with anyone you meet, wherever you meet them. Some dialogue only happens away from home (Emeka at the junction pretending to have a job interview).
- **Meetings pull you home.** At 5:30pm on meeting day, a waypoint home appears. Missing the meeting = no vote and a memory hit with the chairman.
- **Tuning target:** a normal day has 1–3 trips. The existing balance tests (grid uptime, blackouts/day, meter safety) must still pass. New ones check that a "never leaves home" player can still finish a week and that travel doesn't push meter failures over the threshold.

## Architecture

The rule that keeps this safe: **3D is just another view.** Where the player is and where neighbours are lives in `src/game/`, as plain data, so the tests can play whole weeks without WebGL.

### New and changed modules

| Module | Role |
|---|---|
| `src/data/content.ts` | `PLACES` (id, name, blurb, unlock, hours, actions, 2D map position), `PATHS` (walk graph: node links with walk minutes), place ids on routine slots |
| `src/game/world.ts` | **New.** Player location, travel (`startTravel`, arrival on `tick()`), `travelTime(a,b,mode)`, `isOpen(place)`, unlocks, waypoint state. No DOM, no three.js |
| `src/game/schedule.ts` | `whereabouts()` returns a place id for `out` slots so neighbours appear at real places |
| `src/game/sim.ts` | Calls `worldTick()` |
| `src/game/actions.ts`, `jobs.ts`, `generator.ts` | Check `here('street')` for home-only actions; jobs get a `place` |
| `src/render3d/` | **New.** All three.js code, lazy-loaded: `scene.ts` (init, resize, render loop, quality tier), `world.ts` (builds places from data), `people.ts` (characters, animation), `lights.ts` (grid-on/off light states), `nav.ts` (path line, beacon, tap-to-walk), `pick.ts` (raycast → hit id) |
| `src/render/minimap.ts`, `src/render/mapView.ts` | **New.** Canvas 2D minimap and full map, drawn from `PLACES`. They work in both 2D and 3D modes |
| `src/render/street.ts` | Unchanged; becomes the **2D fallback** view of the street place |
| `src/ui/interact.ts` | Split the hit test from the handlers. Both renderers return a hit (`{ kind: 'npc', id }`, `'meter'`, `'gen'`, `'house'`, `'place-door'`) and the same handlers (`npcClick`, `genPanel`, …) run |
| `src/ui/phone.ts` | New `map` tab |
| `public/models/` | **New.** `.glb` assets per place, cached by `public/sw.js` (bump the cache name) |

Dependency direction stays `data → core → game → render/render3d → net → ui → main.ts`. `render3d` sits at the same level as `render`.

### Renderer choice

| Option | Size (gz) | Verdict |
|---|---|---|
| **three.js** (tree-shaken, lazy chunk) | ~150–180 kB | **Recommended.** Biggest community, glTF loader, instancing, works on WebGL1/2 |
| Babylon.js | ~500 kB+ | Too heavy for mobile data |
| Hand-written WebGL | 0 | Months of engine work; not worth it |

CLAUDE.md says no new packages without asking, so adding `three` (+ `@types/three` dev) is **decision #1** below. It loads only when the 3D view starts; the welcome screen, tests and 2D fallback never download it.

### Fallback and quality tiers

- **3D High / 3D Low / 2D Classic**, picked automatically (WebGL support, `deviceMemory`, a 2-second frame-time probe) and changeable in Settings.
- 2D Classic: the current street renderer at the `street` place. Other places show as an illustrated card with the same actions, and travel is by Map only. The game stays fully playable, which also covers very old phones and `prefers-reduced-motion` users who want less movement.

### Save schema

New `GameState` fields (bump `SAVE_VERSION` 6 → 7, add an `if (s.ver < 7)` step that sets defaults; old saves load at home):

| Field | Type | Meaning |
|---|---|---|
| `loc` | `PlaceId` | Where the player is (default `'street'`) |
| `trip` | `{ to: PlaceId; mode: 'walk' \| 'okada'; until: number } \| null` | Travel in progress; `until` is absolute game minutes |
| `visited` | `PlaceId[]` | For first-visit rewards and the map |
| `unlocked` | `PlaceId[]` | Places shown on the map |
| `waypoint` | `PlaceId \| string \| null` | Place id or `npc:<id>` |

Exact 3D position is **not** saved; you appear at the place's entrance after loading. That keeps saves small and the cloud save format barely changed.

## Art direction for 3D

- **Low-poly, flat-shaded, hand-tuned colours** from the existing palette (`HOUSES` walls/roofs, outfit colours). No textures except small canvas-generated ones: outfit patterns (`ankara` triangles, `adire` dots, `asooke` stripes) reuse the pattern code in `render/paint.ts` as `CanvasTexture`s.
- **Lighting is the game.** Bake two light states per place (grid on / grid off) as vertex colours or lightmaps and blend between them. Add a few real dynamic lights: your gen glow, a phone torch, the fixed streetlight. Windows and bulbs are emissive and go dark on blackout with the flicker from Phase 1.
- **Day/night** reuses `timeLook()` from `render/sky.ts` for sky, fog and ambient colour. Rain and lightning reuse the weather state.
- **Characters:** one shared low-poly body with skinned animations (idle, walk, sit, talk, fan-self, cheer, hiss), and hair meshes, skin tones and outfit materials swapped from `content.ts` data so the creator, neighbours and share card all match.
- **Props that make it Lagos:** overhead wire tangles, a rusty transformer, prepaid meters on walls, a yellow keke and okadas passing, kiosk canopies, plastic chairs, a gutter with slabs, fictional signboards ("Mama K Correct Food", "Skippo Cutz").
- Budget: ≤ 3 MB first load (street + junction), each other place ≤ 600 kB, loaded the first time you head there.

## Performance rules

Same rules as GRAPHICS_PLAN.md, with 3D-specific limits:
- 30fps minimum on a ~₦150k Android at 3D Low; 60fps on mid-range at 3D High.
- ≤ 120 draw calls (instancing for chairs, wires, poles, crowds); ≤ 80k triangles visible.
- Only the current place and its neighbours are in the scene; the rest are unloaded.
- DPR capped at 1.5 (Low) / 2 (High); shadows are blob decals, not shadow maps, on Low.
- Stop rendering when the tab is hidden, a modal covers the view, or the phone sheet is fully open.
- Respect `SET.motion`: camera follow becomes a cut, ambient particles are off.

## Phases

Do them in order; each one ships on its own and is verified (`npm test`, `npm run build`, looked at on a real phone) before the next.

### Phase 0: Decisions and spike · ✓ mostly done
- Decisions 1, 2 and 6 agreed: add `three` (0.186), keep 2D Classic, 3D replaces GRAPHICS_PLAN Phases 2–5.
- Bundle measured: the 3D chunk is 155 kB gzipped (inside the 150–180 kB estimate); the main bundle is unchanged at 63 kB.
- **Still open:** frame rate on a real mid-range and a cheap Android. Headless Chrome renders WebGL in software, so it can't answer this. The in-game probe (`onSlow`) drops auto-mode players to 2D if frames average over 50ms.

### Phase 1: Places and travel in the sim (no 3D yet) · ✓ done

Shipped as planned, with these differences: the Map app is inline SVG in `ui/map.ts` (crisp, tappable, no canvas code), not `render/mapView.ts`; Map replaced Week on the tab bar (Week is still in Apps); `waypoint` is left for Phase 2 and its own save bump. The POS, sewing and laptop stalls left the 2D street since that work now happens at the junction, market and campus.
- `PLACES`, `PATHS`, place ids on routines in `content.ts`; `game/world.ts`; save v7 + migration test.
- Home-only actions check `loc`; hustles get places; meetings pull you home.
- **2D Classic gets the Map app and place cards.** The whole feature is playable before any 3D exists.
- Tests: travel timing, unlocks, opening hours, "never leaves home" week, balance suite still green.
- Done when: a headless player can spend a week moving between places and every balance test passes.

### Phase 2: Map and guidance · ✓ done

Shipped: waypoints (`G.waypoint`, save v8; a place or `npc:<id>` that follows the neighbour, cleared on arrival), SVG minimap in the corner of the street view, waypoint bar with Go/Okada, a guide line on both maps, 📌 on every Map row, "Find am" in People, shortcut buttons on tutorial tasks, and two event nudges (fuel runs out → Fuel Station; meeting reminder → home). Not done yet: the human play-test below.
- `render/mapView.ts` (full map) and `render/minimap.ts`; waypoints; "Go to" buttons in Hustle, Tasks, neighbour cards and events; arrival cards.
- Done when: a first-time tester completes the Day 1 objectives without asking where anything is.

### Phase 3: 3D foundation · ✓ built, awaiting a real-phone check
- `src/render3d/` with three.js lazy-loaded; quality tier detection; 2D fallback switch.
- Street built from code (boxes and planes, current colours), fixed follow camera, tap-to-walk on the path graph, raycast picking wired to the existing handlers.
- Grid-on/off lighting and day/night from `timeLook()`.
- Done when: the street plays fully in 3D at 30fps+ on the test phone, and switching to 2D Classic gives the same game.

Shipped: street, houses, wires, transformer, streetlight, trees and far skyline from code; people from the creator's skin/hair/outfit data with walk and work animations; day/night and blackout flicker (shared `lampLevel()`), your gen with smoke, rain streaks, wet road, lightning; tap picking into the same panels as 2D; tap-to-walk; follow camera with pinch/wheel zoom; quality tiers (low: no AA, DPR 1.25, no shadow maps, 30fps cap; high: AA, DPR 2, sun shadows); `SET.view` auto/3D/2D with a HUD toggle and a slow-frame fallback. Differences: tap-to-walk is a clamped walk across the yard rather than a path graph (one street doesn't need one; the graph comes with Phase 4's places); the barber and content-creator stall props aren't modelled yet, only the work pose and a progress tag.

### Phase 4: The other places · 1–2 weeks (art-bound)
- Junction, market, fuel station, DisCo office, campus, church, built as `.glb` (Blender, low-poly) or from code for simple ones.
- Neighbours walk to their routine places; ambient crowd at the market and junction; okada ride as a short animated hop.
- Path line, beacon and minimap arrow in 3D. Signboards and landmarks.
- Done when: every place is reachable on foot and by okada, and neighbours are where `whereabouts()` says.

### Phase 5: Characters and life · 1–2 weeks (art-bound)
- Shared rigged body, animations, expressions from mood and memory (grudge = side-eye), outfit textures.
- Creator preview and share card use the 3D character (rendered to a canvas snapshot).

### Phase 6: Juice and polish · 1 week
- Blackout moment in 3D (whole area goes dark, other streets' lights in the distance go too), "Up NEPA!" celebration with neighbours cheering, gen smoke catching light, rain puddles reflecting bulbs.
- Camera nudges to events; place-specific ambient sound (market noise, gen hum louder near the station) using WebAudio, respecting `SET.sound`.

Rough total: **6–9 weeks** solo, of which about 3 weeks depend on art.

## Testing

- Game logic (Phase 1–2) is covered by Vitest headlessly, like everything else. `render3d/` is never imported by tests; three.js is a lazy chunk.
- Pure helpers in `render3d/nav.ts` (path-finding over `PATHS`, nearest node to a tap) are written without three.js types so they can be unit-tested.
- Extend the screenshot test (`tests/zz-shots.test.ts`) for the 2D map and minimap. 3D visuals are checked by eye on a real phone each phase; an automated WebGL snapshot needs a headless browser package, which would be a separate ask.
- Manual check each phase: low-end Android, iPhone Safari, desktop phone frame, offline after first load.

## Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | Add `three` as a dependency (lazy-loaded) | Yes, after the Phase 0 spike shows it runs well on a cheap phone |
| 2 | Keep 2D Classic as a permanent mode | Yes: the fallback for weak phones, and it keeps the game playable while 3D is built |
| 3 | Art source for `.glb` places and characters | Build the street from code first; commission or model the rest in Blender in one consistent low-poly style |
| 4 | How far travel changes the game | Light: 1–3 trips a day, remote shop delivery always available, so travel is a choice and never a chore |
| 5 | Controls | Tap-to-walk + fixed follow camera; joystick optional in Settings |
| 6 | Does 3D replace GRAPHICS_PLAN Phases 2–5 (Pixi) | Yes, to avoid building two new renderers |

## Doc updates when this starts

- [PLAN.md](PLAN.md): add places/travel to Features, the `map` tab to Screens, the v7 fields to the save schema, and three.js to Tech stack decisions.
- [DESIGN.md](DESIGN.md) → Art: low-poly 3D direction, asset budget, 2D Classic fallback.
- [GRAPHICS_PLAN.md](GRAPHICS_PLAN.md): mark Phases 2–5 as replaced by this plan.
- [CLAUDE.md](../CLAUDE.md) and the README layout table: `src/render3d/`, `public/models/`, `PLACES`/`PATHS` in "Where things go", and `game/world.ts`.
