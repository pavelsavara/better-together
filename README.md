# Better Together

> A cooperative-dilemma game for algorithmic players.
> Built to showcase WASM components: polyglot bots, sandboxed execution, and the proof that composition wins.

---

## The Pitch

1. Every round you get **10 seeds** — plant each one in your **own pot** (safe, worth 1 point) or in the **shared garden**.
2. Seeds in the garden are **doubled and split equally** among all players — so the more everyone plants, the bigger the bloom.
3. You're always tempted to keep everything and live off everyone else's planting — but if everyone keeps, the garden dies and everyone loses.
4. Each round you broadcast **one signal** to coordinate — but signals are cheap talk; you can lie.
5. After plants are revealed, the table **votes**: name a free-rider to **tax**, and the seeds they kept *above a small untaxable minimum* are reclaimed into the garden for everyone — so a generous planter is always safe. Contribute a real stake (plant ≥ 3) and your ballot counts double.
6. Every match runs **at least 8 rounds**; after that, each round has a **1-in-3 chance of being the last** — so no round is ever known to be the final one, and there's no safe "last round" to defect on.
7. The tournament crown isn't "highest score" — it's **"Best Co-Player"**: whose presence makes every group they join thrive?

> **"When you join a group, does the group flourish?"**

---

## Documentation

| Read this if you want to…                          | Document |
|----------------------------------------------------|----------|
| **Write a bot** — the full player-facing contract  | [Player Rules](docs/player-rules.md) |
| **Understand scoring** — how the host runs the tournament| [Engine Rules](docs/engine-rules.md) |

Two quick jumping-off points:

- New bot authors start at [Player Rules → Your Turn](docs/player-rules.md#2-your-turn-three-phases-talk-plant-then-vote) and the [classic strategy table](docs/player-rules.md#appendix-a--classic-strategies).
- Curious how you actually *win*? See [Engine Rules → The "Best Co-Player" Score](docs/engine-rules.md#7-the-best-co-player-score).

---

## The Contracts (WIT)

The game is defined by two WebAssembly Interface Type packages:

| Package | File | Role |
|---------|------|------|
| `better-together:game`      | [wit/game.wit](wit/game.wit)               | The tournament **engine** world (host side). |
| `better-together:gardener`  | [wit/gardener.wit](wit/gardener.wit)       | The **player** contract every bot implements. |

To implement a bot you only need the [`player` interface](wit/gardener.wit): export a
`gardener` resource with `metadata`, `match-start`, `talk`, `plant`, `vote`, and `match-end`.

---

## Sample Bots

Polyglot by design — every bot is just a component, regardless of source language.

| Bot | Language | Personality | Source |
|-----|----------|-------------|--------|
| **Ferris** | Rust (`wasm32-wasip2`) | Reputation-aware, naively collaborative | [samples/ferris](samples/ferris) |
| **Corro**  | Rust (`wasm32-wasip1`) | Deceptive free-rider — the enemy of Ferris | [samples/corro](samples/corro) |
| **Khaos**  | JavaScript (`jco`) | Dice god — friend or foe forever, words at random | [samples/khaos](samples/khaos) |
| **Gopher** | Go (TinyGo `wasip2`) | Pavlov forager — win-stay, lose-shift out of pure habit | [samples/gopher](samples/gopher) |
| **Nib**  | Hand-written `.wat` | Minimalist signal-matcher — matches the table's blooms, no memory | [samples/nib](samples/nib) |
| **Keith**  | C++ (`wasm32-wasip2`) | Ledger-keeping sewer rat — generous Tit-for-Tat that enforces promises | [samples/keith](samples/keith) |
| **Andy**   | C# (`wasi-wasm`) | Forgiving hedgehog — Tit-for-Tat on deeds, warm to friends, cold-forgetful of foes | [samples/andy](samples/andy) |
| **Dusty**  | Grain (`.gr`) | Cautious pantry mouse — graduated Tit-for-Tat that mirrors the table's average | [samples/dusty](samples/dusty) |
| **Reynard** | JavaScript (`jco`) | Velvet-gloved skimmer — the polite opportunist who skims fat tables and tries not to draw a taxing coalition | [samples/reynard](samples/reynard) |
| **Bram**   | C# (`componentize-dotnet`) | Guild boss — organizes a voting bloc, taxes free-riders, plays for the whole table | [samples/bram](samples/bram) |

Inspect a built component's interface with [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools):

```sh
wasm-tools component wit samples/corro/target/wasm32-wasip1/release/corro.wasm
```

---

## Repository Layout

```
better-together/
├── docs/           Player Rules, Engine Rules & Architecture
├── wit/            The game and player (gardener) contracts
├── samples/        Reference bots (Ferris, Corro, Khaos, Gopher, Nib, Keith, Andy, Dusty)
├── game/           Tournament host implementation
└── README.md       You are here
```

---

## License

[MIT](LICENSE).
