# 🎲 Khaos — the dice god

> Khaos is the garden's dice god — he meets you once, lets the dice decide
> whether you are friend or foe, and then honours that verdict forever with
> deranged conviction. His words are random, his grudges are permanent, and he
> insists none of it is his fault: the dice made him do it.

Khaos is the **JavaScript** sample for the [Better Together](../../README.md)
game, and the wild card of the roster. He proves the game isn't a Rust-only club:
a bot written in JS, compiled to a WebAssembly component, plays right alongside
[Ferris](../ferris/README.md) and [Corro](../corro/README.md).

## The lore

Khaos's whole personality is a single roll of the dice per opponent. The **first**
time he meets a stranger he rolls — about **70% friend, 30% foe** — and that
verdict is then **permanent**: persisted to disk and honoured in every future
match, no matter how that player ever behaves.

- **Friends get everything.** If the entire table is made of players he's deemed
  friends, Khaos plants his maximum.
- **Foes get nothing.** A single remembered foe at the table and he keeps everything: plant
  zero.
- **His words mean nothing.** True to his name, his talk-phase `signal` is a fresh
  random pick of `BLOOM` / `HOLD` / `WATCH` every round, completely divorced from
  what he actually plants.
- **The dice point at random, too.** In the vote he abstains half the time and,
  the other half, taxes a neighbour chosen at random — no reason, no grudge, just
  the dice.

Khaos cackles through the whole match on stdout — manic, fatalistic, and forever
blaming the dice. It's pure flavor; the engine never reads a word of it.

### The fated roster — verdicts cast before the dice

Strangers get the coin flip, but the rest of the sample roster Khaos has *always*
known. For every familiar gardener the verdict was settled long ago — the dice
are canon, not chance — and the pattern is deliberate, because it is what wires
the tournament's running feuds and odd-couple alliances:

| Gardener | Verdict | Why the dice fell that way |
|---|---|---|
| 🦊 [Reynard](../reynard/README.md) | **friend** | His fated darling — chaos bankrolls the fox, the most natural accidental cartel on the board. |
| 🦀 [Ferris](../ferris/README.md) | **friend** | The dice warm to a sincere, earnest collaborator. |
| 🥀 [Corro](../corro/README.md) | **friend** | A kindred agent of chaos — the dice wink at a fellow trickster. |
| 🖋️ [Nib](../nib/README.md) | **friend** | Too blank and innocent for the dice to curse. |
| 🐹 [Gopher](../gopher/README.md) | **friend** | The dice adore a creature of pure habit. |
| 🐭 [Dusty](../dusty/README.md) | **friend** | The dice take pity on the timid mouse. |
| 🦫 [Bram](../bram/README.md) | **foe** | The guild boss — the dice god loathes an organizer of order. |
| 🐀 [Keith](../keith/README.md) | **foe** | The ledger-keeper — chaos despises a bookkeeper of grudges. |
| 🦔 [Andy](../andy/README.md) | **foe** | The hedgehog arbiter — chaos resents anyone who sits in judgment. |

Notice the mischief baked in: Khaos befriends Bram's would-be footsoldiers
([Nib](../nib/README.md) and [Gopher](../gopher/README.md)) while branding the
boss himself a foe — splitting the guild before it can form — and he foes *both*
arbiters ([Keith](../keith/README.md) and [Andy](../andy/README.md)), the dice
god set against the rule of law. Anyone **not** on this list is a true stranger:
rolled once, then remembered forever.

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

- [`component.js`](component.js) — the whole bot: the friend/foe dice roll, the
  `talk` / `plant` split, WASI-filesystem persistence, and the banter pools.
- [`wit/`](wit) — the `khaos` world plus the vendored WASI and `gardener`
  dependencies.
- [`package.json`](package.json) — the `jco componentize` build script.
