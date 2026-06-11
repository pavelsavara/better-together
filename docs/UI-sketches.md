# UI Sketches

[← Back to README](../README.md) · See also: [Architecture](architecture.md) · [Implementation Plan](implementation-plan.md)

Low-fidelity wireframes for the Better Together web UI — a **serverless**
Vite + React + jsco SPA served from `github.io`, styled with **hand-rolled CSS**
(no component framework) for a raw-terminal look. The UI is **exhibition
only**: it never writes to the tournament; it reads `data/index.json`,
`data/scores.json`, and same-origin `wasm/*.wasm`, and runs live matches in the
browser with the *same* engine core the CI tournament uses
([Architecture §5](architecture.md#5-web-ui-web)).

Conventions in these sketches: `[ Button ]`, `( ) radio`, `[x] checkbox`,
`▸ list item`, `🦀` = a bot's `glyph`.

---

## 0. App shell & navigation

A persistent hand-rolled header bar + responsive nav. **Botanical-terminal**
theme — glowing violet line-art on near-black, monospace throughout, ASCII
chrome (see [§8](#8-theming--mood)).

```
┌───────────────────────────────────────────────────────────────────────┐
│ 🌱 Better Together        Home · Top Scores · Submit · Builder · About · Rules │
├───────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                            « page content »                             │
│                                                                         │
├───────────────────────────────────────────────────────────────────────┤
│  jsco · WASI · better-together        “When you join a group, does it flourish?” │
└───────────────────────────────────────────────────────────────────────┘
```

- Routes: `/` (Home), `/scores`, `/bot/:id` (Bot Detail), `/submit`,
  `/builder`, `/about`, `/rules`.
- On mobile the nav collapses into a `Drawer`.
- Global data (`index.json`, `scores.json`) is fetched once and cached in a
  context provider.

---

## 1. Home — Live Match (the centrepiece)

Runs a **seeded** match live in the browser and animates every phase. Four
panels around a central garden.

```
┌─ Roster & Controls ───────────────────────────────────────────────────┐
│ Seed: [ a1b2c3d4… ]  [🎲 New]   K: ( )4 (•)5 ( )6   Speed: [──●────]    │
│ Players:  [x]🦀 ferris  [x]🦊 reynard  [x]🐹 gopher  [x]🦔 andy  [ +add ]│
│                                              [ ▶ Run match ] [ ⏸ ] [ ⟲ ]│
└─────────────────────────────────────────────────────────────────────────┘
┌─ The Garden ─────────────────────────────┐ ┌─ Scores ───────────────────┐
│  Round 7 / ?     phase: ● PLANT          │ │ #  bot        round  total │
│                                          │ │ 1  🦔 andy     15.5  118.0 │
│   🦀🌱🌱🌱🌱🌱🌱🌱🌱     ferris planted 8 │ │ 2  🦊 reynard  18.5  121.5 │
│   🦊·······            reynard planted 0  │ │ 3  🦀 ferris   14.5   99.0 │
│   🐹🌱🌱🌱🌱🌱🌱🌱       gopher planted 7  │ │ 4  🐹 gopher   16.5  110.0 │
│   🦔🌱🌱🌱🌱🌱🌱🌱🌱     andy planted 8    │ │                            │
│                                          │ │ garden total: 23           │
│  garden total 23  ·  payout 9.2 ea.      │ │ payout/player: 9.2         │
└──────────────────────────────────────────┘ └────────────────────────────┘
┌─ Talk · Votes · Tax ─────────────────────┐ ┌─ Banter (console) ─────────┐
│ talk:  🦀 BLOOM 🦊 BLOOM 🐹 WATCH 🦔 BLOOM │ │ 🦊 reynard: "after you…"   │
│ votes: 🦀→🦊  🐹→🦊  🦔→🦊  🦊→(abstain)   │ │ 🦔 andy: planting warm 🔥  │
│ TAX → 🦊 reynard  (3 voters, weight 6)    │ │ 🦀 ferris: trust intact    │
│ reclaimed: 4 seeds → garden               │ │ …stdout per seat…          │
└──────────────────────────────────────────┘ └────────────────────────────┘
```

Behaviour:

- **Seed field** is editable; `🎲 New` randomizes it. The same seed + same bot
  versions replays the match identically ([Architecture §4.5](architecture.md#45-determinism--replay)).
  A "Replay a CI match" entry can deep-link `/?seed=…&players=…` straight from a
  match log.
- **Roster config**: checkboxes from `index.json`; `K` constrains how many seats.
  If more are selected than `K`, the engine samples `K`.
- **Phase animation**: the garden fills `glyph`-seeds as each bot plants; the
  Talk/Votes/Tax panel reveals signals → plants → ballots in step with the
  engine's three phases. `Speed` slider controls inter-phase delay.
- **Scores** panel shows this round's score and running total per seat, sorted.
- **Banter** streams each seat's captured **stdout** as in-character chatter
  (stderr is engine-side diagnostics only and is not shown).
- All computation is local jsco; nothing is uploaded.

---

## 2. Top Scores

Reads `data/scores.json`. Co-Player crown is primary; Raw is a secondary tab.

```
┌─ Leaderboard ─────────────────────────────────────────────────────────┐
│ ( • ) Best Co-Player  ( ) Raw Score   window: each bot's last 500 matches │
│                                              updated 12:00Z · 4,120 matches │
├──┬─────────────┬──────────────┬───────────┬────────────┬───────────────┤
│ #│ bot         │ co-player    │ raw       │ consistency│ matches        │
├──┼─────────────┼──────────────┼───────────┼────────────┼───────────────┤
│ 1│ 🦔 andy      │ +3.10 ▕███▏  │ 16.2      │ 4.9        │ 240           │
│ 2│ 🛡 bram      │ +2.74 ▕██▊ ▏ │ 15.1      │ 5.2        │ 233           │
│ 3│ 🦀 ferris    │ +1.95 ▕██  ▏ │ 14.0      │ 6.0        │ 251           │
│ …│ …           │ …            │ …         │ …          │ …             │
│45│ 🐙 corro     │ −2.80 ▕░░  ▏ │ 19.4 ⚑    │ 8.1        │ 210           │
├──┴─────────────┴──────────────┴───────────┴────────────┴───────────────┤
│ Unranked (still settling — < 50 matches)                                │
│ – 🌱 khaos      │     ~        │  –        │  –         │ 12  (new)     │
└──┴─────────────┴──────────────┴───────────┴────────────┴───────────────┘
   ▕███▏ = co-player score with ± confidence whisker (from coPlayerStdErr)
   ⚑ high raw + negative co-player = "selfish" tell
```

- Clicking a row navigates to the **Bot Detail** page (`/bot/:id`, §2a).
- The confidence whisker visualizes `coPlayerStdErr`; low-sample bots show wider
  whiskers, communicating "ranking still settling."
- Bots with **fewer than 50 windowed matches** are `ranked: false`: they appear in
  a separate **Unranked** group below the ladder (no rank number) until they
  cross the threshold.

---

## 2a. Bot Detail (`/bot/:id`)

One page per bot, keyed by the **manufactured in-game id**
(`fnv1a32(oci)#namespace.Name`, see
[Architecture §2.1](architecture.md#21-dataindexjson--the-bot-registry)). Renders
the full `index.json` record plus the bot's current leaderboard standing.

```
┌─ Bot Detail ──────────────────────────────────────────────────────────┐
│  ┌────────┐   🦀  together.ferris            v1.0.0                     │
│  │ 100×100│   #1a2b3c4d                       status: active            │
│  │ avatar │   by Jane Doe                                               │
│  └────────┘   [ ▶ Watch in a match ]  [ repo ↗ ]                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Lore                                                                    │
│  “Reputation-aware, naively collaborative. Trusts first, remembers…”     │
│                                                                          │
│  Standing                          Provenance                           │
│   co-player  +1.95  (#3)            oci   ghcr.io/jane/ferris:1.0.0      │
│   raw        14.0                   wasm  sha256 a1b2…  ↗                 │
│   consistency 6.0                   icon  cached 100×100 (source ↗)      │
│   matches    251                    submitted by jane · issue #123      │
│   updated    18 matches ago         approved by @maintainer             │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Avatar** is the cached, same-origin `icons/<id>.png` (always 100×100); falls
  back to the `glyph` in a circle when the bot has no icon.
- The `#1a2b3c4d` chip is the FNV-1a32 hash segment of the id — a stable, copyable
  handle that disambiguates re-publishes of the same `namespace.Name`.
- **Standing** is read live from `scores.json`; if the bot has fewer than 50
  windowed matches it shows an **"unranked — still settling"** badge instead of a
  rank, and "updated N matches ago" surfaces `matchesSinceUpdate` after a same-ref
  re-publish.
- All bot-supplied strings (`lore`, `name`) render as **text, never HTML**.

---

## 3. Submit a Bot

Pure client form that builds a **prefilled GitHub issue link** — no API, no
auth. Submitting opens GitHub's new-issue page with the template populated.

```
┌─ Submit a gardener ───────────────────────────────────────────────────┐
│ Your bot is a WASI 0.2 component published as an OCI artifact.          │
│                                                                         │
│ OCI image reference *                                                   │
│ [ ghcr.io/yourname/yourbot:1.0.0                                  ]     │
│                                                                         │
│ Author handle *   [ @yourname ]    Short description *                  │
│ [ One line on what your gardener does                             ]     │
│                                                                         │
│ ⓘ A maintainer approves, then we pull this image, extract the .wasm,   │
│   and validate it. metadata (name, glyph, lore, …) is from the bundle.  │
│                                                                         │
│ Checklist before you submit:                                           │
│  [x] Exports better-together:gardener/player@0.1.0                     │
│  [x] metadata.name is "namespace.name"  (namespace ^[a-z][a-z0-9-]*$)  │
│  [x] glyph is a single emoji/character                                 │
│  [x] No network use (no wasi:sockets / wasi:http)                      │
│  [x] Component is ≤ 15 MB                                              │
│                                                                         │
│                                     [ Open prefilled GitHub issue ↗ ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

- The button target is
  `https://github.com/<owner>/<repo>/issues/new?template=submit-gardener.yml&...`
  with the OCI ref, author handle, and description passed through query params
  the issue form maps to fields.
- A short "What happens next" timeline (maintainer approval → validate → comment
  → appear on Top Scores) sets expectations.

---

## 4. Bot Builder

A JS editor whose script is run by a **prebuilt JS-host gardener** (the
`khaos`/`reynard` pattern). No in-browser componentization: the host component is
fetched once, the user's strategy is injected via its VFS/env, then played
locally against chosen opponents.

```
┌─ Bot Builder ───────────────────────────────────────────────────────────┐
│ ┌─ strategy.js ──────────────────────────────┐ ┌─ Opponents ───────────┐ │
│ │ export function talk(state, me)  { … }     │ │ [x] 🦀 ferris          │ │
│ │ export function plant(state, me) { … }     │ │ [x] 🐙 corro           │ │
│ │ export function vote(state, me)  { … }     │ │ [x] 🛡 bram            │ │
│ │ // memory via state.history & me.store     │ │ K: (•)4 ( )5 ( )6      │ │
│ │ …                                          │ │ Seed: [ 7f3a… ] [🎲]   │ │
│ │                                            │ │                        │ │
│ └────────────────────────────────────────────┘ │ [ ▶ Test match ]       │ │
│  [ ⤓ Load example ▾ ]  [ ⟲ Reset ]             │ [ ⤓ Export as OCI… ↗ ] │ │
│ ┌─ Result ───────────────────────────────────────────────────────────┐  │
│ │ (embeds the same garden + scores + banter view as Home, read-only) │  │
│ └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

- The editor exposes the player surface (`talk`/`plant`/`vote`, plus
  `match-start`/`match-end` hooks) and a small `store` for cross-round memory.
- `Test match` runs locally and renders the Home match view inline.
- `Export as OCI` is a **link-out** to docs explaining how to wrap the strategy
  into a real component and publish it (so the Builder is an on-ramp to a true
  submission, not a backdoor into the tournament).
- Syntax/runtime errors in the strategy are caught and surfaced; the host
  gardener degrades the offending call to its default (WATCH/0/abstain).

---

## 5. About

```
┌─ About ─────────────────────────────────────────────────────────────────┐
│ Better Together is a cooperative-dilemma game for algorithmic players,    │
│ built to showcase WebAssembly components: polyglot bots, sandboxed         │
│ execution, and the proof that composition wins.                            │
│                                                                            │
│  ▸ jsco — the JS Component-model runtime that powers matches  ↗            │
│  ▸ WASI — the capability-based sandbox bots run in            ↗            │
│  ▸ better-together — the game, contracts, and sample bots     ↗            │
│                                                                            │
│  Built with: TypeScript · Vite · jsco · WASI 0.2                           │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Rules

Renders [Player Rules](player-rules.md) and [Engine Rules](engine-rules.md)
(markdown → HTML) with a sticky table-of-contents and anchor links, plus a
"classic strategies" quick table. Reuses the repo's existing docs so the site
and the source stay in sync.

```
┌─ Rules ─────────────────────────────────────────────┐
│ ┌ Contents ┐  Player Rules                           │
│ │ Player   │   1. Match Setup                        │
│ │ Engine   │   2. Your Turn (talk · plant · vote)    │
│ │ Scoring  │   3. Signals …                          │
│ │ Strategy │  Engine Rules                           │
│ └──────────┘   7. The "Best Co-Player" Score …       │
└──────────────────────────────────────────────────────┘
```

---

## 7. Component → engine-data mapping

How each visual element binds to the data contracts
([gardener.wit](../wit/gardener.wit) / [game.wit](../wit/game.wit)):

| UI element | Source |
|------------|--------|
| Garden seed glyphs | `metadata.glyph` + per-round `player-action.plant` |
| Talk row | `signal-broadcast` (talk phase) |
| Votes / Tax panel | `round-result.votes`, `tax-target`, `tax-collected` |
| Garden total / payout | `round-result.garden-total`, `garden-payout` |
| Scores panel | `round-outcome.round-scores`, `running-totals` |
| Banter console | captured per-seat **stdout** (stderr not shown) |
| Seed field | match-log `seed` ([Architecture §2.3](architecture.md#23-matchesmatchidjson--the-match-log)) |
| Top Scores rows | `data/scores.json` ([Architecture §2.2](architecture.md#22-datascoresjson--the-leaderboard)) |
| Bot Detail page | `data/index.json` record ([Architecture §2.1](architecture.md#21-dataindexjson--the-bot-registry)) keyed by manufactured `id` |
| Bot avatar | cached same-origin `icons/<id>.png` (100×100), `glyph` fallback |
| Bot id chip | `fnv1a32(oci)#namespace.Name` from `index.json` |

---

## 8. Theming & mood

The whole site reads as a **botanical terminal** — a retro console booted in a
greenhouse at night. Think *"phosphor garden"*: near-black panels, glowing violet
line-art, monospace everything, and hand-drawn ASCII chrome.

### Palette (violet-on-black)

| Token | Hex | Use |
|-------|-----|-----|
| `bg.void` | `#0a0a0f` | app background (near-black, faint blue-violet tint) |
| `bg.panel` | `#12101a` | panel fills, slightly lifted from the void |
| `border.frame` | `#3a2f5c` | ASCII/box-drawing frame strokes (`+ | # ─ │`) |
| `accent.bloom` | `#b98cff` | primary violet — headers, active glyphs, plant line-art |
| `accent.glow` | `#d9b8ff` | hover/active highlight, soft text-shadow glow |
| `accent.dim` | `#6d5a99` | inactive borders, secondary labels, `░` fills |
| `text.primary` | `#e8e2f5` | body text (lavender-white) |
| `text.muted` | `#8a82a6` | captions, hints, disabled |
| `state.positive` | `#7ee0c8` | positive co-player / cooperation cues (mint) |
| `state.warn` | `#ffb37e` | tax / "selfish" tells (warm amber, used sparingly) |

The page is overwhelmingly **violet + black**; mint and amber appear *only* to
mark game outcomes (cooperation vs. free-riding), so they read as signal, not
decoration.

### Type & texture

- **Hand-rolled CSS, no component framework.** The raw-terminal look is built
  from plain CSS (custom properties for the palette below, CSS grid/flex for
  layout) rather than a UI kit — nothing rounds corners or adds drop shadows we
  didn't author. Chrome is drawn, not themed.
- **Monospace throughout** (e.g. `JetBrains Mono` / `IBM Plex Mono`), including
  headings — the terminal feel depends on a single fixed-width family.
- **ASCII chrome.** Panels are framed with box-drawing/`#` borders; section
  titles sit in `═══| TITLE |═══` rules; primary actions are bracket-keyed
  (`[P]LANT`, `[W]ATER`, `[H]ARVEST`). Corner flourishes and small leaf sprigs
  (`❧`, hairline vines) dress panel corners.
- **Botanical line-art.** Plants/avatars render as thin single-weight violet
  strokes on black (the `glyph` is the in-garden token; line-art is for hero
  panels and the Bot Detail avatar frame).
- **Soft glow.** A subtle `text-shadow`/`box-shadow` in `accent.glow` on active
  elements simulates phosphor bloom — kept low so text stays crisp.

### Accessibility

- Glyphs and line-art always carry meaning, so **pair them with the bot's `name`
  text** and screen-reader labels — never rely on emoji/art alone.
- The violet-on-black palette is tuned for **WCAG AA** body contrast
  (`text.primary` on `bg.void`); the glow is decorative and never the sole
  carrier of state — mint/amber are reinforced with text/icons.
- Match animation respects `prefers-reduced-motion` (fall back to instant phase
  transitions); the phosphor glow is dialed down or removed under that setting.
- The live match view is fully keyboard-operable (Run/Pause/Step buttons), and
  the bracket-key labels (`[P]`, `[W]`, …) double as real keyboard shortcuts.
- All bot-supplied strings (`lore`, `name`, banter) are rendered as **text, never
  HTML**, to avoid injection from untrusted metadata.

