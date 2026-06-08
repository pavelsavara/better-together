# Engine Rules

[← Back to README](../README.md) · See also: [Player Rules](player-rules.md)

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

Each round runs in two phases so that talk can actually coordinate planting:

1. **Talk phase**: the engine calls every player's `talk` and collects one
   `signal` from each. All signals are then **broadcast to everyone** before a
   single seed is committed.
2. **Plant phase**: the engine calls every player's `plant`, passing the full
   set of this round's signals. Plants are submitted **simultaneously** — no
   player sees another's `plant` before committing their own.
3. **Compute garden**:
   - `garden_total` = sum of all `plant` values
   - `contributors` = number of players with `plant ≥ 3` (i.e., distinct
     *meaningful* gardeners — see §4)
4. **Compute multiplier** (see §4 below):
   - `multiplier = 1.0 + (0.5 × contributors)`
5. **Compute payout**:
   - `garden_payout = (garden_total × multiplier) / K`
   - Every player (including non-contributors) receives `garden_payout`.
6. **Compute individual round scores**:
   - `score_i = (10 - plant_i) + garden_payout`
7. **Broadcast observations** to all players (as in [Player Rules §4](player-rules.md#4-what-you-receive-each-round-your-observation)).

> **Why two phases?** Signals are revealed *before* plants, so a `BLOOM` promise
> can genuinely rally the table this round — and a `BLOOM` followed by `plant 0`
> is a visible, remembered lie. Talk is still **cheap** (unenforced), but it is
> no longer purely retrospective.

### 4. The Diversity Multiplier

```
multiplier(k) = 1.0 + 0.5 × k
```

Where `k` = number of distinct players who planted at least **3** seeds this round.

> **The contribution threshold.** A player counts as a *contributor* only if they
> plant `≥ 3`. This deliberately closes the "tokenism" loophole: planting a
> single seed and hoarding the other nine no longer buys a share of the diversity
> bonus. To be counted as helping the garden, you have to actually help it.

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

**Diversity reward**: the multiplier grows only with *distinct contributors*, not total seeds. One player dumping all 10 seeds alone gets a weak 1.5× multiplier. Four players each planting a real handful (≥ 3) unlock 3.0×. This directly incentivizes **broad, genuine participation** over a single generous martyr — and over a table of one-seed tokens — the "better together" mechanic.

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

> **A note on "Best Co-Player" vs. raw score** — and why new bot authors should
> read it carefully. Your *intuition* will push you to maximize your own match
> score (hoard a little, free-ride). The crown rewards the **opposite**: how much
> the groups you join out-perform the season average. The two leaderboards
> genuinely diverge, so optimize the one you want to win.
>
> One subtlety the table hides: eliciting cooperation only pays **against
> opponents who react to you**. In a field of purely unconditional bots, nothing
> you do changes *their* play, so the highest co-player score there belongs to
> the unconditional altruist (All-Bloom), not Tit-for-Tat. Tit-for-Tat wins once
> opponents are responsive — which, in a real season full of memory-keeping bots,
> they are. Build for a reactive world, but know which assumption you're betting
> on.

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
| Execution time  | 10 ms per `talk` or `plant` call |
| Memory          | 16 MB per instance         |
| Persistent blob | ≤ 4 KB returned from `match_end` |
| No network I/O  | Sandboxed; only game API available |

---

## Appendix B — Worked Example

**Setup**: 4 players, Round 5.

| Player | plant | signal | seeds_kept |
|--------|-------|--------|------------|
| Alice  | 8     | BLOOM  | 2          |
| Bob    | 0     | HOLD   | 10         |
| Carol  | 6     | BLOOM  | 4          |
| Dave   | 7     | WATCH  | 3          |

**Resolution**:
1. `garden_total` = 8 + 0 + 6 + 7 = **21**
2. `contributors` = 3 (Alice, Carol, Dave each planted ≥ 3; Bob planted 0, and a token 1–2 would not have counted either)
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

## Appendix C — Design Rationale

### Why Public Goods (not Prisoner's Dilemma)?
The PD is 2-player and binary (cooperate/defect). The public goods game is natively N-player and continuous (plant 0–10), making it richer, more visual, and more natural for a tournament with many bots.

### Why Diversity Multiplier?
Without it, one generous bot can subsidize the whole group alone. The diversity bonus means the *number of distinct contributors* matters — you can't just rely on one whale. This mechanically encodes "better together" and rewards **broad coalition building** over individual sacrifice.

### Why a contribution threshold (plant ≥ 3)?
If *any* non-zero plant counted, the cheapest way to grab the diversity bonus would be to plant a single seed and hoard the other nine — and a whole table doing exactly that ("everyone plants 1") is a stable, boring rut that looks cooperative but barely fills the garden. Requiring a meaningful stake (≥ 3) to be counted means the bonus rewards bots that genuinely show up, not bots that mime participation.

### Why "Best Co-Player" over raw score?
Raw score rewards clever exploitation. Co-Player Score rewards **making others better** — the exact value proposition of WASM components. A component that works beautifully with everything it's composed with is worth more than one that's individually fast but breaks every integration.

### Why fixed signals (not free text)?
Three signals keep the strategy space tractable, prevent arms races around natural language parsing, and make the game accessible to a 50-line bot. The limited vocabulary forces players to build trust through *actions over time*, not persuasive essays.

### Why split a round into talk *then* plant?
When signal and plant are submitted together, a signal can never coordinate the round it is sent in — it only ever feeds future reputation. Splitting the round into a **talk phase** (everyone broadcasts, signals revealed) followed by a **plant phase** lets a `BLOOM` actually rally the table *now*, and makes a `BLOOM` → `plant 0` an immediate, observable betrayal. Talk stays cheap (nothing forces you to honour it), but it finally does real coordination work.

### Why persistent identity?
Without memory, every round is a one-shot game and defection dominates. With identity and memory, **reputation** emerges: trust is earned, betrayal is remembered, and forgiveness is possible. This is where the real richness lives — and it mirrors the real-world WASM component ecosystem where packages have names and track records.