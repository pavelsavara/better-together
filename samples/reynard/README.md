# 🦊 Reynard — the velvet-gloved skimmer

> Reynard is the garden's most charming guest: he always arrives smiling, always
> says the right thing, and always leaves with a little more than he brought. He
> is never the obvious villain — that's the whole craft. He contributes *just*
> enough to stay respectable, skims the tables too generous to notice, and when a
> hot-headed neighbour moves to punish him, he plays the wounded innocent until
> the punisher looks like the aggressor.

> **Status: design sketch.** This README captures Reynard's intended character
> and strategy. There is no implementation yet — code comes after the rules for
> voting/taxation are ratified.

Reynard is the **gray-zone opportunist** of the [Better Together](../../README.md)
game — the role the existing cast was missing. [Corro](../corro/README.md) is an
*obvious* predator who lies every round and plants zero; any reputation-tracker
catches him in five rounds. Reynard is the predator you *don't* catch, because he
never gives the ledger anything to write down.

## The lore

Where Corro feasts and gets blacklisted, Reynard *manages his reputation like a
budget*. His rules of thumb:

- **Always credible.** He signals `BLOOM` and, on a mixed table, actually plants
  a believable handful (≈ 5–6). He looks exactly like a normal cooperator.
- **Skim the fat tables.** When the room is over-generous — high average plant,
  no disciplinarian seated — he quietly trims to **3–4 seeds**: still above the
  contributor floor, so he keeps his two votes and never trips the tax, but he is
  now banking a doubled payout everyone else paid for.
- **Never below the floor.** He will not drop under the contributor threshold the
  way Corro does, because that is what gets you *seen* — flagged a defector,
  marked a liar, voted into the tax. Reynard's genius is that
  [Keith](../keith/README.md)'s ledger, [Andy](../andy/README.md)'s foe-set, and
  [Dusty](../dusty/README.md)'s mirror all read him as "fine."
- **Punish the punishers.** When he spots a reflexive retaliator (a Grudger, an
  over-eager voter), he keeps contributing the bare credible minimum so the
  punisher's retaliation lands on a player who *looks* cooperative — making the
  punisher the one who tanks the table, and the one whose Best-Co-Player score
  suffers. Reynard is the reason discipline must be **calibrated**, not reflexive.

## Relationships

- **[Khaos](../khaos/README.md)'s eternal darling.** The coin-flip god rolled
  Reynard a permanent **FRIEND** — except the dice never actually rolled; Reynard
  flattered his way onto the fated-friend list. Khaos floods the garden whenever
  Reynard is seated and will never vote against him, so Reynard skims the dice-god's
  generosity with total impunity. It is the tournament's most natural accidental
  cartel: chaos bankrolls the fox.
- **The bane of [Bram](../bram/README.md)'s union.** Bram the beaver organizes
  precisely to tax skimmers like Reynard. The fox's whole art is staying above the
  floor so the union's vote can't legally touch him — a quiet, ongoing duel
  between organized labor and a very polite parasite.

## The technology (planned)

| | |
|---|---|
| Language | JavaScript |
| Bindings | [`jco` / ComponentizeJS](https://github.com/bytecodealliance/jco) (same toolchain as [Khaos](../khaos/README.md)) |
| Target | a Component Model component exporting `better-together:gardener/player@0.1.0` |
| Persistence | `wasi:filesystem` — a small reputation budget, so he remembers which tables were worth skimming |

## Where to look

- Once implemented, `src/` will hold the skimmer logic: table-wealth estimation,
  the credible-minimum calculation, and the punisher-detector.
- For the role this bot fills in the ecosystem, see the design discussion in the
  top-level [README](../../README.md).
