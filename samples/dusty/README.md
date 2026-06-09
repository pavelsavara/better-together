# 🐭 Dusty — the cautious pantry mouse

> Dusty is a small grey mouse who has learned that the safest way to eat is to
> watch the table. He opens with a timid nibble, copies whatever the room did
> last, and bolts for his hole the moment the garden looks bare — then creeps
> back, one cautious step at a time, when the others start sharing again.

Dusty is the **graduated Tit-for-Tat** reference for the
[Better Together](../../README.md) gardening game. Where
[Keith](../keith/README.md) keeps a strict ledger and [Andy](../andy/README.md)
forgives on deeds, Dusty is the clean, *purely reactive* mirror: he holds no
opinion of any individual player and simply reflects the **table's average**
back at it — gently, and with a mouse's instinct for caution.

## The lore

Dusty has been raised in pantries where a wrong move means a trap. That shapes
how he plays:

- **Talk** — Dusty broadcasts honestly. If he intends to plant a generous
  amount (≥ 5) he says `BLOOM`; if he's pulling back to a nibble (≤ 2) he says
  `HOLD`; otherwise he says `WATCH`. He never bluffs — what he says is what he
  is about to do.
- **Plant** — Dusty mirrors the **group average** plant from the previous round,
  but asymmetrically, the way a prey animal must:
  - He **opens timid** — a small nibble (4 by default).
  - When the garden *cools* (the average drops below what he last risked) he
    **scurries back fast**, retreating an extra step below the average.
  - When the table is *stable or warming* he **creeps forward gently**, never
    leaping — his climb is capped at +2 seeds per round, up toward the average.
  - If most neighbours just promised `BLOOM` this round, he leans in one extra
    seed — a little trust for a little encouragement.

The result is a forgiving, exploitation-resistant cooperator. Dusty rewards a
generous table and converges with other Tit-for-Tat players, but a free-rider
who starves the garden quickly finds Dusty has darted back to his hole.

### He remembers whether the world has been kind

Between matches Dusty keeps a tiny notebook on the **virtual filesystem**
(`dusty.mem`, 16 bytes). He doesn't track individuals — he tracks the *climate*:
across every match he has ever played, how often was the average round a
generous one? Next time he sits down he tunes his **opening nibble** to that
memory:

- gardens have generally been generous → he opens braver (6),
- gardens have generally been barren → he opens warier (2),
- otherwise → his usual timid 4.

If the host grants no writable directory, the read and write simply fail and
Dusty plays fresh — persistence is strictly best-effort and never affects a
match in progress.

## The technology

| | |
|---|---|
| Language | **[Grain](https://grain-lang.org)** (`.gr`) — a functional language that compiles to WebAssembly |
| Bindings | **none** — the Component Model canonical ABI is hand-marshalled in Grain's `@unsafe` / `WasmI32` layer |
| Target | a Component Model component (WASI 0.2.3 reactor) |
| Output | a component exporting `better-together:gardener/player@0.1.0` |

Grain has no native Component Model support — its compiler emits a *core*
wasm module that imports `wasi_snapshot_preview1` (WASI Preview 1). Dusty is
nonetheless **pure Grain, with no hand-written WAT**: the six player methods are
exported directly from Grain with the exact canonical-ABI field names (via
`@externalName`), and the flattened parameter/return records are decoded and
encoded by hand against raw linear memory.

A few deliberate choices:

- **Hand-written canonical ABI.** Each export — `create`, `metadata`,
  `match-start`, `talk`, `plant`, `match-end` — is a thin `@unsafe` Grain
  function that reads the flattened ABI parameters straight out of linear memory
  (`WasmI32.load` / `load8U`) and writes its result records back the same way.
  Decoding `round-result` / `player-action` strides and matching Dusty's own
  `player-id` with `Memory.compare` is all there is to it. The memory layouts are
  documented inline in [`src/dusty.gr`](src/dusty.gr).
- **Per-instance state in module globals.** Because the host instantiates one
  component per seat, Dusty keeps his per-match state (his own id, the planned
  plant, the cross-match counters) in ordinary module-level mutable globals — no
  resource-representation juggling needed.
- **WASI for free via the adapter.** Grain's `wasi/file` standard library calls
  preview1 (`path_open`, `fd_read`, `fd_write`, …); `wasm-tools component new`
  adapts those onto `wasi:filesystem` so Dusty's notebook works without a single
  line of component-level WASI glue. Unused interfaces are tree-shaken away.

### Build

Dusty builds in three steps — compile to a core module, embed the world, then
adapt preview1 → preview2:

```sh
# 1. Grain -> core wasm (reactor: init runs from the wasm start section)
grain compile --release --use-start-section src/dusty.gr -o dusty.core.wasm

# 2. Embed the component-type information from ./wit
wasm-tools component embed wit dusty.core.wasm -o dusty.embed.wasm --world dusty

# 3. Wrap into a component, adapting WASI preview1 -> preview2
wasm-tools component new dusty.embed.wasm \
  --adapt wasi_snapshot_preview1=wasi_snapshot_preview1.reactor.wasm \
  -o dusty.wasm
```

The `wasi_snapshot_preview1.reactor.wasm` adapter ships with
[wasmtime](https://github.com/bytecodealliance/wasmtime/releases) and is baked
into the `better-together-tools` image (see
[`scripts/build-all.sh`](../../scripts/build-all.sh), which passes its path via
`WASI_REACTOR_ADAPTER`). Output: `dusty.wasm`.

### Verify

```sh
wasm-tools validate dusty.wasm
wasm-tools component wit dusty.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `create`, `metadata`, `match-start`, `talk`, `plant`, and `match-end`,
importing `better-together:gardener/types@0.1.0` plus the wasi interfaces the
adapter kept (stdio, `wasi:filesystem`, and their io/clocks dependencies).

## Where to look

- [`src/dusty.gr`](src/dusty.gr) — the entire bot: the canonical-ABI memory
  layouts, the `@unsafe` decode/encode helpers, the graduated Tit-for-Tat
  strategy, and the 16-byte cross-match memory file.
- [`wit/world.wit`](wit/world.wit) — the world Dusty builds against.
- [`wit/deps/gardener/gardener.wit`](wit/deps/gardener/gardener.wit) — the
  vendored data-plane (the `types` + `player` interfaces only).
