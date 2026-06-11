# The Gardeners

> The roster of sample bots for [Better Together](../README.md). Each is a real
> WASM component, written in a different language, playing its own strategy in
> the cooperative gardening game. Read [Ferris](ferris/README.md) first — it's the
> clean, well-commented reference cooperator.

Each gardener's `README.md` covers the lore, the strategy, and how that
language compiles down to a WASM component. The full strategy logic for every
bot is also collected in [docs/pseudo.md](../docs/pseudo.md).

| Gardener | Language | In a nutshell |
|----------|----------|---------------|
| [🦀 Ferris](ferris/README.md) | Rust | The eternal optimist — reputation-aware reference cooperator who forgives slowly and trusts gladly. |
| [🐙 Corro](corro/README.md) | Rust | The rot beneath the petals — a deceptive predator (Ferris's nemesis) who baits, then feasts. |
| [🐹 Gopher](gopher/README.md) | Go | The win-stay, lose-shift forager — honest Pavlov who stays when winning and shifts when losing. |
| [🐭 Dusty](dusty/README.md) | Grain | The cautious pantry mouse — graduated Tit-for-Tat who shelters in numbers and creeps up slowly. |
| [🐀 Keith](keith/README.md) | C++ | The ledger-keeping sewer rat — generous Tit-for-Tat who taxes whoever breaks a `BLOOM` promise. |
| [🦔 Andy](andy/README.md) | C# | The forgiving hedgehog — Tit-for-Tat with friend memory and periodic olive branches. |
| [🎲 Khaos](khaos/README.md) | JavaScript | The dice god — hands down permanent friend/foe verdicts and speaks in meaningless signals. |
| [🦫 Bram](bram/README.md) | C# | The guild boss — coalition organizer who rallies allies and bloc-votes the fattest hoarder. |
| [🦊 Reynard](reynard/README.md) | JavaScript | The velvet-gloved skimmer — always credible, quietly trims the commons when no arbiter watches. |
| [🖋️ Nib](nib/README.md) | Hand-written WAT | The smallest gardener — a minimalist signal-matcher that keeps no memory and never taxes. |

> 🐺 **Attacker** ([source](attacker/src/lib.rs)) is not a real player — it's a
> malicious capability probe that attempts forbidden network, socket, oversized
> filesystem writes, and path traversal, all of which the sandbox must trap.
