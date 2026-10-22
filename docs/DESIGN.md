# Design — Light Up the Street

## Direction

A warm, night-time street lit by bulbs, lanterns and generator glow. **Dark UI only.** Amber is the colour of light, and light is the whole game, so amber marks the things that matter: the primary action, cash, headings. It should feel like a native phone app, chunky and tactile with rounded corners, the way a polished mobile life-sim does.

Reference apps: **LagosLife** (life-sim depth and polish, local flavour), plus the general feel of iOS/Android native sheets and tab bars.

## Colour tokens (`src/styles.css` `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#10131c` | App background |
| `--panel` / `--panel2` / `--panel3` | `#1a1f2d` / `#232a3c` / `#2c3449` | Cards, buttons, raised surfaces (lighter = higher) |
| `--line` | `#2f374c` | Borders |
| `--ink` / `--dim` | `#f5eeda` / `#a9a393` | Main text (warm off-white) / secondary text |
| `--amber` / `--amber2` | `#ffb347` / `#ff8c42` | Primary actions, cash, headings, "light" |
| `--green` | `#5fd068` | Power on, good state |
| `--red` | `#ff6b6b` | Power off, danger, critical |
| `--blue` | `#5aa9ff` | Info, links |

Rules: use tokens, not new hex values. Status colours always mean the same thing: green = on/good, amber = warning, red = off/critical.

## Type

- **Nunito** 600–900, fallback `"Segoe UI", system-ui`.
- Headings 900 weight in amber (h1 32px, h2 22px). Body 14–16px. Labels 11–12px, uppercase, letter-spaced, 800 weight.
- Inputs are at least 16px so iOS doesn't zoom.

## Shape and spacing

- Radius: cards 22px, buttons 14px (small 12px), tiles 14px, chips pill, icon buttons 12px.
- Gutters: 10–16px at the screen edge, 7–8px between tiles and chips.
- Tap targets are at least 44px; action-bar icons are 48px.
- Depth comes from soft shadows (`--shadow`), not heavy borders.

## Motion and feedback

- Easing: `--ease` (`cubic-bezier(.2,.8,.2,1)`). Screens fade and rise about 12px over .32s. Presses scale to .92–.97.
- Every important action gets three kinds of feedback: visual (bump/animation), sound (WebAudio tone, if `SET.sound`) and haptic (`core/haptics.ts`).
- All ambient motion (smoke, rain, glow) checks `SET.motion` and honours `prefers-reduced-motion`.

## Layout

- Phone-first and full-screen on mobile, including safe areas (`--safe-t`, `--safe-b`).
- Tablets and small laptops (700–1019px wide) get a 430px phone frame centred on a dark radial background.
- Wide screens (≥1020px wide, ≥600px tall) go full window, LagosLife-style: the street fills the screen and the UI floats over it in translucent panels. HUD pill top centre; "where am I" chip or place card top left; minimap top right with the action rail under it; street feed bottom left; tab bar pill bottom centre with the waypoint bar above it. Phone apps open as a right-hand side panel, decisions as a centred dialog. When you're away, the street behind the place card is dimmed and blurred. All of this is one `@media` block at the end of `styles.css`; the phone layout is untouched.
- The game screen is HUD tiles → street canvas (860:470) → action bar → feed, with the tab bar at the bottom. The phone apps open as a bottom sheet with swipe-to-close.

## Art

- Two views of the same street: **3D** (three.js, low-poly, flat-ish shading, code-built geometry) and **2D Classic** (Canvas 2D). Both are drawn in code with no image assets; textures (fabric, zinc, grain, windows) are painted on small canvases at runtime. Characters in both are built from skin, hair and outfit data in `content.ts`.
- 3D rules: warm palette from the 2D houses, light as the hero (emissive windows and bulbs, glow sprites, few real point lights), blob shadows on low-end phones. See [PLAN_3D.md](PLAN_3D.md).
- Night is the default mood. Light sources (bulbs, gen glow, lanterns) should visibly change the scene when the power changes.
- Phase 2 goal: sprite-quality characters, idle animation, day/night cycle, weather and facial expressions.

## Voice

- Player-facing text is plain, standard English: short, warm and lightly funny ("Power can go at any time.", "Are you sure?"). No Pidgin. One short sentence beats two; no long paragraphs. Lagos flavour comes from names, places and situations (okada, Mama Put, NEPA), not from the grammar.
- Emoji at the start of toasts and modal titles, one per message.
- Money is shown as `₦` with `fmt()`, and the copy makes clear it's virtual.
- The jokes are about the situation (NEPA, DisCo, landlords, generator noise), never about players or real groups.
