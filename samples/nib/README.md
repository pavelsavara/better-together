# 🖋️ Nib — the smallest gardener

> Nib is a single seed. There is no language, no runtime, no standard library
> behind it — just a few hundred lines of WebAssembly text written by hand. It
> keeps no memory and bears no grudge: each round it simply matches the table's
> promises and adds a little more.

Nib is the **minimalist conditional cooperator** for the
[Better Together](../../README.md) gardening game. Where Ferris is the reference
*cooperator* you read first, Nib is the reference *for the metal* — proof that
the player contract is small enough to implement by hand, straight against the
WebAssembly Component Model canonical ABI.

## The lore

Nib remembers nothing. It has no reputation notebook, no per-match state, no
allocator beyond a dozen-instruction bump heap. Every round it reads exactly one
thing — what everyone *just said* — and responds in the moment:

- **Talk** — it always broadcasts `WATCH`: "I'm deciding based on what others
  do." This is the honest truth, because that is literally all Nib does.
- **Plant** — it counts how many `BLOOM` promises were broadcast this round and
  plants that many **+ 4**, clamped to the 0–10 range. A quiet table still gets
  a friendly baseline of 4; a table full of optimists gets matched and topped.

Because Nib itself only ever says `WATCH`, its own broadcast is never a
`BLOOM`, so it can count every bloom in the round without having to know which
seat is its own. It writes a single line of banter to stdout each turn — pure
flavor, the engine never reads it — so a live match is still fun to watch.

This makes Nib a gentle *signal-matcher*: it rewards a cooperative table
generously and never collapses to zero, but it also won't be the lone sucker
pouring seeds into a silent garden.

## The technology

| | |
|---|---|
| Language | **none** — hand-written WebAssembly text (`.wat`) |
| Bindings | **none** — the canonical ABI is wired by hand |
| Target | a Component Model component (WASI 0.2.3 reactor) |
| Output | a component exporting `better-together:gardener/player@0.1.0` |

There is no compiler frontend here. [`src/nib.wat`](src/nib.wat) is a
complete component: it imports the shared `better-together:gardener/types`
value types, defines the `gardener` resource, hand-writes a `cabi_realloc` bump
allocator, and uses `canon lift` / `canon lower` to bridge the core module to
the component world.

A few deliberate choices:

- **Static memory, no post-return** — every result (metadata strings, the
  `talk`/`plant` return records) is written into fixed offsets in linear memory
  that are documented at the top of the `.wat`. Because the strings are static,
  Nib omits the `cabi_post_*` cleanup the compiled samples emit.
- **A shim sub-component** — modern `wasm-tools` requires the resource type used
  by exported methods to be laundered through a nested component (exactly what
  `wit-component` emits for compiled bots). `nib.wat` builds that
  `$player-shim` by hand so the export validates.
- **Direct wasi imports for banter** — with no `std` to lean on, Nib imports
  `wasi:cli/stdout`, `wasi:io/streams`, and `wasi:io/error` itself and calls
  `blocking-write-and-flush` to print.

### Build

```sh
wasm-tools parse src/nib.wat -o nib.wasm
```

That single step *is* the build — `wasm-tools parse` assembles the text into the
binary component. Output: `nib.wasm`.

### Verify

```sh
wasm-tools validate nib.wasm
wasm-tools component wit nib.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `metadata`, `match-start`, `talk`, `plant`, `vote`, and `match-end`, importing
`better-together:gardener/types@0.1.0` plus the three wasi interfaces used for
banter.

## Where to look

- [`src/nib.wat`](src/nib.wat) — the entire bot: type imports, the bump
  allocator, every method body, the canonical-ABI lift/lower wiring, and the
  `$player-shim` resource-export trick. The memory map is documented at the top.
- [`wit/world.wit`](wit/world.wit) — the world it builds against (informational;
  the `.wat` is the source of truth).
- [`wit/deps/gardener/gardener.wit`](wit/deps/gardener/gardener.wit) — the
  vendored data-plane (the `types` + `player` interfaces only).
