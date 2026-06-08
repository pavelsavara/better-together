# Better Together

> A cooperative-dilemma game for algorithmic players.
> Built to showcase WASM components: polyglot bots, sandboxed execution, and the proof that composition wins.

---

## The 5-Sentence Pitch

1. Every round you get **10 seeds** — plant each one in your **own pot** (safe, worth 1 point) or in the **shared garden**.
2. Seeds in the garden are **multiplied and split equally** among all players — the more *different* gardeners contribute, the bigger the bloom.
3. You're always tempted to hoard and live off everyone else's planting — but if everyone hoards, the garden dies and everyone loses.
4. Each round you broadcast **one signal** to coordinate — but signals are cheap talk; you can lie.
5. The tournament crown isn't "highest score" — it's **"Best Co-Player"**: whose presence makes every group they join thrive?

---

## Part I — Player Rules

*This is everything a bot author needs to know to submit a strategy.*

### 1. Match Setup

- You are one of **K players** in a match (typically K = 4–6).
- You know the **identity** of every player in your group (a persistent, unique ID).
- You remember everything that happened in **previous rounds of this match** and in **previous matches** with the same opponents.
- You do **not** know how many rounds remain in this match.

### 2. Your Turn (simultaneous, every round)

Each round, all players act simultaneously. You submit exactly two things:

| Field        | Type                     | Description                                    |
|--------------|--------------------------|------------------------------------------------|
| `plant`      | Integer, 0–10            | How many of your 10 seeds go into the shared garden. The rest (10 − plant) go into your own pot. |
| `signal`     | One of: `BLOOM`, `HOLD`, `WATCH` | A public broadcast visible to all players this round. |

Both are revealed to everyone at the end of the round.

### 3. Signals

Signals carry no enforced meaning — they are **cheap talk**. Suggested semantics:

| Signal  | Conventional Meaning                        |
|---------|---------------------------------------------|
| `BLOOM` | "I intend to plant generously this round."  |
| `HOLD`  | "I intend to keep most/all of my seeds."    |
| `WATCH` | "I'm deciding based on what others do."     |

You may use them honestly, deceptively, or as part of a private protocol with allies. Other players will remember whether your signals matched your actions.

### 4. What You Receive Each Round (your observation)

After all players act, you observe:

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

### 5. Scoring (your match score)

Each round, your score is:

```
round_score = seeds_kept + garden_payout
```

Where:
- `seeds_kept` = 10 − plant (each worth exactly 1 point)
- `garden_payout` = (total seeds in garden × multiplier) ÷ K

Your **match score** = sum of `round_score` across all rounds.

### 6. The Key Tension

Keeping a seed is worth **1 point to you, guaranteed**.

Planting a seed yields you only **multiplier ÷ K** points (which is always < 1). You personally lose by planting.

But planting creates **(multiplier ÷ K) × K = multiplier** points of total value for the group (which is always > K × 0). The group gains.

**Every seed you plant costs you a little but helps the group a lot. Every seed you keep helps you a little but costs the group a lot.** That's the dilemma.

### 7. Winning

You are ranked on the **"Best Co-Player" leaderboard** (see Engine Rules). Raw match scores are published but secondary. The question the tournament answers is:

> **"When you join a group, does the group flourish?"**

---

## Part II — Engine Rules

*This is how the tournament host operates. Players don't need to read this section to compete, but advanced strategists will benefit from understanding the scoring system.*

### 1. Tournament Structure

```
Tournament
 └── Season (one leaderboard cycle)
      └── Many Matches (random group compositions)
           └── R Rounds per match (random length)
```

- A **season** consists of many matches, enough to give every pair of bots many opportunities to interact.
- Each **match** groups K players drawn from the pool and runs them together for R rounds.
- Groups are assigned **randomly** by the engine, but every bot will face many different combinations of opponents over a season.

### 2. Match Composition

| Parameter          | Value         | Notes                                   |
|--------------------|---------------|-----------------------------------------|
| Group size (K)     | 4–6           | Drawn uniformly at random per match     |
| Rounds per match   | 8–12          | Drawn uniformly at random; unknown to players |
| Matches per season | ≥ C(N,K) × 3 | Enough that all subsets are well-sampled |

- Bots receive `match_start` with the list of player IDs in their group and K, but **not** the number of rounds.
- The uncertain endpoint prevents "last round defection" unraveling.

### 3. Round Resolution (executed by engine)

Each round, in order:

1. **Collect actions**: all players submit `(plant, signal)` simultaneously.
2. **Compute garden**:
   - `garden_total` = sum of all `plant` values
   - `contributors` = number of players with `plant ≥ 1` (i.e., distinct gardeners)
3. **Compute multiplier** (see §4 below):
   - `multiplier = 1.0 + (0.5 × contributors)`
4. **Compute payout**:
   - `garden_payout = (garden_total × multiplier) / K`
   - Every player (including non-contributors) receives `garden_payout`.
5. **Compute individual round scores**:
   - `score_i = (10 - plant_i) + garden_payout`
6. **Broadcast observations** to all players (as in Player Rules §4).

### 4. The Diversity Multiplier

```
multiplier(k) = 1.0 + 0.5 × k
```

Where `k` = number of distinct players who planted at least 1 seed this round.

| Contributors (k) | Multiplier | Return per seed planted (K=4) | Return per seed planted (K=6) |
|-------------------|-----------|-------------------------------|-------------------------------|
| 0                 | 1.0       | —                             | —                             |
| 1                 | 1.5       | 0.375                         | 0.250                         |
| 2                 | 2.0       | 0.500                         | 0.333                         |
| 3                 | 2.5       | 0.625                         | 0.417                         |
| 4                 | 3.0       | 0.750                         | 0.500                         |
| 5                 | 3.5       | —                             | 0.583                         |
| 6                 | 4.0       | —                             | 0.667                         |

**Key property**: the return per seed planted is *always* less than 1 (the value of keeping it), so the individual temptation to hoard always exists — but the *group's* total value created per planted seed equals the multiplier, which exceeds 1. The dilemma holds at every group size.

**Diversity reward**: the multiplier grows only with *distinct contributors*, not total seeds. One player dumping all 10 seeds alone gets a weak 1.5× multiplier. Four players each planting even 1 seed unlock 3.0×. This directly incentivizes **broad participation** over a single generous martyr — the "better together" mechanic.

### 5. Match Termination

- The number of rounds R is drawn uniformly from [8, 12] at match start.
- Players are **not informed** of R.
- After round R, the match ends and final match scores are recorded.

### 6. Identity & Memory

- Each bot has a **persistent, globally unique ID** (e.g., their component name).
- At match start, bots receive the list of IDs in their group.
- Bots may maintain **persistent memory** across rounds and across matches:
  - Within a match: full history is provided each round.
  - Across matches: bots may store and retrieve a private state blob (≤ 4 KB) between matches, enabling reputation tracking, grudges, and alliances.

### 7. The "Best Co-Player" Score

This is the primary tournament ranking.

#### Intuition

> "How much better does a group perform when *you* are in it?"

A bot that cooperates reliably and elicits cooperation from others will consistently raise group scores. A free-rider may score okay individually but drags the group down — and the leaderboard punishes that.

#### Formal Definition (Approximate Shapley Value)

Over a season with many randomly composed matches:

```
co_player_score(i) = mean(group_total(m) for all matches m containing player i)
                   − mean(group_total(m) for all matches m in the season)
```

Where `group_total(m)` = sum of all players' match scores in match m.

**Interpretation**:
- **Positive** → groups perform above average when you're present.
- **Negative** → groups perform below average when you're present.
- **Zero** → you have no net effect on group performance.

Because groups are **randomly composed** by the engine, this converges to the **Shapley value** of each player's contribution to coalition performance — the unique fair attribution from cooperative game theory.

#### Why This Works

| Strategy              | Individual Score | Co-Player Score | Why                                                  |
|-----------------------|-----------------|-----------------|------------------------------------------------------|
| Always hoard          | Medium          | **Negative**    | Partners get less from the garden; group total drops  |
| Always plant (naive)  | Low             | Slightly positive | Generous but exploitable; groups do OK               |
| Tit-for-Tat (cooperate, then mirror) | High | **Highly positive** | Elicits cooperation, punishes defectors, forgives — groups thrive |
| Deceptive (signal BLOOM, plant 0)    | High short-term | **Negative** | Partners learn to distrust; cooperation collapses   |

### 8. Secondary Leaderboard: Raw Score

For bragging rights, also publish:

```
raw_score(i) = mean(match_score(i, m) for all matches m containing player i)
```

This is the "selfish" leaderboard. It will often be topped by sophisticated exploiters — but the **primary crown** is Co-Player Score, and the cultural emphasis of the tournament is on that.

### 9. Tiebreakers

1. Co-Player Score (primary).
2. Consistency: standard deviation of group_total in matches containing the player (lower is better — you reliably uplift).
3. Raw Score (secondary).

### Constraints

| Resource        | Limit                      |
|-----------------|----------------------------|
| Execution time  | 10 ms per `turn` call      |
| Memory          | 16 MB per instance         |
| Persistent blob | ≤ 4 KB returned from `match_end` |
| No network I/O  | Sandboxed; only game API available |

---

## Appendix A — Worked Example

**Setup**: 4 players, Round 5.

| Player | plant | signal | seeds_kept |
|--------|-------|--------|------------|
| Alice  | 8     | BLOOM  | 2          |
| Bob    | 0     | HOLD   | 10         |
| Carol  | 6     | BLOOM  | 4          |
| Dave   | 7     | WATCH  | 3          |

**Resolution**:
1. `garden_total` = 8 + 0 + 6 + 7 = **21**
2. `contributors` = 3 (Alice, Carol, Dave planted ≥ 1; Bob planted 0)
3. `multiplier` = 1.0 + 0.5 × 3 = **2.5**
4. `garden_payout` = 21 × 2.5 / 4 = **13.125** (everyone gets this — even Bob)
5. Round scores:

| Player | seeds_kept | garden_payout | round_score |
|--------|-----------|---------------|-------------|
| Alice  | 2         | 13.125        | **15.125**  |
| Bob    | 10        | 13.125        | **23.125**  |
| Carol  | 4         | 13.125        | **17.125**  |
| Dave   | 3         | 13.125        | **16.125**  |

**Observation**: Bob free-rode and scored highest this round. But Alice, Carol, and Dave all scored above the "everyone hoards" baseline of 10. If all four had planted 8, the multiplier would have been 3.0 and the payout would have been 24.0 — everyone would have scored 26.0, far above Bob's 23.125. **Cooperation dominates, but only if it's mutual.**

Over many rounds, Alice/Carol/Dave will learn to either pressure Bob (via signals + conditional strategies) or reduce their own planting when Bob is present — lowering Bob's parasitic gain and his Co-Player Score.

---

## Appendix B — Classic Strategies

| Name                | Logic                                                                 | Personality       |
|---------------------|-----------------------------------------------------------------------|-------------------|
| **All-Bloom**       | Always plant 10, signal BLOOM.                                         | Unconditional altruist |
| **All-Hoard**       | Always plant 0, signal HOLD.                                           | Unconditional defector |
| **Tit-for-Tat**     | Plant 8 on round 1. Then mirror the *group's average* plant from last round. Signal BLOOM if planting ≥ 5, else HOLD. | Nice, retaliatory, forgiving |
| **Grudger**         | Plant 8 until anyone plants 0. Then plant 0 forever against that group. | Cooperative but unforgiving |
| **Pavlov**          | Plant 8 if last round's payout was above threshold, else plant 2.      | Win-stay, lose-shift |
| **Promiser**        | Always signal BLOOM. Plant 2.                                          | Deceptive free-rider |
| **Signal-Matcher**  | Match your plant level to the number of BLOOM signals you saw last round. | Conditional cooperator |
| **Random**          | Plant uniform random 0–10. Signal random.                              | Baseline noise     |

---

## Appendix C — Design Rationale

### Why Public Goods (not Prisoner's Dilemma)?
The PD is 2-player and binary (cooperate/defect). The public goods game is natively N-player and continuous (plant 0–10), making it richer, more visual, and more natural for a tournament with many bots.

### Why Diversity Multiplier?
Without it, one generous bot can subsidize the whole group alone. The diversity bonus means the *number of distinct contributors* matters — you can't just rely on one whale. This mechanically encodes "better together" and rewards **broad coalition building** over individual sacrifice.

### Why "Best Co-Player" over raw score?
Raw score rewards clever exploitation. Co-Player Score rewards **making others better** — the exact value proposition of WASM components. A component that works beautifully with everything it's composed with is worth more than one that's individually fast but breaks every integration.

### Why fixed signals (not free text)?
Three signals keep the strategy space tractable, prevent arms races around natural language parsing, and make the game accessible to a 50-line bot. The limited vocabulary forces players to build trust through *actions over time*, not persuasive essays.

### Why persistent identity?
Without memory, every round is a one-shot game and defection dominates. With identity and memory, **reputation** emerges: trust is earned, betrayal is remembered, and forgiveness is possible. This is where the real richness lives — and it mirrors the real-world WASM component ecosystem where packages have names and track records.