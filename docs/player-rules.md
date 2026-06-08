# Player Rules

[← Back to README](../README.md) · See also: [Engine Rules](engine-rules.md)

*This is everything a bot author needs to know to submit a strategy.*

### 1. Match Setup

- You are one of **K players** in a match (typically K = 4–6).
- You know the **identity** of every player in your group (a persistent, unique ID).
- You remember everything that happened in **previous rounds of this match** and in **previous matches** with the same opponents.
- You do **not** know how many rounds remain in this match.

### 2. Your Turn (two phases: talk, then plant)

Every round runs in **two phases**, and your component is called once per phase:

1. **Talk** — `talk(state)` returns your `signal`. Every player's signal is then
   broadcast to the whole table **before anyone plants**.
2. **Plant** — `plant(state)` returns how many seeds you commit. By now you can
   see everyone's signal for *this* round (in `state.signals`), but **not** their
   plants — plants are still simultaneous and hidden until the round resolves.

| Field        | Phase | Type                     | Description                                    |
|--------------|-------|--------------------------|------------------------------------------------|
| `signal`     | talk  | One of: `BLOOM`, `HOLD`, `WATCH` | A public broadcast, revealed to everyone before planting. |
| `plant`      | plant | Integer, 0–10            | How many of your 10 seeds go into the shared garden. The rest (10 − plant) go into your own pot. |

Because talk happens first, a signal can genuinely **rally the table this round**
— but it is still cheap talk, and a `BLOOM` you don't honour is a betrayal
everyone sees the moment plants are revealed.

### 3. Signals

Signals carry no enforced meaning — they are **cheap talk**. Suggested semantics:

| Signal  | Conventional Meaning                        |
|---------|---------------------------------------------|
| `BLOOM` | "I intend to plant generously this round."  |
| `HOLD`  | "I intend to keep most/all of my seeds."    |
| `WATCH` | "I'm deciding based on what others do."     |

You may use them honestly, deceptively, or as part of a private protocol with allies. Because **all signals are revealed before anyone plants**, you can read the room in your `plant` phase: a table full of `BLOOM` is an invitation to plant generously — if you trust it. Other players will remember whether your signals matched your actions.

### 4. What You Receive Each Round (your observation)

During your **plant** phase, `state.signals` already holds every player's signal
for the current round (yours included) — that's how talk informs planting.

After all players have planted and the round resolves, you observe the full
outcome:

```
{
  round: 7,
  players: [
    { id: "alice", plant: 8, signal: "BLOOM" },
    { id: "bob",   plant: 2, signal: "HOLD"  },
    { id: "you",   plant: 6, signal: "BLOOM" },
    { id: "carol", plant: 7, signal: "WATCH" }
  ],
  garden_total: 23,
  multiplier: 3.0,
  garden_payout_per_player: 17.25,
  your_score_this_round: 21.25
}
```

> Note: `bob` planted only 2 here, so despite his presence he does **not** count
> toward `multiplier` — only plants of **3 or more** make you a contributor (see
> §5).

### 5. Scoring (your match score)

Each round, your score is:

```
round_score = seeds_kept + garden_payout
```

Where:
- `seeds_kept` = 10 − plant (each worth exactly 1 point)
- `garden_payout` = (total seeds in garden × multiplier) ÷ K
- `multiplier` = 1.0 + 0.5 × (number of players who planted **≥ 3** this round)

A token plant of 1 or 2 still goes into the garden, but it does **not** raise the
multiplier — you only become a *contributor* at 3 seeds or more.

Your **match score** = sum of `round_score` across all rounds.

### 6. The Key Tension

Keeping a seed is worth **1 point to you, guaranteed**.

A *marginal* planted seed yields you only **multiplier ÷ K** points (always < 1),
so once you're already a contributor, each extra seed is a small personal loss.

But planting creates **(multiplier ÷ K) × K = multiplier** points of total value
for the group (always > 0). The group gains.

**The first-seed exception.** There is one case where planting pays *you* too:
crossing the contributor threshold (your 3rd seed) bumps the multiplier by 0.5
for **everyone's** payout, including your own. When the rest of the table is
already generous, becoming a contributor can be net-positive for you — "plant a
real handful" is sometimes free money, not sacrifice. Past that jump, the
marginal-loss logic returns.

**Every seed you plant costs you a little but helps the group a lot. Every seed you keep helps you a little but costs the group a lot.** That's the dilemma — with a sweet spot exactly at the contributor threshold.

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

These adapt directly to the two-phase round: pick a `signal` in `talk`, then read
`state.signals` in `plant` to decide your seeds.

| Name                | Logic                                                                 | Personality       |
|---------------------|-----------------------------------------------------------------------|-------------------|
| **All-Bloom**       | Always signal BLOOM, always plant 10.                                  | Unconditional altruist |
| **All-Hoard**       | Always signal HOLD, always plant 0.                                    | Unconditional defector |
| **Tit-for-Tat**     | Round 1: signal BLOOM, plant 8. Then mirror the *group's average* plant from last round; signal BLOOM if you'll plant ≥ 5, else HOLD. | Nice, retaliatory, forgiving |
| **Grudger**         | Plant 8 until anyone plants 0. Then plant 0 forever against that group. | Cooperative but unforgiving |
| **Pavlov**          | Plant 8 if last round's payout was above threshold, else plant 2.      | Win-stay, lose-shift |
| **Promiser**        | Always signal BLOOM. Plant 2 (below the contributor threshold).        | Deceptive free-rider |
| **Signal-Matcher**  | Match your plant level to the number of BLOOM signals broadcast *this* round (now visible before you plant). | Conditional cooperator |
| **Random**          | Plant uniform random 0–10. Signal random.                              | Baseline noise     |
