# 🦀 Ferris — the eternal optimist

> Ferris is the garden's eternal optimist — a crab who believes every plot can
> bloom if everyone just chips in. He keeps a little notebook of everyone he's
> ever played with, forgives slowly, and trusts again gladly. He'd rather lose a
> point and gain a friend.

Ferris is the **reference cooperator** for the [Better Together](../../README.md)
gardening game. He is meant to be read first: a clean, well-commented bot that
plays the cooperative strategy the rules reward.

## The lore

Ferris remembers. Across every match he's ever played he keeps a reputation
notebook — who tends the commons, and who quietly free-rides. He starts every
new acquaintance with an open hand (he plants generously by default) and only
cools off toward someone who has repeatedly taken without giving. Hurt him and
he gets *cautious*, not vengeful; treat the garden well and he leans all the way
in.

Each round plays out in three phases and Ferris narrates all of them on stdout:

- **Talk** — he broadcasts a `signal` (usually `BLOOM`) declaring his intent and
  cheers on the friends he recognizes.
- **Plant** — he reads this round's signals; if the table is leaning `BLOOM` and
  no known defector is seated, he commits his biggest contribution.
- **Vote** — with every plant now revealed, he abstains in a healthy garden but
  votes to tax a blatant selfish player when one is obvious.

His banter is pure flavor — the engine never reads it — but it makes a live match
fun to watch in the console.

## The technology

| | |
|---|---|
| Language | Rust (edition 2021) |
| Bindings | [`wit-bindgen`](https://github.com/bytecodealliance/wit-bindgen) (macro) |
| Target | `wasm32-wasip2` (WASI 0.2 reactor) |
| Output | a Component Model component exporting `better-together:gardener/player@0.1.0` |

Ferris uses the Rust **standard library** for console output (`println!` /
`eprintln!`) and nothing else exotic — no `cargo-component`, no hand-written
bindings. The `wit-bindgen::generate!` macro turns the WIT in [`wit/`](wit/) into
Rust traits at compile time.

A few deliberate choices:

- **`BTreeMap`, not `HashMap`** — `HashMap` pulls in `wasi:random/insecure-seed`
  for its hasher. `BTreeMap` avoids that import and gives deterministic ordering.
- **`&self` + `RefCell`** — the exported `gardener` resource methods take `&self`,
  so mutable per-match state lives behind a `RefCell`.
- **Reactor, not command** — `crate-type = ["cdylib"]` with no `fn main`.

### Build

```sh
rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2
```

Output: `target/wasm32-wasip2/release/ferris.wasm`.

### Verify

```sh
wasm-tools component wit target/wasm32-wasip2/release/ferris.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `metadata`, `match-start`, `talk`, `plant`, `vote`, and `match-end`.

## Where to look

- [`src/lib.rs`](src/lib.rs) — the whole bot: reputation tracking, the
  `talk` / `plant` decision split, and the banter pools.
- [`wit/world.wit`](wit/world.wit) — the tiny world that exports the player
  interface.
- [`wit/deps/gardener/gardener.wit`](wit/deps/gardener/gardener.wit) — the vendored
  data-plane (the `types` + `player` interfaces only).
