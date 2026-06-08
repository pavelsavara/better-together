# 🦀 Corro — the rot beneath the petals

> Corro is the rot beneath the petals — Ferris's mirror and nemesis. He smiles in
> BLOOM and harvests in silence, certain that every generous gardener is simply a
> meal that hasn't noticed yet. He plants only to bait, and remembers only who is
> worth deceiving.

Corro is the **deceptive free-rider** of the [Better Together](../../README.md)
game — the cautionary counter-example to [Ferris](../ferris/README.md). Where
Ferris reads first, Corro reads second: study him to understand exactly which
behaviours the engine is designed to *punish*.

## The lore

Corro and Ferris are the same crab seen in two different lights. Ferris believes
the garden; Corro believes the garden is a buffet.

His play is deliberate, not random:

- **He always lies in the talk phase.** Corro broadcasts `BLOOM` every single
  round — a promise of generosity he never intends to keep.
- **He hunts the most generous opponent.** Each round he tallies the seeds every
  other player has planted so far and silently marks the biggest contributor as
  his "mark".
- **He feasts, then baits.** When the garden is alive (someone planted a real
  stake last round) he plants **nothing** and lets the multiplier pay him for
  free. When the garden goes barren he plants a small **bait** — just enough to
  coax the cooperators back so there's a harvest to steal again.

If [Ferris](../ferris/README.md) is seated, Corro greets his nemesis by name. His
gloating runs on stdout; his diagnostics on stderr. None of it is read by the
engine — it's there so you can watch a predator work in the console.

> Corro does well against naive, unconditional cooperators — and that's the point.
> The rules reward players who *condition* on behaviour (reputation, signals, the
> contribution threshold), which is exactly how Ferris eventually starves him out.

## The technology

| | |
|---|---|
| Language | Rust (edition 2024) |
| Bindings | [`cargo-component`](https://github.com/bytecodealliance/cargo-component) (checked-in `src/bindings.rs`) |
| Target | `wasm32-wasip1` (preview1 + bundled adapter → a Component) |
| Output | a Component Model component exporting `better-together:gardener/player@0.1.0` |

Corro is the **`cargo-component`** sibling to Ferris's hand-rolled `wit-bindgen`.
The bindings are generated into [`src/bindings.rs`](src/bindings.rs) (do **not**
edit them) and pulled in with `#[allow(warnings)] mod bindings;`.

A few notes:

- **The adapter trims imports.** Building for `wasm32-wasip1` and letting
  `cargo-component` apply the WASI adapter injects *only* the WASI imports actually
  used — so Corro's component has no `wasi:sockets` or `wasi:random` at all.
- **Determinism without `wasi:random`.** Corro's strategy is fully deterministic
  (it reads history, it doesn't roll dice), so it needs no randomness import.
- **Vendored dep must be declared.** `cargo-component` resolves the target world's
  deps from `Cargo.toml`, not by scanning `wit/deps`, so the vendored `gardener`
  package is declared under `[package.metadata.component.target.dependencies]`.

### Build

```sh
cargo component build --release
```

Output: `target/wasm32-wasip1/release/corro.wasm`.

### Verify

```sh
wasm-tools component wit target/wasm32-wasip1/release/corro.wasm
```

## Where to look

- [`src/lib.rs`](src/lib.rs) — the predator: `most_generous` (find the mark),
  `garden_alive_last_round` (feast-or-bait), the `talk` / `plant` split, and the
  banter pools.
- [`src/bindings.rs`](src/bindings.rs) — generated, do not edit.
- [`Cargo.toml`](Cargo.toml) — the `cargo-component` metadata, including the
  vendored `gardener` dependency.
