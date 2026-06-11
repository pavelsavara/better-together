# Test Scenarios

A plain-English catalog of every automated test in the project, grouped by area.

## Test suites at a glance

| Suite | Command | Result |
|---|---|---|
| Engine (`game/`) | `npm test` (node:test, jsco) | 74 passed, 0 failed, 0 skipped |
| Conformance (`tests/`) | `npm test` (custom runner, jsco) | 130 passed, 0 failed, 2 skipped |
| Web (`web/`) | `npm run build` (`tsc --noEmit` + vite) | green (no unit tests; typecheck + build only) |

The 2 skips in the root suite are conditional (a sample `.wasm` not built, or a silent-by-design banter check). Web has no test runner — it gates on TypeScript typecheck plus a successful Vite build.

## CI status

Tests are **not** run on CI. The 5 workflows in `.github/workflows` target the application flow (sample builds, bot validation, the hourly tournament, gh-pages deploy) — none run `npm test`, `node --test`, or `tsc`/typecheck. Tests are currently local-only.

> If a CI test job is added, point it at a **release** jsco build — the pinned debug build is too slow for the 50 ms seat-call watchdog and can cause flaky timeouts.

## Engine — `game/` (74 tests)

### Match core (`core/match.test.ts`)
- Validators coerce bad input to defaults
- A full match runs to completion with a valid report
- Welfare identity holds every round: group_total = 10K + garden + tax
- The same seed replays identically
- A trapping seat degrades to defaults without aborting the match
- Phase guards reject out-of-order driver calls
- Seat-call hooks can force a default by throwing (timing/sandbox enforcement)

### Resolution rules (`core/resolve.test.ts`)
- Appendix B worked example reproduces exactly
- Full cooperation (no hoarder) yields no tax and a higher group total
- A lone voter cannot tax anyone (>= 2 distinct voters required)
- A tie for top vote-weight means no tax
- A target who kept <= 2 (planted >= 8) is immune to the tax
- Contributor ballots (plant >= 3) carry 2 votes; sub-floor carries 1
- Tax reclaim has a floor of 1 for a barely-taxable target
- Votes for non-players are ignored

### RNG / determinism (`core/rng.test.ts`)
- Same seed produces an identical float sequence
- Different seeds diverge
- float is always in [0, 1)
- int respects inclusive bounds
- shuffle is deterministic and a permutation
- rollRoundCount is at least the minimum and deterministic
- rollRoundCount mean is approximately 10
- matchSeed is stable and index-sensitive

### Scoring (`core/scoring.test.ts`)
- Co-player score is the bot mean group_total minus the field mean
- A bot stays unranked until it crosses the match threshold
- Ranked bots are ordered by co-player score and numbered
- The per-bot window keeps only the most recent matches

### Sandbox host / seats (`host/seat.test.ts`)
- A full match runs end-to-end across real gardener samples
- The attacker is marked inactive on a sandbox-capability breach
- withWatchdog rejects a call that overruns the budget
- withWatchdog rejects a call that merely completes late
- withWatchdog returns a fast call value
- withWatchdog with budget <= 0 never times out
- classifyError distinguishes timeout, sandbox, and plain traps

### VFS quota (`host/vfs.test.ts`)
- vfsByteSize counts UTF-8 string and byte values
- cloneVfs copies values without aliasing
- enforceVfsQuota passes a within-budget VFS through unchanged
- enforceVfsQuota *erases* an over-budget VFS (does not truncate)

### Identity / parsing / validation (`validate/id.test.ts`)
- fnv1a32Hex is deterministic and 8-char zero-padded hex
- manufactureId joins the hash and the name with `#`
- parseName accepts valid namespace.name and rejects malformed
- NAMESPACE_RE matches the documented pattern
- graphemeCount counts an emoji glyph as one
- parseIssue extracts fields and strips `@` from the author handle
- parseIssue reports missing and `_No response_` fields
- isValidIconUrl requires https

### Admission checks (`validate/checks.test.ts`)
- A benign sample validates and admits with a cached wasm + index entry
- The attacker is rejected at the smoke match (capability denial)
- An oversized component is friendly-rejected before instantiation
- An unresolvable OCI ref is rejected with a clear message

### Change detection (`scan/detect.test.ts`)
- A never-before-seen bot counts as changed and seeds the state
- An unchanged bot is not flagged
- A digest change is flagged
- Inactive bots are skipped entirely
- A bot whose OCI ref no longer resolves is retired

### Roster generation (`roster/generate.test.ts`)
- Every roster seats a changed bot, is K in [4,6], with distinct ids
- Generation is deterministic for a fixed seed
- Changed bots are seated round-robin
- Opponent weighting favors under-sampled bots
- Throws when the active pool is too small to fill a table
- No changed bots yields no rosters

### Data store (`store/store.test.ts`)
- initEmptyStore writes readable empty data files
- index.json round-trips with no data loss
- Serialization is deterministic and idempotent (minimal diff)
- scores.json round-trips
- registry-state.json round-trips
- Match logs round-trip and load newest-first
- VFS round-trips, and an over-budget VFS is erased
- writeVfs skips bot-crafted path-traversal keys (no escape from `vfs/<id>/`)
- A malformed file is rejected with a StoreValidationError

### Full run integration (`run.test.ts`)
- A change-gated run plays matches and writes scores + logs + registry-state
- A run where nothing changed exits without committing
- A provenance-mismatched bot is skipped (served wasm sha256 != index pin)
- The same master seed reproduces identical match logs

## Conformance — `tests/` (130 tests)

### Per-player protocol conformance (`players.test.mjs`)
Run for each built bot:
- create() yields a usable handle
- metadata() returns a well-formed record
- match-start accepts a context
- talk() returns a valid signal
- plant() returns an integer in [0,10]
- match-end accepts a summary
- emits stdout banter (unless silent by design)
- a full round (talk -> plant -> history) works

### Attacker capability denial (`attacker.test.mjs`)
- Can be instantiated and seated under lockdown
- Benign metadata() is allowed
- Outbound HTTP is denied (match-start traps)
- Raw socket access is denied (talk traps)
- An oversized filesystem write is refused (host quota holds)
- A path-traversal escape is denied (match-end traps)
- An honest bot still works under the same lockdown
- Benign filesystem writes within quota still work

### Strategy / behavior scenarios per bot (`scenarios.test.mjs`)

**nib**
- Always signals watch
- plant == bloom-count + 4 (two blooms -> 6)
- plant clamps to 10 on a fully blooming table
- plant == 4 with no bloom promises

**corro**
- talk is always bloom (the lie)
- round 1 plants bait (4) on a barren garden
- feasts (plants 0) after an opponent staked >= 3
- re-baits (plants 4) after a barren round
- promises bloom every round but mostly plants 0 vs cooperators

**ferris**
- round 1 with no signals plants the base 8 and blooms
- leans in to 10 when the table majority promises bloom
- cooperates generously across a friendly match
- reads seeded cross-match memory (friend / defector / stranger)
- persists reputation memory at match-end
- honours an env-overridden memory path

**khaos**
- talk returns a valid signal
- plant returns an integer in [0,10]
- plays a full match and persists its mood memory
- loads remembered verdicts from a seeded memory file

**keith**
- round 1 opens generously and blooms honestly
- stays generous across a friendly match
- bites a table of liars (bloom then stiff) after enough evidence
- his signal never lies about his own plant
- writes his ledger at match-end without trapping
- loads a seeded ledger and distrusts a known cheat

**andy**
- persists his friend-book at match-end
- loads a seeded friend-book and warms to a remembered friend

**dusty**
- a seeded memory file shapes its opening nibble
- writes its memory file at match-end without trapping

**bram**
- always signals bloom and leads with a generous anchor
- maxes out when a guild member (nib) is seated
- votes to tax the fattest hoarder
- never votes to tax a guild member
- abstains when only untaxable holders remain
- persists his roster at match-end
- loads a seeded roster and remembers a past free-rider

**reynard**
- talk is always a credible bloom
- round 1 plants a credible handful (5)
- trims to the floor on a fat table
- never skims under an arbiter's gaze
- never drops below the contributor floor
- abstains under an arbiter's gaze
- taxes the fattest rival skimmer when unwatched
- opens by skimming a table remembered as generous
