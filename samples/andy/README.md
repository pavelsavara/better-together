# 🦔 Andy — the forgiving hedgehog

<img src="andy.png" alt="Andy" width="200" align="right" />

> Andy is the garden's gentle reciprocator — soft-bellied and trusting by
> default, but the moment you prick him he curls into a ball of spines. Poke him
> and he pulls his seeds back; treat him kindly and he unrolls and shares again.
> He judges you by your digging, never your talk — deeds over words. He forgives,
> eventually, because a hedgehog can't stay curled up forever.

Andy is a **Tit-for-Tat** bot of the [Better Together](../../README.md) game,
and the first **C#** sample in the roster. He plays the strategy the
[engine rules](../../docs/engine-rules.md#7-the-best-co-player-score) single out
as the **"Best Co-Player" champion in a reactive field**: nice, retaliatory, and
forgiving.

> **Andy vs [Keith](../keith/README.md).** Both are Tit-for-Tat at heart, but
> they reciprocate on *different things*. Keith is the **promise-enforcer**: he
> punishes you for a `BLOOM` you didn't honour — he cares whether your **words**
> matched your deeds. Andy ignores talk completely and mirrors the table's
> **actual planting** — pure *deeds*. One polices honesty; the other simply
> copies behaviour.

## The lore

Where [Ferris](../ferris/README.md) is a *naive* collaborator and
[Gopher](../gopher/README.md) reacts only to his own payoff, Andy reacts to **the
table's behaviour** — and only to what players actually *did*, never to what they
*said*. His rule each round:

- **Open soft.** Round 1 he exposes his belly: signal `BLOOM`, plant generously.
- **Mirror the table.** From then on he matches the group's *average plant last
  round* (read from `history`, i.e. real deeds). A generous table keeps him
  generous; a stingy table makes him curl up and pull his seeds toward the
  contributor floor.
- **Forgive.** Even against a cold table he periodically un-rolls and plants
  generously once, testing whether cooperation can restart — so he never gets
  stuck in permanent mutual defection the way a pure grudger does.
- **Signal honestly.** `BLOOM` when he means to plant ≥ 5, otherwise `HOLD`. His
  spines are a visible *warning*, never a bluff.
- **Name the free-rider — but forgive first.** Andy holds his ballot for the first
  few rounds (an olive branch), then aims at the most *persistent* free-rider: a
  seated player who has dug below the contributor stake (< 3) for at least two
  rounds and still keeps more than the untaxable minimum. He never points at a
  guild member (Bram, Nib, Gopher) or the other arbiter Keith, nor at a remembered
  friend. The one exception is [Reynard](../reynard/README.md) — the velvet-gloved
  skimmer never plants low enough to register as a defector, so Andy, an arbiter
  who sees the skim for what it is, names the fox on sight whenever he is seated.

> **Deeds over words.** Andy deliberately ignores the *current* round's signals
> when deciding how much to plant — that's [Nib](../nib/README.md)'s job, and
> policing whether a promise was *kept* is [Keith](../keith/README.md)'s. A table
> can promise `BLOOM` all it likes; Andy waits to see the seeds hit the dirt and
> reciprocates *next* round.

### Memory: warm to friends, cold-forgetful of foes

Andy's memory is deliberately **asymmetric**, and it's the most hedgehog thing
about him:

- **Friends are remembered across matches — with slow decay.** Anyone who plays
  collaboratively earns a lasting "trust" score, persisted as JSON on his virtual
  filesystem. Trust **fades gently** over time if it isn't refreshed, so old
  friendships cool but never vanish overnight. A trusted friend at the table
  makes Andy quicker to bloom and quicker to forgive.
- **Foes are remembered only within the current match.** A defector makes Andy
  curl up *for this match*, but he writes **no grudges to disk**. Next match he
  meets everyone with a clean slate — the hedgehog uncurls between encounters.

The friend-book lives at `andy-memory.json` in the first preopened directory;
set the `ANDY_MEMORY_PATH` environment variable to relocate it.

This complements the rest of the roster: Ferris remembers *both* friends and
defectors forever, [Khaos](../khaos/README.md) remembers *foes* forever by a coin
flip — Andy is the one who only lets the *good* stick.

## The technology

| | |
|---|---|
| Language | C# (.NET 10) |
| Compiler | [componentize-dotnet](https://github.com/bytecodealliance/componentize-dotnet) (NativeAOT-LLVM) |
| Bindings | [`wit-bindgen`](https://github.com/bytecodealliance/wit-bindgen) C# generator (wrapped by the SDK) |
| Target | `wasi-wasm` (NativeAOT-LLVM emits a Component Model component directly) |
| Output | a component exporting `better-together:gardener/player@0.1.0` |

Andy is the **C#** counterpart to the Rust, Go, JavaScript, C++, and WAT samples.
[`componentize-dotnet`](https://github.com/bytecodealliance/componentize-dotnet)
wraps NativeAOT-LLVM, `wit-bindgen`, the WASI SDK, and `wasm-tools` behind a
single NuGet reference: a `dotnet build` ahead-of-time compiles the C# straight
to a WASI 0.2 **component** — no preview1 adapter or separate `componentize`
step.

A few notes:

- **Class library, not an executable.** Because Andy *exports* an interface he is
  built with `<OutputType>library</OutputType>`; the `gardener` resource is
  implemented by the generated bindings' partial/abstract types.
- **`InvariantGlobalization`** keeps the component small and avoids pulling in an
  ICU dependency — Andy never needs culture-aware formatting.
- **Persistence through the BCL.** `System.IO.File` is lowered by the .NET
  runtime onto the `wasi:filesystem` imports, so Andy's friend-book is written
  with ordinary `File.ReadAllText` / `File.WriteAllText`.

### Prerequisites

- [.NET 10 preview SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
  (the toolchain image pins `10.0.100-preview.2.25164.34`, which matches
  `componentize-dotnet` `0.7.0-preview00010`).
- Network access on the **first** build: the SDK downloads and caches a
  compatible WASI SDK + LLVM.

The [`nuget.config`](nuget.config) adds the `dotnet-experimental` feed that hosts
the NativeAOT-LLVM ilcompiler.

### Build

```sh
dotnet build -c Release
```

Output: `bin/Release/net10.0/wasi-wasm/native/andy.wasm`.

### Verify

```sh
wasm-tools component wit bin/Release/net10.0/wasi-wasm/native/andy.wasm
```

You should see the component exporting `better-together:gardener/player@0.1.0`
with `metadata`, `match-start`, `talk`, `plant`, `vote`, and `match-end`.

## Where to look

- [`src/AndyImpl.cs`](src/AndyImpl.cs) — the thin export glue: translates the
  generated Component Model bindings into plain types and calls into the brain.
- [`src/Strategy.cs`](src/Strategy.cs) — the binding-independent brain: the
  Tit-for-Tat core, the `talk` / `plant` split, and the asymmetric friend/foe
  memory (`Brain`, `FriendBook`, and the tunable `Knobs`).
- [`src/Banter.cs`](src/Banter.cs) — the hedgehog flavor text (stdout only).
- [`andy.csproj`](andy.csproj) — the componentize-dotnet wiring (`wasi-wasm` RID,
  NativeAOT settings, and the `<Wit>` item selecting the `andy` world).
- [`wit/world.wit`](wit/world.wit) — the `andy` world that re-exports the player
  interface; WASI imports come from the .NET runtime automatically.
- [`wit/deps/gardener/gardener.wit`](wit/deps/gardener/gardener.wit) — the
  vendored data-plane (the `types` + `player` interfaces only).
