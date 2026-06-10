# Player Rules

[← Back to README](../README.md) · See also: [Engine Rules](engine-rules.md)

*This is everything a bot author needs to know to submit a strategy.*

### 1. Match Setup

- You are one of **K players** in a match (typically K = 4–6).
- You know the **identity** of every player in your group (a persistent, unique ID).
- You remember everything that happened in **previous rounds of this match** and in **previous matches** with the same opponents.
- You do **not** know how many rounds remain in this match.

### 2. Your Turn (three phases: talk, plant, then vote)

Every round runs in **three phases**, and your component is called once per phase:

1. **Talk** — `talk(state)` returns your `signal`. Every player's signal is then
   broadcast to the whole table **before anyone plants**.
2. **Plant** — `plant(state)` returns how many seeds you commit. By now you can
   see everyone's signal for *this* round (in `state.signals`), but **not** their
   plants — plants are still simultaneous and hidden until this phase resolves.
   Then **every plant is revealed** to the whole table.
3. **Vote** — `vote(state)` returns one player-id to **tax**, or `none` to
   abstain. By now `state.plants` holds everyone's plant for this round, so you
   can target a free-rider. The table's votes are tallied and the plurality target
   has seeds reclaimed from their pot into the garden (see §5).

| Field        | Phase | Type                     | Description                                    |
|--------------|-------|--------------------------|------------------------------------------------|
| `signal`     | talk  | One of: `BLOOM`, `HOLD`, `WATCH` | A public broadcast, revealed to everyone before planting. |
| `plant`      | plant | Integer, 0–10            | How many of your 10 seeds go into the shared garden. The rest (10 − plant) go into your own pot. |
| `vote`       | vote  | A player-id, or abstain  | Whom to tax this round (or `none`). Plant ≥ 3 this round → your ballot is worth **2 votes**, else **1**. |

Talk comes first, so a signal can rally the table this round. But it's still
cheap talk: a `BLOOM` you don't honour is a betrayal everyone sees when plants
are revealed — and a reason they vote to tax you.

### 3. Signals

Signals carry no enforced meaning — they are **cheap talk**. But they're revealed
before plants and before the vote, so they both rally the planting and hint at
who'll be taxed. Suggested meanings:

| Signal  | Conventional Meaning                                         |
|---------|--------------------------------------------------------------|
| `BLOOM` | "I intend to plant generously" — and accept the tax if I lie. |
| `HOLD`  | "I intend to keep most/all of my seeds" — expect a vote.      |
| `WATCH` | "I'm deciding from the table" — including whom to tax.        |

Use them honestly, deceptively, or as a private code with allies. Signals are
revealed before anyone plants, so you can read the room before committing seeds;
plants are revealed before the vote, so the table can tax a `BLOOM`-then-keep
liar the same round. Others remember whether your signals matched your actions —
and whom you voted to tax.

### 4. What You Receive Each Round (your observation)

In your **plant** phase, `state.signals` holds every player's signal for this
round (yours included). In your **vote** phase, `state.plants` also holds every
player's plant, so you can target a free-rider.

When the round resolves, you see the full outcome — every ballot and the tax:

```
{
  round: 7,
  players: [
    { id: "alice", plant: 8, signal: "BLOOM" },
    { id: "bob",   plant: 0, signal: "HOLD"  },
    { id: "you",   plant: 6, signal: "BLOOM" },
    { id: "carol", plant: 7, signal: "WATCH" }
  ],
  votes: [
    { voter: "alice", target: "bob" },
    { voter: "you",   target: "bob" },
    { voter: "carol", target: "bob" },
    { voter: "bob",   target: null  }
  ],
  garden_total: 21,        // sum of plants, before tax
  tax_target: "bob",       // 3 distinct voters, uniquely highest weight
  tax_collected: 4,           // floor((bob.kept - 2) / 2) = floor(8/2)
  garden_payout_per_player: 12.5,   // (21 + 4) * 2 / 4
  your_score_this_round: 16.5
}
```

> Note: `bob` planted 0, so his ballot was worth only **1 vote**; alice, you, and
> carol each planted ≥ 3, so each cast **2 votes**. Three distinct voters named
> bob with the uniquely highest weight, and bob kept seeds to reclaim — enough to
> tax his stash into the garden.

### One Round in 20 Seconds

A K=4 table — you are **you**:

1. **Talk.** alice and you broadcast `BLOOM`; carol `WATCH`; bob `HOLD`.
2. **Plant.** alice plants 8, carol 7, you 6 — all ≥ 3, so each is a *contributor*
   with **2 votes**. bob plants **0** (1 vote). Every plant is revealed.
3. **Vote.** alice, carol, and you each name **bob**, the obvious hoarder; bob
   abstains. Three distinct voters, bob's weight is uniquely highest, and bob kept
   10 (above the untaxable minimum of **2**) — so bob is taxed. (One voter alone,
   even a contributor, could not.)
4. **Resolve.** `garden_total` = 8 + 7 + 6 + 0 = **21**. Reclaim `floor((10 - 2) / 2)` =
   **4** from bob → `garden` = 25. Payout = 25 × 2 ÷ 4 = **12.5** to everyone.
5. **Score.** You kept 4, plus 12.5 → **16.5** this round. bob kept 10, lost 4 to the
   tax, plus 12.5 → **18.5** — still ahead for one round, but the table closed the gap
   and bob's reputation for keeping follows him into the next match.

Now the formal version.

### 5. Scoring (your match score)

Each round, your score is:

```
round_score = seeds_kept + garden_payout
```

Where:
- `seeds_kept` = 10 − plant (each worth exactly 1 point), **minus** any seeds
  taxed from you this round if you were the tax-target.
- `garden_payout` = ((garden_total + tax_collected) × **2**) ÷ K — everything in the
  garden is **doubled**, then split equally among all K players.
- `tax_collected` = `floor((target.kept - 2) / 2)`, minimum 1, taken from the
  tax-target and added to the garden before doubling. Every player keeps an
  **untaxable minimum of 2 seeds**, so a player who kept ≤ 2 (planted ≥ 8) can't
  be taxed at all. A target also needs **at least two distinct voters** and the
  **uniquely highest** vote-weight. No tax if no target clears those bars or the
  top weight ties.

Planting **≥ 3** this round doesn't change your payout — it makes your ballot worth
**2 votes** instead of 1. The threshold is your *voice in the vote*.

Your **match score** = sum of `round_score` across all rounds.

### 6. The Key Tension

Keeping a seed is worth **1 point, guaranteed**. A seed you plant returns you only
**2 ÷ K** points (0.5 at K=4, 0.33 at K=6) — always less than 1. So every seed you
plant is a small personal loss, but it adds **2** points of value to the group.
Keep, and you help yourself a little while costing the group a lot; plant, and you
cost yourself a little while helping the group a lot. That's the dilemma, and the
flat ×2 keeps it alive at every group size.

**The vote is how the table fights back.** You can't out-plant a free-rider on your
own — but you can organise a tax. Reclaiming a free-rider's kept seeds doubles them into
the garden, turning private hiding into shared value. That needs a **coalition**:
a lone ballot can't tax anyone — a tax needs at least two voters aimed at the same
target, so discipline takes allies.

**The threshold is a voice, not a target.** Planting ≥ 3 buys you two votes —
a real say in who gets taxed — but nothing for your payout, so there's no reason to
aim for "exactly 3." A table where everyone plants the bare minimum fills almost
nothing: low garden, low payout, low Co-Player score for all. Aim to fill the
garden, and organise the tax against those who won't. That — not fattening your
own pot — is what the crown rewards.

### 7. Winning

You are ranked on the **"Best Co-Player" leaderboard** (see [Engine Rules §7](engine-rules.md#7-the-best-co-player-score)). Raw match scores are published but secondary. The question the tournament answers is:

> **"When you join a group, does the group flourish?"**

This is measured across **many matches against many random rosters** in a
permanent, always-running tournament, so a single lucky or unlucky table doesn't
decide your rank — only your consistent effect on the groups you join.

**Read this before you tune for raw score.** Your instinct is to maximise your
*own* match score — which rewards a little hiding and free-riding. The crown
rewards the opposite: how much better the groups you join do *because you were
there*. A bot that scores well alone but drags its partners down lands at the
bottom of the primary leaderboard. If you remember one thing: **make your table
richer, not just your own pot.**

## Appendix A — Classic Strategies

These adapt directly to the three-phase round: pick a `signal` in `talk`, read
`state.signals` in `plant` to decide your seeds, then read `state.plants` in
`vote` to decide whom (if anyone) to tax.

| Name                | Logic                                                                 | Personality       |
|---------------------|-----------------------------------------------------------------------|-------------------|
| **All-Bloom**       | Always signal BLOOM, always plant 10, abstain from voting.            | Unconditional altruist |
| **All-Keep**       | Always signal HOLD, always plant 0, abstain (and get taxed).          | Unconditional defector |
| **Tit-for-Tat**     | Round 1: signal BLOOM, plant 8. Then mirror the *group's average* plant from last round; signal BLOOM if you'll plant ≥ 5, else HOLD. Vote to tax the round's biggest hoarder. | Nice, retaliatory, forgiving |
| **Grudger**         | Plant 8 until anyone plants 0. Then plant 0 forever against that group, and vote to tax them every round. | Cooperative but unforgiving |
| **Pavlov**          | Plant 8 if last round's payout was above threshold, else plant 2. Abstain. | Win-stay, lose-shift |
| **Promiser**        | Always signal BLOOM. Plant 2 (below the contributor threshold) — so only 1 vote, and a prime tax target. | Deceptive free-rider |
| **Signal-Matcher**  | Match your plant level to the number of BLOOM signals broadcast *this* round. Abstain. | Conditional cooperator |
| **Guild Boss**      | Plant generously, rally allies with BLOOM, and bloc-vote the fattest hoarder to tax their stash into the garden. | Coalition organizer |
| **Random**          | Plant uniform random 0–10. Signal random. Vote random or abstain.     | Baseline noise     |
