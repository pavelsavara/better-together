# 🐹 Gopher — the win-stay, lose-shift forager

<img src="gopher.png" alt="Gopher" width="200" align="right" />

> Gopher is the garden's tireless forager — a creature of pure habit who keeps
> digging wherever the last dig paid off, and abandons any hole that came up
> empty. He doesn't hold grudges and he doesn't read minds; he simply repeats
> what worked and flips away from what didn't. The dirt remembers; Gopher just
> follows it.

Gopher is the **Pavlov** bot (win-stay, lose-shift) of the
[Better Together](../../README.md) game, and the first **Go** sample in the
roster. He fills a strategy slot none of the other bots occupy: a player whose
decision depends only on *his own payoff*, never on who did what.

## The lore

Where [Ferris](../ferris/README.md) tracks reputations and
[Corro](../corro/README.md) hunts marks, Gopher ignores other players entirely.
His whole world is one question asked each round:

> *"Did my last dig pay off?"*

- **Win → stay.** If the previous round paid him well, he keeps doing exactly
  what he did: same generosity, same signal.
- **Lose → shift.** If the previous round paid poorly, he flips to the opposite
  behaviour — a generous Gopher clams up, a stingy Gopher opens his paws.
- **Vote on reflex.** The same Pavlov instinct carries into the tax phase. If his
  last round paid off (his score cleared his aspiration of 14), Gopher is content
  and abstains; if it fell short, he lashes out at the fattest hoarder — the
  seated player who kept the most seeds (anyone keeping ≤ 2 is untaxable). No
  ledger and no grudge, just whether the last dig paid.

This is the famous **win-stay, lose-shift** rule. It's remarkably effective: it
cooperates with cooperators (both keep winning, both keep staying), recovers from
the occasional bad round, and refuses to be a permanent sucker — a single bad
payoff is enough to make him shift. He opens every match optimistically (a full,
generous dig) and lets the payouts steer him from there.

Gopher narrates his reasoning on stdout — cheerful, single-minded, and forever
talking about dirt and holes. It's pure flavor; the engine never reads it.

> **Pavlov vs the field.** Against cooperators Gopher settles into mutual
> generosity. Against an exploiter like Corro his payoff sags, so he *shifts* to
> keeping his seeds and stops feeding the predator — exactly the self-correcting behaviour
> the rule is famous for.

## The technology

| | |
|---|---|
| Language | Go |
| Compiler | [TinyGo](https://tinygo.org) (`-target=wasip2`) |
| Bindings | [`wit-bindgen-go`](https://go.bytecodealliance.org) (`go.bytecodealliance.org/cm`) |
| Target | WASI 0.2 (TinyGo emits a Component Model component directly) |
| Output | a component exporting `better-together:gardener/player@0.1.0` |

Gopher is the **Go** counterpart to the Rust and JavaScript samples. TinyGo's
`wasip2` backend compiles Go straight to a WebAssembly **component** — no
preview1 adapter or separate `componentize` step needed.

A few notes:

- **Generated bindings.** `wit-bindgen-go` turns the WIT in [`wit/`](wit/) into a
  Go package under [`internal/`](internal/). The exported `gardener` resource is
  implemented by assigning the generated `Exports.*` function variables and using
  the `cm` helper types (`cm.Result`, `cm.List`, `cm.Option`, …) for the
  Component Model value mapping.
- **No persistence needed.** Pavlov reacts only to the *previous* round, which the
  engine already hands back in `round-state.history`. Gopher keeps a little
  in-match state but writes nothing to the virtual filesystem.
- **TinyGo, not standard Go.** The component backend (`-target=wasip2`) is a
  TinyGo feature; standard `go build` targets only `GOOS=wasip1` core modules.

### Prerequisites

- [Go](https://go.dev/dl/) (toolchain used by TinyGo)
- [TinyGo](https://tinygo.org/getting-started/install/) 0.34+
- `wit-bindgen-go`:
  `go install go.bytecodealliance.org/cmd/wit-bindgen-go@latest`
- [`wasm-opt`](https://github.com/WebAssembly/binaryen) on `PATH` (or point
  `WASMOPT` at it) — TinyGo runs it during the `wasip2` build.

### Build

```sh
# 1. Generate Go bindings from the WIT (writes into ./internal)
wit-bindgen-go generate --world gopher --out internal ./wit

# 2. Compile to a WASI 0.2 component
tinygo build -target=wasip2 --wit-package ./wit --wit-world gopher -o gopher.wasm .
```

Output: `gopher.wasm`.

### Verify

```sh
wasm-tools component wit gopher.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `metadata`, `match-start`, `talk`, `plant`, `vote`, and `match-end`.

## Where to look

- [`main.go`](main.go) — the whole bot: the win-stay/lose-shift core, the
  `talk` / `plant` split, and the banter pools.
- [`wit/world.wit`](wit/world.wit) — the `gopher` world that exports the player
  interface and pulls in `wasi:cli/imports` (the WASI 0.2 set the TinyGo
  runtime needs).
- [`wit/deps/gardener/gardener.wit`](wit/deps/gardener/gardener.wit) — the vendored
  data-plane (the `types` + `player` interfaces only).
- [`wit/deps/`](wit/deps) — the vendored WASI 0.2 WIT (`cli`, `clocks`,
  `filesystem`, `io`, `random`, `sockets`) so the component encoder can resolve
  TinyGo's runtime imports offline.

