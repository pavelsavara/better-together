# 🦫 Bram — the union boss

> Bram doesn't play for his own pot. He plays for his *table*. He knows his
> members by name, rallies them every round, keeps the dam full, and when a
> hoarder sits down to skim the common stream, he calls the vote and taxes them
> dry. He never crosses a member, and he never lets a member be punished alone.
> When Bram is at your table, the whole table does better — which is exactly the
> crown this tournament hands out.

> **Status: design sketch.** This README captures Bram's intended character and
> strategy. There is no implementation yet — code comes after the rules for
> voting/taxation are ratified.

Bram is the **coalition organizer** of the [Better Together](../../README.md)
game — the bot the **Best-Co-Player crown** is built to reward. Every other
sample plays its *own* hand; Bram plays the *room*. He is the living argument
that, in this game, the winning skill is organizing cooperation and disciplining
free-riders — not maximizing your private pot.

## The lore

Beavers build communal dams; Bram builds communal gardens. His playbook:

- **Fill the garden, lead from the front.** He signals `BLOOM` honestly and
  plants generously every round — the table's anchor contributor.
- **Run the union.** Bram recognizes his members by player-id and coordinates the
  bloc: he keeps the table's payout high enough that his members keep cooperating,
  and he steers their behaviour where he can (see *The union*, below).
- **Direct the tax.** When the vote opens, Bram aims the union's ballots at the
  **fattest hoarder** at the table — the one with the most kept seeds to seize.
  The tax pulls that hoard into the garden, where it's doubled and shared, so
  *disciplining a free-rider literally makes Bram's table richer.* That is how an
  organized table out-earns a table of lone altruists.
- **Never crosses a member; defends them.** Bram never votes against a union
  member, and if an outsider moves to tax one of his own, he rallies the bloc to
  shield them. Loyalty is the glue that makes the union a reliable voting bloc.

## The union

Bram's power is that two of the game's simplest bots are, in effect, his
members — steerable by a boss who understands them:

- **[Micro](../micro/README.md) — the unwitting member.** Micro plants
  `(number of BLOOM signals this round) + 4`. Bram doesn't need Micro's *consent*
  — every `BLOOM` the union broadcasts mechanically *pumps* Micro's plant. Micro
  is too simple to know it's in a union; it just follows the promises, and Bram
  manufactures them.
- **[Gopher](../gopher/README.md) — the loyal reflex.** Gopher is win-stay,
  lose-shift: he repeats whatever paid off last round. Bram keeps the union's
  payout above Gopher's aspiration, so Gopher stays generous out of pure habit.
  The boss farms the forager's reflex.

## Relationships

- **[Khaos](../khaos/README.md)'s sworn foe.** The coin-flip god has Bram on his
  permanent **FOE** list — the dice-god despises organized labor on principle.
  Khaos hoards against any table Bram sits at, which makes Bram's job harder and
  their rivalry one of the tournament's running feuds.
- **Nemesis of the free-riders.** [Corro](../corro/README.md) and
  [Reynard](../reynard/README.md) are exactly who Bram's tax exists to punish —
  the blatant feaster and the polite skimmer. Catching the *skimmer* (who stays
  above the floor on purpose) is the harder, more interesting hunt.
- **Natural ally of the disciplinarians.** [Keith](../keith/README.md) and
  [Andy](../andy/README.md) share Bram's politics; a table with two of them is a
  voting bloc that can tax even a careful hoarder.

## The technology (planned)

| | |
|---|---|
| Language | C# |
| Bindings | [`componentize-dotnet`](https://github.com/bytecodealliance/componentize-dotnet) (same toolchain as [Andy](../andy/README.md)) |
| Target | a Component Model component exporting `better-together:gardener/player@0.1.0` |
| Persistence | `wasi:filesystem` — a roster of known members and the hoarders he's taxed before |

## Where to look

- Once implemented, `src/` will hold the boss logic: member recognition, the
  bloc-rally signalling, the hoarder-targeting vote, and member defense.
- For the role this bot fills — and why the crown rewards it — see the design
  discussion in the top-level [README](../../README.md).
