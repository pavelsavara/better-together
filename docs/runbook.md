# Operations Runbook

[← Back to README](../README.md) · See also: [Architecture](architecture.md) · [Implementation Plan](implementation-plan.md)

How to develop, test, and operate the Better Together tournament. The engine
lives in [`game/`](../game) (Node + jsco) and the exhibition SPA in
[`web/`](../web) (Vite + React + jsco). State is files on the `gh-pages` branch.

---

## 1. Local development & tests

```bash
# Engine (game/): node:test, jsco pinned at ../../jsco/dist/debug
cd game
npm install
npm run typecheck            # tsc --noEmit
npm test                     # all tests (needs --experimental-wasm-jspi; wired in the script)
npm run test:core            # pure core only (no jsco)

# Web (web/): Vite + React
cd web
npm install
npm run dev                  # dev server
npm run build                # tsc --noEmit + vite build
npm run preview              # serve the production build
```

The engine tests instantiate the real built samples (`samples/*/…wasm`). Tests
that need ≥ N built samples auto-skip when they aren't present.

---

## 2. End-to-end rehearsal (submit → validate → scores → watch)

1. **Submit** — open the SPA `Submit` page, fill the OCI ref + author + blurb,
   and click *Open prefilled GitHub issue*. (Or open the issue directly with the
   [`submit-gardener.yml`](../.github/ISSUE_TEMPLATE/submit-gardener.yml) form.)
2. **Approve** — a maintainer adds the `approved` label. This is the gate that
   triggers validation (see [Architecture §3](architecture.md#3-registration--validation-flow)).
3. **Validate** — [`validate-bot.yml`](../.github/workflows/validate-bot.yml)
   runs `game/src/validate/run-validate.ts`: pull OCI → extract wasm → run the
   ordered `§3.1` checks (size, shape, metadata, namespace, glyph, icon,
   capability-denial smoke match) → on success cache wasm/icon + upsert
   `data/index.json`, comment ✅ and label `accepted`; on failure comment ❌ with
   the exact failing rule and label `rejected`.
4. **Tournament** — [`tournament.yml`](../.github/workflows/tournament.yml) runs
   hourly, change-gated: it only plays matches when a bot's OCI digest changed,
   then updates `data/scores.json` + `vfs/` + `matches/` in one commit.
5. **Top Scores / Home** — the SPA reads `data/index.json` + `data/scores.json`;
   the new bot appears on the leaderboard (unranked until ≥ 50 windowed matches)
   and can be watched in a live, seeded match on Home.

---

## 3. Enabling the workflows (currently disabled)

All three workflows ship **disabled** (their real triggers are commented out;
only `workflow_dispatch` is active). Before enabling, implement the three
injected dependencies that are currently stubbed (each throws a clear TODO):

| Stub | File | What to implement |
|------|------|-------------------|
| OCI puller | [`game/src/validate/pull-oci.ts`](../game/src/validate/pull-oci.ts) | `oras`/`wkg` pull → wasm bytes + manifest digest/ETag |
| Avatar processor | [`game/src/validate/avatar.ts`](../game/src/validate/avatar.ts) | fetch (size-capped) → decode → strip → resize 100×100 PNG (e.g. `sharp`) |
| Manifest checker | [`game/src/scan/detect.ts`](../game/src/scan/detect.ts) | conditional manifest `HEAD`/`GET` with `If-None-Match` → changed/digest/ETag (+`notFound` → retire) |

Then re-enable the triggers (uncomment `on: issues` / `on: schedule` /
`on: push`) and set `FILLER_WASMS` in `validate-bot.yml` to built sample paths.
Single-writer discipline is enforced by the shared `store-writer` `concurrency`
group; the deploy workflow writes only the SPA bundle (`keep_files: true`).

---

## 4. Failure handling (implemented)

- **Unresolvable OCI** → the manifest checker returns `notFound`; `detectChanges`
  marks the bot `retired` and the run drops it from rosters.
- **Sandbox violation / > 50 ms call** → the seat watchdog marks the bot
  `inactive`; the run records it and updates `index.json`. (Use a release jsco
  build + `callBudgetMs: 50` in CI; the debug build is too slow for the budget.)
- **VFS overflow (> 256 KB)** → the bot's VFS is **erased** (starts fresh), never
  truncated.
- **Provenance mismatch** → at seat time the run audits the served wasm's sha256
  against the `index.json` pin and skips a mismatched bot rather than seating it.
- **Trap / malformed response** → defaults (WATCH / 0 / abstain) for that call
  only; the match continues.

---

## 5. Determinism & replay

Every match's RNG seed is stored in its log (`matches/.../<id>.json`). The same
master seed reproduces identical per-match seeds (`matchSeed(master, index)`),
and the same seed + same component bytes replays a match byte-for-byte. The SPA
exposes the seed on Home and deep-links replays via `/?seed=…&players=…`.

---

## 6. Tuning constants (starting values)

Recorded in `data/meta.json` `notes` each run. Tune against observed convergence
([Architecture §8](architecture.md#8-open-questions--future-work)):

| Constant | Default | Where |
|----------|---------|-------|
| Matches per run (budget) | 500 | `runTournament({ budget })` |
| Per-bot trailing window | 500 | `ScoringConfig.windowPerBot` |
| Min matches to rank | 50 | `ScoringConfig.minMatchesToRank` |
| Per-call wall budget | 50 ms | `createGardenerSeat({ callBudgetMs })` |
| Per-run wall cap | (set in CI) | `runTournament({ maxRunMs })` |

---

## 7. Performance

Set `runTournament({ maxRunMs })` so a tick finishes within its hour (the run
loop stops generating matches once the cap is hit). With a release jsco build,
~500 four-to-six-seat matches of ~10 rounds is comfortably inside an hour; the
debug build is far slower and is for local correctness only.
