# 🐀 Keith — the ledger-keeping sewer rat

> Keith is the garden's bookkeeper — a grubby canal rat who never bites first,
> always forgives a stumble, and never once lies about his own intentions. But
> he keeps a little book of who broke their word, and he never forgets. Plant
> with him and the garden flourishes; promise and bail and your name goes in the
> ledger.

Keith is the **reciprocity stabilizer** for the [Better Together](../../README.md)
gardening game. Where [Ferris](../ferris) tracks a soft cooperation *rate*, Keith
plays direct, round-to-round **Tit-for-Tat** — and unlike everyone else, he holds
players to their *promises*, making him the natural antibody to deceptive
free-riders like [Corro](../corro).

## The lore

Keith grew up in the storm drains under the allotments, where the only currency
is your word and the only insurance is a good memory. He carries a stained
ledger everywhere. Every match, for every gardener at the table, he writes down
two things: did you actually plant, and — when you stood up and promised `BLOOM`
— did you keep that promise.

His temperament is **nice, retaliatory, and forgiving**, in that order:

- **Nice.** He never defects first. Round one he opens with a generous handful.
- **Honest.** His `talk` is never a bluff. He signals `BLOOM` only when he truly
  intends to plant a real contribution this round, and `HOLD` when he doesn't.
  (This is the exact opposite of Corro, who promises the moon and plants
  nothing.)
- **Retaliatory.** He mirrors the table. If the garden went cold last round he
  keeps his seeds; if it bloomed, he pours them in.
- **Forgiving.** Every few rounds he sticks his neck out with a peace-offering
  plant, just to see if a collapsed garden can be coaxed back to life — the
  single most important trait for winning the **Best Co-Player** crown.
- **Unforgetful.** A gardener who repeatedly signals `BLOOM` and then stiffs the
  garden becomes a *liar* in the ledger. When a table is run by proven liars,
  Keith keeps his seeds in his pocket. The rat does not feed cheats.

Each round plays out in three phases (talk → plant → vote) and Keith mutters
about all three on stdout — pure flavor the engine never reads, but fun to watch
in the console.

## The strategy

Decided in `talk` (and honoured in `plant`), grounded in the
[engine rules](../../docs/engine-rules.md):

| Situation (from the *previous* round) | Intent | Signal |
|---|---|---|
| Round 1 — no history | plant 8 (open generously) | `BLOOM` |
| ≥ half the table cooperated (planted ≥ 3) | plant 8 | `BLOOM` |
| Table went cold, but it's a "forgiveness" round | plant 5 (olive branch) | `BLOOM` |
| Table went cold | plant 2 (keep seeds, stay ready to forgive) | `HOLD` |
| Table dominated by proven liars | plant 2 | `HOLD` |

Then in the **plant** phase — with everyone's signals now visible — if Keith
promised to bloom but the room has turned cold (few `BLOOM`s, known cheats
seated), he trims from a generous 8 down to 5. That still honours his promise
(≥ 3 keeps the `BLOOM` honest) but he refuses to be a martyr in a dying garden.

The contribution threshold of **3** is the engine's, not arbitrary: a plant of 3+
makes you a *contributor*, which enfranchises you with **2 votes** in the tax
phase — so Keith always clears it before voting to tax a proven liar.

## The memory

Keith's ledger is a tiny tab-separated file on the virtual filesystem
(`keith-ledger.tsv`, or `$KEITH_MEMORY_PATH`). Per opponent it records four
counters — rounds seen, contributions, promises made (`BLOOM`s), and promises
broken (`BLOOM` then planted < 3). At `match-end` the match's observations are
folded into the lifetime totals and saved, so the rat's grudges and trust carry
across matches — exactly the persistence the rules permit (a private state blob
≤ 4 KB).

## The technology

| | |
|---|---|
| Language | C++23 |
| Bindings | [`wit-bindgen`](https://github.com/bytecodealliance/wit-bindgen) (`cpp` generator) |
| Compiler | [`wasi-sdk`](https://github.com/WebAssembly/wasi-sdk) clang |
| Target | `wasm32-wasip2` (WASI 0.2 reactor) |
| Output | a Component Model component exporting `better-together:gardener/player@0.1.0` |

Keith uses only the C++ **standard library**: `<fstream>` for the ledger (which
`wasi-libc` automatically lowers to `wasi:filesystem` imports) and `printf` for
banter. There is no hand-written ABI glue — `wit-bindgen cpp` turns the WIT in
[`wit/`](wit/) into the C++ bindings, and `wasm-component-ld` (the default
`wasm32-wasip2` linker that ships with wasi-sdk) emits a finished component in a
single link step — no separate `wasm-tools component new` pass.

A few deliberate choices:

- **`-fno-exceptions`** — Keith never throws, and this keeps `<fstream>` from
  dragging the C++ exception runtime into the module.
- **Reactor, not command** — `-mexec-model=reactor`, no `main`; the host calls
  the exported `gardener` methods directly.
- **Hand-owned resource header** — `wit-bindgen` generates the `gardener` class
  header once and thereafter writes refreshed copies to `*.template`, so
  [`src/exports-better_together-gardener-player-Gardener.h`](src/exports-better_together-gardener-player-Gardener.h)
  is checked in as real source. It carries Keith's per-seat state fields (and a
  small forward-declaration shim the generator needs).

### Build

Requires `wasi-sdk` (set `WASI_SDK_PATH`, default `/opt/wasi-sdk`), plus
`wit-bindgen` and `wasm-tools` on `PATH` — all provided by the
`better-together-tools` image.

```sh
./build.sh
```

Output: `keith.wasm`.

### Verify

```sh
wasm-tools component wit keith.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `metadata`, `match-start`, `talk`, `plant`, and `match-end`.

## Where to look

- [`src/keith.cpp`](src/keith.cpp) — the whole bot: the ledger, the
  `talk` / `plant` decision split, lie detection, and the banter.
- [`src/exports-better_together-gardener-player-Gardener.h`](src/exports-better_together-gardener-player-Gardener.h)
  — the hand-owned resource class with Keith's per-seat state.
- [`wit/world.wit`](wit/world.wit) — the tiny world that exports the player
  interface.
- [`wit/deps/gardener/gardener.wit`](wit/deps/gardener/gardener.wit) — the vendored
  data-plane (the `types` + `player` interfaces only).
