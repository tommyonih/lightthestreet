# Graphics Plan: making the street look like a real game

Roadmap item 2 in [PLAN.md](PLAN.md). Goal: someone sees a screenshot and thinks "a studio made this", the way they would for a polished mobile life-sim like LagosLife.

## Where we are

Everything in `src/render/` is drawn live with Canvas 2D shapes:

| Thing | Today | Why it looks cheap |
|---|---|---|
| Houses | Flat rectangles, triangle roof, square windows | No texture, depth, wear or variety; all five are the same shape |
| People | Rounded rect body, circle head, line arms, dot eyes | No legs, no hands, one face, no real animation (just bobbing) |
| Day/night | 7 stepped sky colours, then a flat blue overlay at night | Jumps between colours; night only darkens everything evenly |
| Light | Radial gradients painted *on top* of the scene | Light doesn't actually light anything; darkness isn't removed where light falls |
| Weather | Straight rain lines, grey ellipse clouds | No splashes, puddles, wet look or lightning |
| Ground/road | Flat green and grey with a few dots | Doesn't read as a Nigerian street |
| Text | "GEN", "outdoor ✓ safe", "YOUR HOUSE" on the canvas | Debug-looking labels instead of art |

**What makes a game look "real":** lighting first, then consistent art, then motion. A plain scene with good lighting looks better than detailed art with flat lighting, and lighting is what this game is *about*.

## Target look

**Painted 2.5D, side-on.** Hand-painted illustrated art, as in high-end mobile sims. Soft shading, warm bulbs against a deep blue night, and a slight top-down tilt so you can see porches and the ground. We keep the current camera and the 860×470 logical space, so gameplay, tap targets and `npcAt()` don't change.

Not photoreal 3D. It would need a 3D artist pipeline, would run badly on the cheap Android phones the players have, and would take months for a solo project. Painted 2D with real lighting gets the "real game" feel for a fraction of the cost.

Mood references to collect into a moodboard before Phase 2:
- night streets in Lagos/Ibadan with a few lit windows during an outage
- generator smoke under a streetlight
- harmattan haze at dawn

## Decisions needed before Phase 2

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | Art style | Painted 2D (above) | Best realism per hour of work; works at phone size |
| 2 | Who makes the art | One illustrator for a style frame + key assets; fill the rest by editing/cleaning AI-assisted or stock pieces to match | Consistency is the hard part. A human-set style keeps it coherent |
| 3 | Renderer | **PixiJS v8** (WebGL), keeping the current Canvas renderer as a fallback | Sprites, blend modes, filters, light maps and thousands of particles at 60fps. Adds a dependency (~150 kB gz, lazy-loaded) |
| 4 | Download budget | ≤ 3 MB of art on first load, cached offline by the service worker | Players are on mobile data |

Until these are decided, Phase 1 needs none of them.

## Phases

Each phase ships on its own and looks better than the last. Do them in order.

### Phase 1: Canvas 2D quick wins (no new art, no new dependency) · ~3–4 days

Uses the renderer we have, so it lands fast and lets you judge the direction.

1. **Real light map.** Draw darkness into an offscreen canvas, cut light out of it (`destination-out` radial gradients for each bulb, window, streetlight, lamp and generator), then lay it over the scene. Lit areas look truly lit, and the dark around them gets darker. This is the biggest single upgrade.
2. **Smooth day/night.** Replace the 7 stepped sky colours with colours interpolated by minute, plus a matching tint for the whole scene: warm at dusk, blue-grey at night, golden in the morning.
3. **Blackout moment.** When NEPA takes light: bulbs flicker 2–3 times, then fade over about 0.4s, with a short "everything goes dark" dip. When light returns: a bright pop, then the "Up NEPA!" glow.
4. **Shadows and depth.** Soft contact shadows under houses, people and the generator; shading on the sides of houses; roofs drawn darker on one side; a slight blur and haze on the sky and far layer.
5. **Texture.** Procedural noise and grime on walls and road, cracked plaster, and a stained bottom edge where rain splashes up.
6. **Remove debug text.** Replace "GEN", "outdoor ✓ safe" and "YOUR HOUSE" with art: a stencil on the gen, and a small glowing marker or doormat for your house.
7. **Better rain.** Angled streaks with depth (near ones are faster and longer), splash rings on the ground, a darker wet road, lightning flashes that light the whole scene for a frame in storms.

Done when: the same street at 9pm with light vs. without light looks clearly different and moody, not just tinted.

### Phase 2: Renderer foundation (PixiJS) · ~4–5 days

1. Add PixiJS, lazy-loaded. If WebGL isn't available, fall back to the Phase 1 Canvas renderer.
2. Keep the public interface the same (`initRenderer`, `resize`, `toStreet`, `npcAt`, the jobScene painter), so nothing outside `src/render/` changes.
3. Scene layers, back to front: sky → far skyline → houses → props → people → front props → weather → **light map** → colour grade → screen effects.
4. Asset loading: texture atlases (`.webp` + JSON, @1x/@2x), a loading bar on the splash, and atlases added to the service worker cache.
5. Quality tiers (Low/Med/High), picked automatically from device speed and adjustable in settings. Low drops blur, halves particles and caps at 30fps.

Done when: the game looks identical to Phase 1 but runs on Pixi at 60fps on a mid-range Android, and the fallback still works.

### Phase 3: Lighting and atmosphere (real) · ~4 days

1. **Light sprites.** Each light (bulb, window, streetlight, lantern, phone torch, generator, TV flicker) is a soft sprite drawn additively into a light texture, which is multiplied over the scene. Lights have colour: bulbs warm, TV blue, phone cool white, gen orange.
2. **Emissive art.** Windows, bulbs and screens have "on" versions that glow even in full dark.
3. **Colour grading** by time and weather, using a colour matrix: dusty golden harmattan mornings, washed-out grey rain, a blue night.
4. **Atmosphere.** Generator smoke that catches light, heat shimmer when `hot`, a moth swarm around the streetlight, fireflies, dust when someone walks or an okada passes.
5. **New weather: harmattan.** Haze, low contrast, a pale sun. (This is a new weather state, so it needs a `GameState` change: bump `SAVE_VERSION`.)

### Phase 4: Environment art · ~1–2 weeks (art-bound)

Replace the boxes with painted, varied buildings and street props that people recognise:

- **Buildings:** bungalow, face-me-I-face-you, one-storey with balcony, and the player's house with upgrades that show (solar panels, inverter box, fixed streetlight). Each has a lit and an unlit version.
- **Street:** a tangle of overhead wires, a wooden pole with a rusty transformer, prepaid meters on walls, a water tank, a satellite dish, a gate and fence, a gutter with slab, a kiosk with a canopy, a mango tree, a plastic chair, a bench, fictional signboards and posters.
- **Traffic:** okada and keke passing on the road (just looks), with headlights at night.
- **Backdrop:** a parallax skyline with a mosque or church silhouette and other streets' lights, which also go out when the area's power goes.
- **Generators:** "I better pass my neighbour" small gen and a big gen, both with exhaust and shake.

### Phase 5: Characters · ~2 weeks (art-bound)

1. **Cut-out rigs:** separate painted parts (head, torso, arms, hands, legs, feet) joined at pivots. Parts swap, so all skins, hairs and outfits keep working without drawing every combination.
2. **Animations:** idle (breathing, weight shift), walk, sit on the porch, fan yourself in the heat, talk (mouth flaps during gist), work poses for each hustle, cheer ("Up NEPA!"), hiss/angry, phone-scrolling.
3. **Expressions:** happy, neutral, annoyed, shocked (at a blackout), sleepy. They come from happiness, `rel`, events and memory (`grudge` = side-eye).
4. **Outfits as textures:** real ankara, stripe and dot fabrics, not flat fills.
5. **Same rig** for the creator preview and the share card.

### Phase 6: Juice and polish · ~3 days

- A small camera move towards events (zoom in on a neighbour knocking, pan to the transformer when it blows); screen shake for thunder and transformer bangs.
- Coins and ₦ particles flying to the cash counter; meter digits that roll.
- Hover/tap highlight that outlines a neighbour or object.
- The share card is redrawn with the new art.

## Performance rules (apply to every phase)

- Target 60fps on a ~₦150k Android (around 3 GB RAM); never below 30fps on Low.
- Pause rendering when the tab is hidden or the street isn't on screen (the current code already skips frames off-screen).
- Cap device pixel ratio at 2; texture memory ≤ 64 MB.
- Every ambient effect respects `SET.motion` and `prefers-reduced-motion`.
- Art is `.webp` atlases, loaded by area. First load ≤ 3 MB.

## Testing

- Keep `tests/zz-render-jobs.test.ts` passing; game logic tests shouldn't notice any of this.
- Add visual snapshots: a dev-only script renders fixed scenes (day, dusk, night with light, night blackout, rain, harmattan) to PNGs so changes can be compared side by side.
- Check on a real low-end Android every phase, not just desktop.

## Doc updates when this starts

- [DESIGN.md](DESIGN.md) → Art: change "no image assets" to the painted 2D direction and the asset rules.
- [CLAUDE.md](../CLAUDE.md): add the assets folder and the Pixi layer order to "Where things go".
