# Implementation Plan

[← Back to README](../README.md) · See also: [Architecture](architecture.md) · [UI Sketches](UI-sketches.md)

A phased plan to build the Better Together tournament: the data store, the
validation Action, the scheduled engine (`game/`), and the web UI (`web/`).
Phases are ordered so each one is independently testable and unblocks the next.

Guiding constraints (from the design decisions):

- **Serverless** — state is files on the `gh-pages` branch; compute is GitHub
  Actions + the visitor's browser.
- **jsco** is consumed from a **local sibling checkout** today (`../../jsco`),
  switchable to published `@pavelsavara/jsco` later — mirror the
  [tests/lib/harness.mjs](../tests/lib/harness.mjs) resolution.
- **OCI ref + author + blurb** in the issue; CI extracts the wasm and **caches it
  on gh-pages** so the browser fetches it same-origin.
- **Maintainer-gated validation** (`approved` label triggers it); **change-gated
  hourly** tournament (runs only when a bot's OCI digest changed); **one match at
  a time**; **seeded** RNG with the seed stored and shown.
- **Per-bot trailing window of 500 matches**; a bot is **unranked until ≥ 50
  matches**; a same-ref re-publish keeps id/history and blends new results.
- Target scale: **≤ 100 bots**, ~2–5 per contributor.

---

## Phase 0 — Foundations & shared core

**Goal:** a framework-agnostic match engine usable by both Node and the browser,
plus the typed data contracts.

| Task | Deliverable |
|------|-------------|
| Scaffold `game/` TS project (ESM, `tsconfig`, lint) | `game/package.json`, `game/tsconfig.json` |
| Define TS types for the data store | `game/src/types.ts` — `BotRecord`, `Scores`, `MatchLog`, round/score records mirroring [game.wit](../wit/game.wit) |
| Implement **round resolution** per [Engine Rules §3–§5](engine-rules.md#3-round-resolution-executed-by-engine) | `game/src/core/resolve.ts` (talk→plant→vote→tax→payout→score) |
| Implement the **match driver** (stepped: start → rounds → end) mirroring `runner` in [game.wit](../wit/game.wit) | `game/src/core/match.ts` |
| Implement **seeded RNG** (geometric stop, seat order, per-seat random) | `game/src/core/rng.ts` |
| Unit tests for resolution against [Engine Rules Appendix B](engine-rules.md#appendix-b--worked-example) | the K=4 worked example reproduces 65 group-total exactly |

**Exit criteria:** `resolve.ts` reproduces the Appendix B numbers; the driver
runs a match given a mock seat that returns scripted signals/plants/votes.

---

## Phase 1 — jsco host & sandbox

**Goal:** instantiate real gardener components and drive them through a match.

| Task | Deliverable |
|------|-------------|
| Port the proven seating contract from the test harness | `game/src/host/seat.ts` using `instantiateWasiComponent` |
| jsco resolution (local checkout, env-switchable) | mirror [harness.mjs](../tests/lib/harness.mjs) `JSCO_DIST` logic |
| Capability whitelist (no `wasi:sockets`/`wasi:http`) | reuse `DEFAULT_ENABLED` whitelist |
| Per-seat VFS mount from a `Map` (256 KB cap, erase on overflow); stdout/stderr capture | `game/src/host/vfs.ts` |
| Validate every response (shape/range) + trap/timeout → default (WATCH/0/abstain) + 50 ms wall-clock watchdog | wrapper in `seat.ts` |
| Enforcement: sandbox violation or >50 ms call → mark bot `inactive` | wrapper in `seat.ts` |
| Smoke test: run a full match across two built samples | reuses `samples/*/…wasm` |

**Exit criteria:** a real match between, e.g., `ferris` and `corro` runs end to
end in Node, producing a valid match log; a trapping seat degrades gracefully;
a seat that overruns 50 ms or touches the network is marked `inactive`.

---

## Phase 2 — Data store (gh-pages read/write)

**Goal:** read and write the canonical state on the `gh-pages` branch.

| Task | Deliverable |
|------|-------------|
| Schemas + (de)serialization with validation | `game/src/store/schema.ts` (`index.json`, `scores.json`, `registry-state.json`, `meta.json`, match log) |
| Read layer: load index, scores, registry-state, recent match logs, all VFS | `game/src/store/read.ts` |
| Write layer: scores, registry-state, changed VFS (256 KB cap, erase on overflow), new match logs (staged for one commit) | `game/src/store/write.ts` |
| Initial empty store + seed it with the bundled samples | `data/index.json` bootstrap script |
| Local "store in a temp dir" mode for tests | no network needed in unit tests |

**Exit criteria:** round-trip a store dir; loading + writing leaves a clean,
minimal diff (stable key ordering, deterministic JSON formatting).

See layout in [Architecture §2](architecture.md#2-data-store-the-gh-pages-branch).

---

## Phase 3 — Validation Action (registration)

**Goal:** a contributor opens an issue with an OCI ref; a maintainer approves it,
and the bot is then validated and admitted automatically.

| Task | Deliverable |
|------|-------------|
| Issue form template | `.github/ISSUE_TEMPLATE/submit-gardener.yml` (fields: OCI ref, author handle, short description) |
| Parse issue form body → `{ oci, author, blurb }` | `game/src/validate/parse-issue.ts` |
| Pull OCI artifact → wasm bytes (`oras`/`wkg`) | `game/src/validate/pull-oci.ts` |
| Size limit: friendly-reject components > 15 MB | within `pull-oci.ts` / `checks.ts` |
| Validation checks (size, shape, metadata, namespace regex, glyph, icon, capability denial, scratch-VFS smoke match) per [Architecture §3.1](architecture.md#31-validation-checks) | `game/src/validate/checks.ts` |
| Manufacture in-game id `fnv1a32(oci)#namespace.Name` | `game/src/validate/id.ts` |
| Avatar pipeline: fetch (size-capped) → decode → strip → **resize to 100×100 PNG** → cache `icons/<id>.png` | `game/src/validate/avatar.ts` (e.g. `sharp`) |
| Admit: cache wasm to `wasm/<id>/<ver>.wasm` + `icons/<id>.png`, upsert `index.json` (incl. `ociDigest`/`ociEtag`), sha256 pin | `game/src/validate/admit.ts` |
| Workflow: `on: issues (labeled 'approved')` → run validator → comment + label + commit | `.github/workflows/validate-bot.yml` |
| Reject path: clear ❌ comment with the exact failing rule | covered by `checks.ts` messages |

**Exit criteria:** a maintainer labelling a test issue (pointing at a sample's OCI
image) `approved` results in a committed `index.json` entry (with the
manufactured id and `ociDigest`/`ociEtag`) + cached wasm + a cached 100×100
avatar + an ✅ comment; a deliberately broken bot (e.g.
the `attacker`, or one with a non-image icon URL) is rejected with a specific
reason.

Security: the OCI image is **only** pulled and run inside jsco — never executed
as a container ([Architecture §6](architecture.md#6-security--sandboxing)).

---

## Phase 4 — Tournament engine (scheduled)

**Goal:** the change-gated hourly run that grows the leaderboard by replaying
newly added or updated bots.

| Task | Deliverable |
|------|-------------|
| Change detection: conditional OCI manifest check (ETag/digest) vs `registry-state.json`; exit early if nothing changed | `game/src/scan/detect.ts` |
| Roster generation: seat the changed bot(s); fill `K∈{4,5,6}` opponents weighted toward fewest windowed matches (§4.3) | `game/src/roster/generate.ts` |
| Match budget (~500, tunable) + diversity guard | within `generate.ts` |
| Run loop: seat → drive → log (with `playerDigests`) → carry VFS forward, sequentially | `game/src/run.ts` |
| Scoring over per-bot 500-match window (Co-Player, Raw, consistency, std-err); `ranked:false` until ≥ 50 matches per [Engine Rules §7–§9](engine-rules.md#7-the-best-co-player-score) | `game/src/core/scoring.ts` |
| Update handling: same-ref digest change keeps id/history/VFS, bumps `lastDigestChangeAt`/`matchesSinceUpdate` | within `scan/detect.ts` + `store/write.ts` |
| Single commit + push; `concurrency` group to prevent overlap | `.github/workflows/tournament.yml` (`on: schedule` hourly, change-gated) |
| Master seed per run → per-match seeds, stored in logs | wire `rng.ts` into `run.ts` |

**Exit criteria:** a manual `workflow_dispatch` run after "changing" a sample's
digest replays that bot, producing match logs, an updated `scores.json` (with the
bot unranked until it crosses 50 matches), and updated VFS in one commit; a run
where no digest changed exits without committing; re-running with the same master
seed reproduces identical logs.

See [Architecture §4](architecture.md#4-tournament-engine-game).

---

## Phase 5 — Web UI scaffold & data pages

**Goal:** the SPA shell, Top Scores, About, Rules, and Submit — everything that
only *reads* data or links out.

| Task | Deliverable |
|------|-------------|
| Scaffold `web/` (Vite + React + TS, hand-rolled CSS), botanical-terminal theme | `web/package.json`, app shell + router |
| Global data provider (fetch + cache `index.json`, `scores.json`) | `web/src/data/` |
| Top Scores page (Co-Player/Raw tabs, confidence whiskers, rows link to detail) | `web/src/pages/Scores.tsx` |
| Bot Detail page (`/bot/:id`): full metadata + cached avatar + standing | `web/src/pages/Bot.tsx` |
| Submit page (prefilled GitHub issue link builder) | `web/src/pages/Submit.tsx` |
| About + Rules (render existing docs) | `web/src/pages/{About,Rules}.tsx` |
| Deploy workflow: build `web/` → publish to `gh-pages` (alongside `data/`, `wasm/`, `icons/`) | `.github/workflows/deploy-site.yml` |

**Exit criteria:** the site builds and deploys; Top Scores renders real
`scores.json`; a Bot Detail page shows the cached avatar + metadata + standing;
Submit opens a correctly prefilled GitHub issue.

See [UI Sketches §0, §2, §2a, §3, §5, §6](UI-sketches.md).

---

## Phase 6 — Web UI live match

**Goal:** the Home page runs real, seeded matches in the browser.

| Task | Deliverable |
|------|-------------|
| Bundle the Phase 0 **core** for the browser (shared package) | `game/src/core` consumed by `web/` |
| Browser jsco host: fetch same-origin `.wasm`, instantiate, drive | `web/src/engine/` |
| Garden animation, Talk/Votes/Tax panel, Scores panel, Banter console | `web/src/components/match/*` |
| Roster config + seed field + replay-from-seed deep links | `web/src/pages/Home.tsx` |
| `prefers-reduced-motion`, keyboard controls, text-only bot strings | accessibility pass |

**Exit criteria:** Home runs a live K=4 match with built samples; the same seed
replays identically; deep-linking `/?seed=…&players=…` reproduces a CI match log.

See [UI Sketches §1](UI-sketches.md#1-home--live-match-the-centrepiece).

---

## Phase 7 — Bot Builder

**Goal:** an in-browser JS strategy editor that plays via a prebuilt JS-host
gardener.

| Task | Deliverable |
|------|-------------|
| Prebuilt JS-host gardener component (khaos/reynard pattern) that loads a user script | reuse/extend an existing JS sample; publish its wasm to `wasm/` |
| Inject user script into the host gardener via VFS/env | `web/src/engine/builder-host.ts` |
| Editor (CodeMirror/Monaco) with the player-surface API + examples | `web/src/pages/Builder.tsx` |
| Inline test-match (reuse Home match view); error surfacing → default fallback | shared match component |
| "Export as OCI" link-out to packaging docs | docs section + button |

**Exit criteria:** a user-authored strategy plays a local match against chosen
opponents; runtime errors degrade to defaults without crashing the match.

See [UI Sketches §4](UI-sketches.md#4-bot-builder).

---

## Phase 8 — Hardening & polish

| Task | Deliverable |
|------|-------------|
| End-to-end rehearsal: submit → validate → appears on Top Scores → watch on Home | documented runbook |
| Convergence check: does the per-bot 500-match window + opponent weighting stabilize rankings; tune the ≥ 50-match threshold | tuning notes in `meta.json` |
| Failure handling: unresolvable OCI → mark `retired`; sandbox/timeout violation → mark `inactive`; VFS overflow → erase | engine + validator updates |
| Provenance audit: verify served wasm sha256 matches `index.json` | CI check |
| Performance: cap per-run wall time; ensure one hour is enough for the budget | timing report |

---

## Cross-cutting concerns

- **Shared core, two runtimes.** `game/src/core/*` (resolution, driver, scoring,
  rng) must stay free of Node/browser-specifics so `web/` imports it unchanged.
  Host concerns (jsco config, VFS, fetch vs fs) live behind a thin port layer.
- **Determinism.** All randomness flows from the match seed; never call
  `Math.random()` in core. This is what makes replay (and the displayed seed)
  trustworthy.
- **jsco switch.** Keep jsco import behind one module so flipping from local
  checkout to published `@pavelsavara/jsco` is a one-line change in both
  projects.
- **Single-writer discipline.** Only `validate-bot.yml` writes `index.json` +
  `wasm/` + `icons/`; only `tournament.yml` writes `scores.json` + `vfs/` +
  `matches/` + `registry-state.json`. The `deploy-site.yml` writes only the SPA
  bundle. Use `concurrency` groups so no two writers of the same files run at once.
- **Untrusted input.** Bot metadata and banter are rendered as text only; OCI
  images run only inside the jsco sandbox.

---

## Milestone summary

| Phase | Outcome | Unblocks |
|-------|---------|----------|
| 0 | Deterministic match core + tests | everything |
| 1 | Real gardeners run in Node via jsco | 3, 4 |
| 2 | gh-pages store read/write | 3, 4, 5 |
| 3 | Maintainer-approved validation | live registrations |
| 4 | Change-gated tournament + leaderboard | 5, 6 |
| 5 | SPA shell + read-only pages | public site |
| 6 | Live in-browser matches | flagship UX |
| 7 | Bot builder | contributor on-ramp |
| 8 | Hardening | launch |

The critical path to a *useful* site is **0 → 1 → 2 → 3 → 4 → 5**: that delivers
registration + an updating leaderboard. Phases 6–7 add the flagship interactive
experience.
