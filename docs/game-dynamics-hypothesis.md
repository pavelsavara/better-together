# Game Dynamics — Hypotheses & Roster Scenarios

[← Back to README](../README.md) · See also: [Engine Rules](engine-rules.md) · [Player Rules](player-rules.md)

*This document records what we **believe** the redesigned game (geometric horizon
+ flat ×2 garden + the vote-and-tax) will do. It is deliberately falsifiable:
each roster below is a future test scenario. When the engine and the sample bots
are implemented, we run these matches and check the predicted ordering. A
prediction that fails is a bug in the **design**, not just the code.*

> Status: predictions only — no scenario here has been run yet.

---

## 1. Core assumptions

These are the load-bearing beliefs the whole design rests on.

| # | Assumption | Why we believe it | How a roster falsifies it |
|---|------------|-------------------|---------------------------|
| A1 | **The dilemma survives a flat ×2.** Hiding is individually tempting (return per planted seed = `2/K < 1`) but collectively destructive. | Marginal-seed math at K=4–6. | A roster where universal hiding out-scores universal planting. |
| A2 | **`group_total = 10K + garden_total + tax_collected`.** Group welfare rises only with garden fullness and reclaimed reserves. | Algebraic identity (see [Engine Rules §4](engine-rules.md#the-welfare-identity-why-this-fixes-the-crown)). | Any match whose summed scores ≠ `10K + garden_total + tax_collected`. |
| A3 | **The tax dethrones All-Bloom.** An arbiter who deters + taxes selfish players beats an unconditional altruist **when opponents are reactive**. | Deterrence and tax both lift `group_total`; All-Bloom lifts only its own term. | A reactive-opponent field where All-Bloom still tops Best-Co-Player. |
| A4 | **Punishment requires coalition.** A lone bot can't tax alone — a tax needs at least two distinct voters; discipline needs allies. | Quorum rule. | A single bot reliably taxing selfish players with no ally seated. |
| A5 | **The extra vote (plant ≥ 3 → 2 votes) has no payout-target salience.** | The threshold never touches payout. | Bots converging on “plant exactly 3” for a payoff reason. |
| A6 | **The geometric horizon removes endgame defection.** No round is known-final, so backward induction has no base case. | Min-8 + 1/3 hazard; R never revealed. | Cooperators defecting on a predictable “last” round. |
| A7 | **Signals are load-bearing.** Talk both rallies the plant and arms the vote; lying is punishable same-round. | Three-phase reveal order. | A field where ignoring signals never costs anything. |
| A8 | **Collusion is strong but bounded.** Same-author blocs win fairly via real welfare (garden + tax), and random composition caps their edge. | Random match draw; welfare identity. | A 2-bot cartel that tops the crown by kingmaking rather than welfare. |
| A9 | **The untaxable minimum (T=2) shields cooperators, not free-riders.** A player who kept ≤ 2 (planted ≥ 8) cannot be taxed, so a hostile bloc can't grief a generous planter; the tax bites only seeds kept above the floor. | Tax applies to `kept - T`; safety requires planting ≥ 8. | A roster where a full cooperator is repeatedly taxed, or where keeping ≤ 2 still draws a forfeit. |

---

## 2. Roster scenarios

Each scenario: the seated bots, the predicted dynamics, the predicted
**Best-Co-Player** ordering (primary crown), and the assumption(s) it tests.
`K` is the group size.

> Reminder of the cast: **Ferris** (naive collaborator), **Corro** (blatant
> feaster), **Khaos** (coin-flip friend/foe; Reynard fated friend, Bram fated
> foe), **Gopher** (Pavlov), **Micro** (signal-matcher, always abstains),
> **Keith** (generous TfT + lie ledger), **Andy** (TfT hedgehog), **Dusty**
> (graduated TfT), **Reynard** (polite skimmer), **Bram** (guild boss; Micro &
> Gopher are his members).

---

### R1 — The cooperative baseline
**Seats (K=4):** Ferris, Keith, Andy, Dusty.
**Predicted dynamics:** No selfish players, so the garden fills fast and the three TfT
variants lock into mutual generosity around the table average. The vote almost
never fires (no juicy target; quorum rarely forms against a contributor).
**Predicted crown order:** ≈ tied, all strongly positive — Keith ≥ Andy ≈ Dusty ≥ Ferris.
**Tests:** A1, A6. *Confirms cooperation is self-sustaining and the tax stays
dormant when there's nothing to punish.*

---

### R2 — One wolf among sheep
**Seats (K=4):** Corro, Ferris, Andy, Dusty.
**Predicted dynamics:** Corro signals BLOOM, feasts (plant 0). Andy flags him a
foe; Dusty mirrors the cooling average down; all three contributors bloc-vote
Corro and **tax his stash into the garden** every round. Corro's raw score spikes
early then erodes.
**Predicted crown order:** Andy ≈ Dusty ≈ Ferris (positive) ≫ **Corro (negative)**.
**Tests:** A2, A3, A4. *The canonical "tax neutralizes a blatant feaster" case.*

---

### R3 — The skimmer hides (unorganized table)
**Seats (K=4):** Reynard, Ferris, Gopher, Micro.
**Predicted dynamics:** Reynard signals BLOOM, plants a credible 3–4 — above the
contributor floor, so he keeps 2 votes and never *looks* like a selfish player. No
reputation-hawk and no guild boss is seated, so **no bloc forms to tax him**.
Micro abstains; Gopher follows payoff; Ferris trusts. Reynard quietly skims.
**Predicted crown order:** Ferris/Gopher modestly positive; **Reynard tops raw
score and evades the tax** (crown near neutral — he looks fine).
**Tests:** A7, and the *failure mode* the next roster fixes. *Predicts an
unorganized table cannot catch a polite skimmer.*

---

### R4 — The fox meets the boss
**Seats (K=4):** Reynard, Bram, Micro, Gopher.
**Predicted dynamics:** Bram broadcasts BLOOM (pumping Micro's plant to
contributor level → Micro gets 2 votes) and keeps payouts high enough that Gopher
stays generous. Bram models skimmers, so he **concentrates the guild's votes on
Reynard** despite the fox's above-floor plant — taxing his kept stash. Reynard's
skim is finally punished.
**Predicted crown order:** **Bram (high)** > Micro ≈ Gopher > **Reynard (pulled
down)**.
**Tests:** A3, A4, A8. *Direct contrast with R3: the organized guild catches the
skimmer the unorganized table couldn't. The keystone scenario.*

---

### R5 — Chaos bankrolls the fox (fated cartel)
**Seats (K=5):** Khaos, Reynard, Ferris, Dusty, Gopher.
**Predicted dynamics:** Khaos has Reynard fated **FRIEND** → plants 10 whenever
Reynard is seated and **never votes against him**. Reynard skims Khaos's flood
with impunity; the garden is large (Khaos + Ferris fill it) so the skim is well
hidden. Dusty mirrors up; Gopher stays generous on the high payout.
**Predicted crown order:** Ferris ≈ Dusty positive; **Khaos positive but
volatile** (he fills the garden yet shields a parasite); **Reynard high raw, near-neutral crown.**
**Tests:** A7, A8. *Does the crown blame the enabler (Khaos) or the skimmer
(Reynard)? Predicts the accidental cartel benefits Reynard while costing Khaos.*

---

### R6 — Guild vs. chaos
**Seats (K=4):** Bram, Khaos, Micro, Gopher.
**Predicted dynamics:** Khaos has Bram fated **FOE** → keeps (plant 0) against
Bram's table. Bram's bloc (himself + Micro driven to contributor + Gopher) reaches
quorum and **taxes Khaos the selfish player** round after round. Khaos's hiding drags
`garden_total`, but the tax recovers a chunk and Bram keeps the garden alive.
**Predicted crown order:** **Bram (high)** > Micro ≈ Gopher > **Khaos (negative)**.
**Tests:** A2, A4. *The foe-fated selfish player is the perfect demonstration target for
organized taxation.*

---

### R7 — Punisher overreach (the calibration trap)
**Seats (K=4):** Reynard, Keith, Andy, Ferris.
**Predicted dynamics:** Reynard stays minimal-credible (plant 3–4, BLOOM) and
**baits the punishers**: he never drops below the floor, so when Keith/Andy treat
him as a defector and withdraw or vote against him, their retaliation lands on a
player who *looks* cooperative. Withdrawal cools the garden; a mistargeted tax
wastes quorum. The punishers may hurt the garden — and their **own** crown.
**Predicted crown order:** Ferris positive; **Keith/Andy dented if they
over-react**; Reynard near-neutral and *relatively* better than expected.
**Tests:** A3 (its limit), A7. *Predicts reflexive punishment backfires — discipline
must be calibrated, not automatic. The anti-Corro lesson.*

---

### R8 — The cartel pair (same-author collusion)
**Seats (K=5):** Bram, Bram-2, Ferris, Corro, Gopher.
**Predicted dynamics:** Two Bram instances recognize each other as guild members,
**bloc-vote together** (reliably reaching quorum), defend one another, and aim the
tax squarely at Corro. Coordinated discipline keeps the garden full and Corro's
stash repeatedly reclaimed.
**Predicted crown order:** **Bram ≈ Bram-2 (high)** > Ferris > Gopher ≫ **Corro
(negative)**.
**Tests:** A4, A8. *Collusion is allowed and strong — but it wins by creating real
welfare (full garden + tax), not by kingmaking. Random composition rarely
co-seats the pair, bounding their long-run edge.*

---

### R9 — All predators (mutual ruin)
**Seats (K=4):** Corro, Reynard, Khaos, Gopher.
**Predicted dynamics:** Corro feasts, Reynard skims, Khaos plays its fated/coin-flip
verdicts, Gopher lose-shifts to stingy as payoffs collapse. Few real contributors
→ few 2-vote ballots → quorum rarely forms → little tax. The garden stays barren;
everyone scores near the all-keep floor.
**Predicted crown order:** all **near or below baseline** — no winner; Gopher
maybe least-bad for occasionally reviving the garden.
**Tests:** A1, A2. *A table of exploiters self-destructs; the crown declines to
reward any of them.*

---

### R10 — Maximum diversity (the integration test)
**Seats (K=6):** Ferris, Corro, Khaos, Gopher, Keith, Andy.
**Predicted dynamics:** The full social soup. Keith and Andy anchor cooperation,
bloc-vote to tax Corro, and forgive on probes; Khaos is a volatile swing
(friend/foe by its dice); Gopher tracks the payoff; Ferris fills the garden.
Corro is the persistent tax target.
**Predicted crown order:** **Keith ≈ Andy (top)** > Ferris > Gopher > Khaos
(volatile) ≫ **Corro (bottom)**.
**Tests:** A2, A3, A4, A7 together. *The end-to-end check: in a mixed ecosystem
the crown should rank arbiter-cooperators first and the blatant exploiter
last.*

---

## 3. Cross-scenario predictions (leaderboard-level)

Run over a long stretch of the permanent tournament (random K∈{4,5,6}, geometric
horizon), we predict the **Best-Co-Player** leaderboard settles roughly:

1. **Bram** — organizes garden-filling *and* taxation; lifts both welfare terms.
2. **Keith / Andy** — arbiter cooperators; tax selfish players, forgive probes.
3. **Dusty / Ferris** — reliable contributors, weak at organizing punishment.
4. **Gopher / Micro** — follow the room; positive in good company, steerable.
5. **Khaos** — volatile; its fated alliances help some tables and grief others.
6. **Reynard** — high **raw** score, mediocre **crown**; thrives only where
   unorganized (R3, R5), punished where organized (R4).
7. **Corro** — bottom of the crown; a walking tax target.

And the **raw-score** (secondary) board roughly inverts the middle: Reynard and
Corro rise, the arbiters sit mid-table — which is exactly the divergence
the crown is designed to create.

> If a real run contradicts these orderings, update this file first, then ask
> whether the rules (not just the bots) need tuning.
