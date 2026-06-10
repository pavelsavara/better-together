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
   can target a hoarder. The table's votes are tallied and the plurality target
   has seeds seized from their pot into the garden (see §5).

| Field        | Phase | Type                     | Description                                    |
|--------------|-------|--------------------------|------------------------------------------------|
| `signal`     | talk  | One of: `BLOOM`, `HOLD`, `WATCH` | A public broadcast, revealed to everyone before planting. |
| `plant`      | plant | Integer, 0–10            | How many of your 10 seeds go into the shared garden. The rest (10 − plant) go into your own pot. |
| `vote`       | vote  | A player-id, or abstain  | Whom to tax this round (or `none`). Plant ≥ 3 this round → your ballot is worth **2 votes**, else **1**. |

Because talk happens first, a signal can genuinely **rally the table this round**
— but it is still cheap talk, and a `BLOOM` you don't honour is a betrayal
everyone sees the moment plants are revealed *and* a reason the table votes to
tax you.

### 3. Signals

Signals carry no enforced meaning — they are **cheap talk**. But because they're
revealed before plants *and* before the vote, they now both rally the plant and
foreshadow the tax. Suggested semantics:

| Signal  | Conventional Meaning                                         |
|---------|--------------------------------------------------------------|
| `BLOOM` | "I intend to plant generously" — and accept the tax if I lie. |
| `HOLD`  | "I intend to keep most/all of my seeds" — expect a vote.      |
| `WATCH` | "I'm deciding from the table" — including whom to tax.        |

You may use them honestly, deceptively, or as part of a private protocol with
allies. Because **all signals are revealed before anyone plants**, you can read
the room in your `plant` phase; and because **all plants are revealed before the
vote**, the table can punish a `BLOOM`-then-hoard liar the same round. Other
players will remember whether your signals matched your actions — and who you
voted to tax.

### 4. What You Receive Each Round (your observation)

During your **plant** phase, `state.signals` already holds every player's signal
for the current round (yours included). During your **vote** phase, `state.plants`
also holds every player's plant for the current round, so you can target a
hoarder.

After the round fully resolves, you observe the outcome — including every ballot
and the tax:

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
  tax_target: "bob",       // plurality vote, >= 2 weight
  tax_seized: 5,           // floor(bob.kept / 2) = floor(10/2)
  garden_payout_per_player: 13.0,   // (21 + 5) * 2 / 4
  your_score_this_round: 19.0
}
```

> Note: `bob` planted 0, so his ballot was worth only **1 vote**; alice, you, and
> carol each planted ≥ 3, so each cast **2 votes** — enough to tax bob's hoard
> into the garden.

### 5. Scoring (your match score)

Each round, your score is:

```
round_score = seeds_kept + garden_payout
```

Where:
- `seeds_kept` = 10 − plant (each worth exactly 1 point), **minus** any seeds
  taxed from you this round if you were the tax-target.
- `garden_payout` = ((garden_total + tax_seized) × **2**) ÷ K — the garden is
  flatly **doubled**; there is no diversity multiplier.
- `tax_seized` = `floor(target.kept / 2)`, minimum 1, taken from the plurality
  vote-target and added to the garden before doubling. No tax if no target
  reached quorum (2 vote-weight) or the top vote tied.

Planting **≥ 3** this round does not change your payout — it makes your ballot
worth **2 votes** instead of 1. The threshold is a *voting franchise*, not a
payout kink.

Your **match score** = sum of `round_score` across all rounds.

### 6. The Key Tension

Keeping a seed is worth **1 point to you, guaranteed**.

A *marginal* planted seed yields you only **2 ÷ K** points (0.5 at K=4, 0.33 at
K=6) — always < 1 — so each seed you plant is a small personal loss. But planting
creates **(2 ÷ K) × K = 2** points of total value for the group. Every seed you
plant costs you a little and helps the group a lot; every seed you keep helps you
a little and costs the group a lot. That is the dilemma, and a flat ×2 keeps it
alive at every group size.

**The vote is how the table resolves it.** You can't out-plant a hoarder into
profitability alone — but you *can* organize a tax. Confiscating a hoarder's kept
seeds doubles them into the garden, turning private hoarding into shared value.
That takes a **coalition**: a single ballot can't reach the 2-vote quorum, so
discipline requires allies.

**The contributor threshold is a franchise, not a target.** Planting ≥ 3 buys you
*two votes* — a real say in who gets taxed — but it does nothing for your payout,
so there is no clever reason to aim for "exactly 3." A table where everyone plants
the bare voting minimum fills almost nothing: low garden, low payout, low
Co-Player score for all. The number that *enfranchises* you and the number that
makes the group *rich* are nowhere near each other.

**Fill the garden, and organize the tax against those who won't.** That — not
fattening your own pot — is what the crown rewards.

### 7. Winning

You are ranked on the **"Best Co-Player" leaderboard** (see [Engine Rules §7](engine-rules.md#7-the-best-co-player-score)). Raw match scores are published but secondary. The question the tournament answers is:

> **"When you join a group, does the group flourish?"**

**Read this before you tune for raw score.** Your instinct will be to maximize
your *own* match score — which rewards a little hoarding and free-riding. The
crown rewards the opposite: how much better the groups you join do *because you
were in them*. A bot that scores well solo but drags its partners down lands at
the bottom of the primary leaderboard. If you remember one thing: **make your
table richer, not just your own pot.**

## Appendix A — Classic Strategies

These adapt directly to the three-phase round: pick a `signal` in `talk`, read
`state.signals` in `plant` to decide your seeds, then read `state.plants` in
`vote` to decide whom (if anyone) to tax.

| Name                | Logic                                                                 | Personality       |
|---------------------|-----------------------------------------------------------------------|-------------------|
| **All-Bloom**       | Always signal BLOOM, always plant 10, abstain from voting.            | Unconditional altruist |
| **All-Hoard**       | Always signal HOLD, always plant 0, abstain (and get taxed).          | Unconditional defector |
| **Tit-for-Tat**     | Round 1: signal BLOOM, plant 8. Then mirror the *group's average* plant from last round; signal BLOOM if you'll plant ≥ 5, else HOLD. Vote to tax the round's biggest hoarder. | Nice, retaliatory, forgiving |
| **Grudger**         | Plant 8 until anyone plants 0. Then plant 0 forever against that group, and vote to tax them every round. | Cooperative but unforgiving |
| **Pavlov**          | Plant 8 if last round's payout was above threshold, else plant 2. Abstain. | Win-stay, lose-shift |
| **Promiser**        | Always signal BLOOM. Plant 2 (below the contributor threshold) — so only 1 vote, and a prime tax target. | Deceptive free-rider |
| **Signal-Matcher**  | Match your plant level to the number of BLOOM signals broadcast *this* round. Abstain. | Conditional cooperator |
| **Union Boss**      | Plant generously, rally allies with BLOOM, and bloc-vote the fattest hoarder to tax their hoard into the garden. | Coalition organizer |
| **Random**          | Plant uniform random 0–10. Signal random. Vote random or abstain.     | Baseline noise     |
