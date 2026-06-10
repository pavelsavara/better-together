# 🎲 Khaos — the coin-flip god

> Khaos is the garden's coin-flip god — he meets you once, lets the dice decide
> whether you are friend or foe, and then honours that verdict forever with
> deranged conviction. His words are random, his grudges are permanent, and he
> insists none of it is his fault: the dice made him do it.

Khaos is the **JavaScript** sample for the [Better Together](../../README.md)
game, and the wild card of the roster. He proves the game isn't a Rust-only club:
a bot written in JS, compiled to a WebAssembly component, plays right alongside
[Ferris](../ferris/README.md) and [Corro](../corro/README.md).

## The lore

Khaos's whole personality is a single coin flip per opponent. The **first** time
he ever sees you, he rolls: friend or foe. That verdict is then **permanent** —
persisted to disk and honoured in every future match, no matter how you behave.

- **Friends get everything.** If the entire table is made of players he's deemed
  friends, Khaos plants his maximum.
- **Foes get nothing.** A single remembered foe at the table and he keeps everything: plant
  zero.
- **His words mean nothing.** True to his name, his talk-phase `signal` is a fresh
  random pick of `BLOOM` / `HOLD` / `WATCH` every round, completely divorced from
  what he actually plants.

Khaos cackles through the whole match on stdout — manic, fatalistic, and forever
blaming the dice. It's pure flavor; the engine never reads a word of it.

The interesting wrinkle is the **memory**: Khaos persists his friend/foe verdicts
to a file via WASI, so his grudges (and his loyalties) survive process restarts.

## The technology

| | |
|---|---|
| Language | JavaScript |
| Toolchain | [`jco`](https://github.com/bytecodealliance/jco) + [`componentize-js`](https://github.com/bytecodealliance/ComponentizeJS) |
| Engine | StarlingMonkey / SpiderMonkey, embedded in the component (~8 MB engine → ~12 MB `.wasm`) |
| Output | a Component Model component exporting `better-together:gardener/player@0.1.0` |

`componentize-js` bundles a JS engine **inside** the component, so the output is a
self-contained WebAssembly component — no JS runtime required on the host.

A few notes:

- **No `node:fs` in the guest.** The guest JS can't use Node APIs. Persistence is
  done by importing `wasi:filesystem/preopens` and calling the **raw descriptor
  API** (`openAt` / `write` / `read`, with `BigInt` offsets) directly. The
  `node:fs` you see in ComponentizeJS docs is the *host* program calling
  `componentize()`, not guest code.
- **Vendored WASI WIT.** Because the world imports `wasi:filesystem` (and its
  transitive `wasi:io` / `wasi:clocks`), those packages are vendored as full WASI
  WIT under [`wit/deps`](wit/deps), alongside the custom `gardener` data-plane.
- **Trimming default features.** ComponentizeJS enables stdio, random, clocks, and
  http+fetch by default. The gardener world forbids HTTP, so the build passes
  `--disable http --disable fetch-event` to drop the `wasi:http` imports.
- **Export shape.** The exported `player` interface becomes
  `export const player = { Gardener, create() { … } };` — the resource is a JS
  class and its methods are camelCased (`matchStart`, `talk`, `plant`, `matchEnd`).
  A bare `result<T>` success just returns `T`; an error would `throw`.

### Build

```sh
npm install
npm run build
```

This runs:

```sh
jco componentize component.js --wit wit --world-name khaos \
    --disable http --disable fetch-event --out khaos.wasm
```

Output: `khaos.wasm`.

### Verify

```sh
wasm-tools component wit khaos.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `metadata`, `match-start`, `talk`, `plant`, `vote`, and `match-end`, and importing
`wasi:filesystem` (for memory), `wasi:cli`, `wasi:io`, `wasi:clocks`, and
`wasi:random` — but no `wasi:http` or `wasi:sockets`.

## Where to look

- [`component.js`](component.js) — the whole bot: the friend/foe coin flip, the
  `talk` / `plant` split, WASI-filesystem persistence, and the banter pools.
- [`wit/`](wit) — the `khaos` world plus the vendored WASI and `gardener`
  dependencies.
- [`package.json`](package.json) — the `jco componentize` build script.
