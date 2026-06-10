# Engine Rules

[← Back to README](../README.md) · See also: [Player Rules](player-rules.md)

*This is how the tournament host operates. Players don't need to read this section to compete, but advanced strategists will benefit from understanding the scoring system.*

### 1. Tournament Structure

```
Tournament (permanent — always running)
 └── Many Matches (random group compositions, drawn continuously)
      └── R Rounds per match (random length)
```

- The tournament is **permanent**: a bot registers once and plays forever. There
  are no seasons or resets — the engine keeps drawing fresh random groups and
  running matches for as long as the bot is entered.
- Each **match** groups K players drawn from the pool and runs them together for R rounds.
- Groups are assigned **randomly** by the engine, so over time every bot faces many different combinations of opponents.
- The leaderboard is **live**: scores are recomputed continuously over a trailing
  window of recent matches (see [§7](#7-the-best-co-player-score)).

### 2. Match Composition

| Parameter          | Value         | Notes                                   |
|--------------------|---------------|-----------------------------------------|
| Group size (K)     | 4–6           | Drawn uniformly at random per match     |
| Rounds per match   | 8 + geometric | Min 8; after round 8 each further round happens with prob 2/3 (public hazard 1/3). Mean ≈ 10. Realized length unknown to players. |
| Match draw         | continuous    | The engine draws random groups indefinitely; every subset gets well-sampled over time |

- Bots receive `match_start` with the list of player IDs in their group and K, but **not** the number of rounds.
- Because any round after the 8th may be the last — and none is *ever* known to be — there is no fixed final round to backward-induct from, so "last round defection" has no base case to unravel from.

### 3. Round Resolution (executed by engine)

Each round runs in **three phases** so that talk can coordinate planting and the
table can collectively discipline a hoarder:

1. **Talk phase**: the engine calls every player's `talk` and collects one
   `signal` from each. All signals are then **broadcast to everyone** before a
   single seed is committed.
2. **Plant phase**: the engine calls every player's `plant`, passing the full
   set of this round's signals. Plants are submitted **simultaneously** — no
   player sees another's `plant` before committing their own — then every plant
   is **revealed** to the table.
3. **Vote phase**: the engine calls every player's `vote`, passing this round's
   revealed `plants`. Each player names one player to **tax**, or abstains.
   **Vote weight**: a player who planted **≥ 3** this round (a *contributor*)
   casts **2 votes**; everyone else casts **1**. Abstaining costs nothing.
4. **Resolve the tax**:
   - Tally, per named target, both the **number of distinct voters** and their
     **total vote-weight**.
   - A target is eligible only if **at least two distinct voters** named it. Among
     eligible targets, the one whose vote-weight is the **uniquely highest** is the
     `tax-target`. Fewer than two voters on every target, or a tie for the top
     weight, means **no tax**.
   - A player who **kept 0** seeds (planted all 10) **cannot be taxed**: if the
     elected target kept nothing, the round produces **no tax**.
   - Otherwise seize `floor(kept / 2)`, minimum **1**, from the tax-target's pot
     (`kept = 10 - plant`) and **add the seized seeds to the garden**.
5. **Compute the garden**:
   - `garden_total` = sum of all `plant` values (before tax)
   - `garden = garden_total + tax_seized`
6. **Compute payout** (flat doubling):
   - `garden_payout = (garden × 2) / K`
   - Every player (including the taxed one) receives `garden_payout`.
7. **Compute individual round scores**:
   - `kept_i = 10 - plant_i`, minus `tax_seized` if `i` is the `tax-target`
   - `score_i = kept_i + garden_payout`
8. **Broadcast observations** to all players (as in [Player Rules §4](player-rules.md#4-what-you-receive-each-round-your-observation)), including the full ballot list.

> **Why three phases?** Signals are revealed before plants, so a `BLOOM` promise
> can rally the table *now* — and a `BLOOM` followed by `plant 0` is a visible
> betrayal. Plants are revealed before the vote, so the betrayal is **punishable
> the same round**: the table can vote to tax the liar's hoard into the garden.
> Talk is still cheap (unenforced), but it now both coordinates the plant and
> arms the vote.

### 4. Doubling, the Vote & the Tax

The garden is **flatly doubled**:

```
garden_payout = ((garden_total + tax_seized) × 2) / K
```

**Why a flat ×2 keeps the dilemma.** A marginal seed you plant returns you only
`2 / K` (0.5 at K=4, 0.33 at K=6) — always less than the 1 point you'd keep — so
the temptation to hoard always exists. But each planted seed creates `2` points
of total value for the group. The dilemma holds at every group size; "everyone
hoards" is still the one-shot Nash trap, and cooperation must be rescued by
*reputation and the vote*, not by a payout curve.

**The contributor threshold is a franchise.** Planting ≥ 3 grants you **2 votes
instead of 1**. The threshold buys only political weight: to help *weed* the
garden, you must hold a real stake *in* it. It never touches your payout, so
there is no payoff reason to aim for "exactly 3" — the number that *enfranchises*
you and the number that makes the group *rich* are nowhere near each other.

**The tax is how discipline pays.** Seizing a hoarder's kept seeds and doubling
them into the garden converts a privately-hoarded seed (worth 1) into shared,
doubled value (worth 2). That is the "better together" mechanic in this design:
not a lone martyr subsidising the table, but the table **collectively
confiscating** what a free-rider tried to keep.

#### The coalition is load-bearing

A single disciplinarian **cannot** tax anyone: a tax needs **at least two
different voters** aimed at the same target, so even a contributor's 2-vote
ballot can't punish alone, and the biggest punishments need a bloc. Punishment
therefore *requires* allies —
which is exactly why a union (see [Bram](../samples/bram/README.md)) out-performs
a lone altruist, and why collusion is a first-class, intended strategy rather
than an exploit. Random match composition keeps any one bloc's edge bounded.

#### The welfare identity (why this fixes the crown)

Sum the round scores and almost everything cancels:

```
group_total(round) = 10K + garden_total + tax_seized
```

Group welfare rises with exactly two things a player can influence: **how full
the garden is** (their own plant, plus the plants they *elicit*) and **how much
hoarding the table confiscates**. An unconditional altruist (All-Bloom) lifts the
first term only by its own hand; a disciplinarian who *deters* hoarders into
planting more, and *taxes* the ones who don't, lifts both — and so wins the
[Best Co-Player](#7-the-best-co-player-score) crown *whenever opponents are
deterrable*. That is the design's answer to the "All-Bloom wins" failure of a
flat welfare metric.

### 5. Match Termination

- Every match runs **at least 8 rounds**.
- After round 8, the match ends with a **public hazard rate of 1/3** after each
  round — equivalently, each further round happens with probability 2/3. The
  expected match length is ≈ 10 rounds.
- The hazard rate is public (it's right here), but the **realized** length R is
  never revealed — and because the stop is a fresh coin-flip every round, **no
  round is ever known to be the last**. There is no fixed endpoint to defect on.
- The engine enforces an undisclosed hard cap purely so a match cannot run
  forever; it is astronomically unlikely to be reached and carries no strategic
  weight.

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

Computed continuously over a **trailing window** of recent matches:

```
co_player_score(i) = mean(group_total(m) for recent matches m containing player i)
                   − mean(group_total(m) for all recent matches m in the window)
```

Where `group_total(m)` = sum of all players' match scores in match m. The window
(a fixed number of recent matches, or an exponential decay with a half-life
measured in matches) keeps the baseline tracking the **current** field as the
meta evolves, instead of being diluted by long-obsolete matches.

**Interpretation**:
- **Positive** → groups perform above average when you're present.
- **Negative** → groups perform below average when you're present.
- **Zero** → you have no net effect on group performance.

Because groups are **randomly composed** by the engine, this converges to the **Shapley value** of each player's contribution to coalition performance — the unique fair attribution from cooperative game theory.

#### Fairness to New Players & Convergence

The score is a *difference from the current field's mean*, so it never depends on
how long you've competed: a bot that registered yesterday is measured on exactly
the same footing as one that has played for months. There is no starting rating
to climb out of, no seniority bonus, and no penalty for being new — a strong new
entrant can top the board as soon as it has played enough matches.

Because matches are composed randomly, each Co-Player Score is an unbiased
estimate whose noise shrinks with the number of matches it averages over (roughly
as 1/√matches). Convergence is therefore measured in **matches played, not
calendar time**: a few hundred matches in the trailing window give a stable
ranking, which the permanent engine reaches quickly for any actively-entered bot.
One fluke table can't crown anyone; a persistent effect on your tables shows up
fast.

| Strategy              | Individual Score | Co-Player Score | Why                                                  |
|-----------------------|-----------------|-----------------|------------------------------------------------------|
| Always hoard          | Medium          | **Negative**    | Adds nothing to the garden and is a prime tax target; group total drops |
| Always plant (naive)  | Low             | Positive        | Fills the garden by its own hand, but can't deter or tax hoarders |
| Disciplinarian (cooperate, mirror, **vote to tax**) | High | **Highly positive** | Elicits cooperation *and* confiscates hoards into the garden — lifts both terms of `group_total` |
| Deceptive (signal BLOOM, plant 0)    | High short-term | **Negative** | Lies in talk, gets taxed the same round, partners distrust — cooperation collapses |

> **A note on "Best Co-Player" vs. raw score** — and why new bot authors should
> read it carefully. Your *intuition* will push you to maximize your own match
> score (hoard a little, free-ride). The crown rewards the **opposite**: how much
> the groups you join out-perform the field average. Recall the identity
> `group_total = 10K + garden_total + tax_seized` — you win by *filling the
> garden* (your plant plus the plants you elicit) and by *confiscating hoards*
> (the tax you organize), not by fattening your own pot.
>
> One subtlety: both eliciting cooperation and taxing hoarders only pay **against
> opponents who react** — a hoarder you can deter into planting, a liar a bloc can
> tax. In a field of purely unconditional bots, nothing you do changes their
> play, so the altruist (All-Bloom) ties the disciplinarian. The disciplinarian
> *pulls ahead* the moment opponents are deterrable and bloc-taxable — which, in a
> real field full of memory-keeping bots and union voters, they are. Build for a
> reactive world.

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
| Execution time  | 10 ms per `talk`, `plant`, or `vote` call |
| Memory          | 16 MB per instance         |
| Persistent blob | ≤ 4 KB returned from `match_end` |
| No network I/O  | Sandboxed; only game API available |

---

## Appendix B — Worked Example

**Setup**: 4 players (K=4), Round 5.

| Player | plant | signal | seeds_kept |
|--------|-------|--------|------------|
| Alice  | 8     | BLOOM  | 2          |
| Bob    | 0     | HOLD   | 10         |
| Carol  | 6     | BLOOM  | 4          |
| Dave   | 7     | WATCH  | 3          |

**Talk → Plant → Vote**, then resolution:

1. `garden_total` = 8 + 0 + 6 + 7 = **21**
2. **Vote weight**: Alice, Carol, Dave each planted ≥ 3 → **2 votes** each; Bob
   planted 0 → **1 vote**. Bob is the obvious hoarder, so Alice, Carol, and Dave
   all vote to tax Bob (Bob abstains).
3. **Tax**: three distinct voters named Bob (6 vote-weight) — a coalition with the
   uniquely highest weight, and Bob kept 10 (> 0), so he is taxable. Bob is the
   `tax-target`. Seize `floor(kept / 2)` = `floor(10 / 2)` = **5** seeds
   from Bob's pot into the garden.
4. `garden` = 21 + 5 = **26**
5. `garden_payout` = 26 × 2 / 4 = **13.0** (everyone gets this — even Bob)
6. Round scores (`kept` minus tax for Bob, plus payout):

| Player | seeds_kept | tax | garden_payout | round_score |
|--------|-----------|-----|---------------|-------------|
| Alice  | 2         | —   | 13.0          | **15.0**    |
| Bob    | 10        | −5  | 13.0          | **18.0**    |
| Carol  | 4         | —   | 13.0          | **17.0**    |
| Dave   | 3         | —   | 13.0          | **16.0**    |

**Observation**: Bob still edges the round (18.0) — a single tax doesn't erase a
free-ride — but the tax pulled him down from an untaxed 20.5 and lifted everyone
else by 2.5. Check the identity: `group_total` = 15+18+17+16 = **66** =
`10K + garden_total + tax_seized` = 40 + 21 + 5. Had Bob also planted 8, no tax
would be needed, `garden_total` = 29, and `group_total` = 40 + 29 = **69** — still
strictly better. **Cooperation dominates; the tax just makes hoarding cost the
hoarder and pay the table.**

Over many rounds, the table taxes Bob whenever he hoards, and his reputation
follows him into future matches — steadily eroding both his raw gain and his
Co-Player Score.

## Appendix C — Design Rationale

### Why Public Goods (not Prisoner's Dilemma)?
The PD is 2-player and binary (cooperate/defect). The public goods game is natively N-player and continuous (plant 0–10), making it richer, more visual, and more natural for a tournament with many bots.

### Why a flat double?
A flat ×2 is the simplest possible rule — "whatever's planted is doubled and
shared" — with no payout curve to reverse-engineer and no salient "plant exactly
at the threshold" target. It pushes all the "better together" pressure onto the
**vote**: the table grows the garden by *confiscating* hoards, not by a lone
whale's sacrifice.

### Why a contribution threshold (plant ≥ 3)?
The threshold is the **voting franchise**: plant ≥ 3 and you cast 2 votes instead
of 1. To help *weed* the garden you must hold a real stake *in* it — pure
hoarders can't be kingmakers. The threshold never touches payout, so it governs
only your political weight, never the size of your harvest.

### Why a vote-and-tax (instead of pure withdrawal)?
In a public-goods game the only other punishment channel is *withholding seeds* —
but withholding lowers the garden, i.e. it destroys the very welfare the crown
measures, which structurally favours the unconditional altruist. A **targeted
tax** is a separate channel: it docks one named hoarder *without* taxing the
whole table, and (because seized seeds are doubled into the garden) it actively
*creates* welfare. That is what lets calibrated discipline out-score naive
generosity — and what makes coalitions necessary, since the tax needs a voting
bloc to reach quorum.

### Why "Best Co-Player" over raw score?
Raw score rewards clever exploitation. Co-Player Score rewards **making others better** — the exact value proposition of WASM components. A component that works beautifully with everything it's composed with is worth more than one that's individually fast but breaks every integration.

### Why fixed signals (not free text)?
Three signals keep the strategy space tractable, prevent arms races around natural language parsing, and make the game accessible to a 50-line bot. The limited vocabulary forces players to build trust through *actions over time*, not persuasive essays.

### Why split a round into talk, plant, *then* vote?
When signal and plant are submitted together, a signal can never coordinate the
round it is sent in — it only ever feeds future reputation. The **talk phase**
(everyone broadcasts, signals revealed) lets a `BLOOM` rally the table *now*, and
makes a `BLOOM` → `plant 0` an immediate, observable betrayal. The **vote phase**
(plants revealed, then ballots cast) lets the table *act* on that betrayal the
same round, taxing the liar's hoard into the garden. Talk stays cheap, but it now
both coordinates the plant and arms the vote.

### Why persistent identity?
Without memory, every round is a one-shot game and defection dominates. With identity and memory, **reputation** emerges: trust is earned, betrayal is remembered, and forgiveness is possible. This is where the real richness lives — and it mirrors the real-world WASM component ecosystem where packages have names and track records.