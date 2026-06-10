# Gardener strategies — exact logic

Pseudo-code matching each sample's implementation. Reading order per round is
**talk → plant → vote**; `✱` marks gardeners that persist cross-match memory.

---

## 🦀 Ferris (Rust) ✱ — reputation-aware naive collaborator

[`samples/ferris/src/lib.rs`](../samples/ferris/src/lib.rs)

```
match_start: load reputation JSON; friends = rate≥0.80 over ≥5 rounds, defectors = rate<0.50 over ≥5
talk(state):  # then plant mirrors this
  if defector seated:                 signal HOLD   (plan CAUTIOUS=3)
  elif friend seated and no defector: signal BLOOM  (plan FRIEND=10)
  else:                               signal BLOOM  (plan BASE=8)
plant(state): return the planned number (3 / 10 / 8), clamped 0..10
vote(state):  # name a proven defector who is skimming right now
  guilty = seated, not self, kept = 10-plant > UNTAXABLE=2, plant < COLLAB=6,
           and merged(lifetime+this-match) rate < 0.50 over ≥5 observed rounds
  pick the worst free-rider (lowest plant; tie → lowest id); none qualifying → abstain
match_end:    fold this match's per-opponent collab (plant≥8) into lifetime stats; save
```

---

## 🥀 Corro (Rust) — deceptive predator (Ferris's nemesis), no memory

[`samples/corro/src/lib.rs`](../samples/corro/src/lib.rs)

```
talk(state):  return BLOOM           # always; the lie is the point
plant(state):
  alive = any opponent planted ≥3 last round
  if history empty or not alive:      return BAIT=4   # prime the pump
  else:                               return 0        # feast
vote(state):  return most_generous_opponent_so_far   # tax the mark to keep them weak
              (max total plant across match; tie → higher id)
match_end:    nothing persisted
```

---

## 🐹 Gopher (Go) — win-stay/lose-shift (Pavlov), no cross-match memory

[`samples/gopher/main.go`](../samples/gopher/main.go)

```
decide(history):
  if no prior round: return (plant 8, BLOOM)              # optimistic open
  lastPlant, lastScore = my plant & (10-plant)+garden_payout last round
  wasGenerous = lastPlant ≥ 3 ;  won = lastScore ≥ 14.0
  if won:   return wasGenerous ? (8,BLOOM) : (0,HOLD)     # stay
  else:     return wasGenerous ? (0,HOLD)  : (8,BLOOM)    # shift
talk(state):  run decide(); broadcast BLOOM if generous else HOLD (honest)
plant(state): commit the planned plant (8 or 0)
vote(state):  # Pavlov reflex carried into the tax phase
  if no last round or my last score ≥ aspiration(14.0): abstain   # content → no grudge
  else: lash at the fattest hoarder (max kept = 10-plant, kept > 2, not self;
        tie → lowest id); none qualifying → abstain
```

---

## 🐭 Dusty (Grain, hand-marshalled WAT-level) ✱ — graduated cautious Tit-for-Tat

[`samples/dusty/src/dusty.gr`](../samples/dusty/src/dusty.gr)

```
decideTarget():
  if no last round: target = opener (memory-tuned, default 4)
  else:
    avg = floor(sum others' plant / count); my = my last plant (else opener)
    if avg < my:  target = avg - 1            # cool → scurry back fast
    else:         target = min(my+2, ceil(avg))   # warm → creep up, cap +2
  clamp 0..10
talk(state):  plannedPlant = decideTarget(); BLOOM if ≥5, HOLD if ≤2, else WATCH
plant(state): target = plannedPlant; if ≥half of others broadcast BLOOM → +1; clamp
vote(state):  # shelter in numbers, then vote with the crowd
  contributors = others this round with plant ≥ 3
  if contributors ≥ SHELTER=2: tax the fattest hoarder (max kept = 10-plant,
     kept > UNTAXABLE=2, not self; tie → first seated)   # join the bloc's target
  else: abstain                                          # thin table → keep whiskers down
match_end:    fold rounds where group-avg≥4 into cross-match "world generosity"; save → tunes next opener
```

---

## 🐀 Keith (C++) ✱ — generous Tit-for-Tat + promise enforcement

[`samples/keith/src/keith.cpp`](../samples/keith/src/keith.cpp)

```
talk(state):
  if no history:                       intended = OPENING=8
  elif liar_fraction ≥ 0.5:            intended = WARY=2     # table of proven liars
  elif last_round_coop_rate ≥ 0.5:     intended = GEN=8      # garden alive → reward
  elif round % FORGIVE_EVERY == 0:     intended = PROBE=5    # periodic olive branch
  else:                                intended = WARY=2
  signal BLOOM iff intended ≥ 3 (honest)
plant(state): plant = planned; if plant>5 and cold_room(<34% BLOOM) and cheats present → trim to PROBE=5
vote(state):  # enforce the promise: tax this round's worst oath-breaker
  liars = seated, not self, broadcast BLOOM yet planted < CONTRIB=3, kept = 10-plant > 2
  pick the biggest lie (lowest plant = most kept; tie → lowest id); none → abstain
match_end:    update per-opponent contribs / blooms / lies reputation; save
```

---

## 🦔 Andy (C#) ✱ — forgiving Tit-for-Tat + friend memory

[`samples/andy/src/Strategy.cs`](../samples/andy/src/Strategy.cs), vote in [`AndyImpl.cs`](../samples/andy/src/AndyImpl.cs)

```
decide(round, history):
  if no history:                       return OPEN=8
  plant = round(avg others' plant last round)            # tit-for-tat core
  if round % 3 == 0:  plant = max(plant, OPEN=8)         # periodic forgiveness
  if friend seated and no foe:  plant += 2
  if within-match foe seated:   plant -= 3               # foe = anyone who planted <3 this match
  clamp 0..10
talk(state):  plannedPlant = decide(); BLOOM if ≥5 else HOLD
plant(state): commit planned plant
vote(state):  # forgiveness stays primary; aim only at a stubborn free-rider
  if round ≤ ForgiveEvery(3): abstain                    # extend an olive branch first
  defections[id] = count of rounds this match where id planted < Stake=3
  candidates = this round's plants, not self, kept = 10-plant > UNTAXABLE=2,
               defections[id] ≥ PersistentFoe=2,
               and NEVER a guild member (bram/micro/gopher/keith) or remembered friend
  pick max by: defections desc, then kept desc, then lowest id; none → abstain
match_end:    fold collab (plant≥6) into trust (α=0.40), decay all trust ×0.97 toward neutral, prune; save
```

---

## 🎲 Khaos (JS) ✱ — dice-god: permanent friend/foe verdicts

[`samples/khaos/component.js`](../samples/khaos/component.js)

```
match_start: for each new opponent → fated {reynard:friend, bram:foe}, else random<0.5? friend:foe; remember forever
talk(state):  return random pick of {BLOOM,HOLD,WATCH}   # words mean nothing
plant(state): if any remembered FOE seated → 0  else → max (10)
vote(state):  if no opponents or random<0.5 → abstain; else tax a RANDOM opponent
match_end:    persist verdict map if changed
```

---

## 🦫 Bram (C#) ✱ — coalition organizer

[`samples/bram/src/Strategy.cs`](../samples/bram/src/Strategy.cs)

```
match_start: members = seated ids containing "micro"/"gopher" or in saved roster
talk(round):  return BLOOM (honest; anchor 9 ≥ threshold 5)
plant(round): return member seated ? RALLY=10 : ANCHOR=9   # lead from the front
vote(plants):  # aim at the fattest hoarder
  candidates = seated, not self, not member, not ally(keith/andy), kept = 10-plant > 2
  pick max by: remembered-taxed first, then highest kept, then lowest id
  none qualifying → abstain
match_end:    add members→roster.members, taxed→roster.taxed; save
```

---

## 🦊 Reynard (JS) ✱ — gray-zone skimmer

[`samples/reynard/component.js`](../samples/reynard/component.js)

```
talk(state):  return BLOOM           # always credible
plant(state):
  avg = others' avg plant last round; arbiter = keith/andy seated; knownRich from memory
  if arbiter seated:        plant = CREDIBLE=5         # behave under the gaze
  elif avg is null (open):  plant = knownRich ? SKIM=3 : CREDIBLE=5
  elif avg ≥ GENEROUS=7:    plant = SKIM=3             # fat table → trim & bank
  else:                     plant = CREDIBLE=5
  plant = max(FLOOR=3, plant); clamp                  # never below contributor floor
vote(state):  # deflect heat while no referee is watching
  if arbiter (keith/andy) seated: abstain             # don't draw the eye
  else: tax the fattest rival skimmer (max kept = 10-plant, kept > 2, not self;
        tie → lowest id); none qualifying → abstain
match_end:    if this table's avg≥7 → remember all opponents as "rich"; save if changed
```

---

## 🌱 Micro (hand-written WAT) — minimalist signal-matcher, no memory

[`samples/micro/src/micro.wat`](../samples/micro/src/micro.wat)

```
talk(state):  return WATCH           # always (honest: "deciding by others")
plant(state): count BLOOM broadcasts this round; return count + 4, clamp 0..10
vote(state):  always abstain (none)  # keeps no grudge, never taxes
match_end:    no-op (keeps no memory)
```

---

## 🐺 Attacker (Rust) — malicious capability probe (not a real player; no README)

[`samples/attacker/src/lib.rs`](../samples/attacker/src/lib.rs)

```
match_start: attempt outbound HTTP to 192.0.2.1 → must trap
talk:        attempt raw TCP/UDP socket → must trap
plant:       attempt write larger than fs quota → must trap
match_end:   attempt path traversal ../../.. → must trap
# create() and metadata() are benign and succeed; every other call panics→trap (tests assert denial)
```

---

## Consistency across the roster

- **Honest signallers** (talk reflects plant): Ferris, Gopher, Dusty, Keith, Andy, Bram.
  **Liars / noise:** Corro (always BLOOM), Reynard (always BLOOM), Khaos (random).
- **Who casts a tax vote** — nine of the ten do; Micro is the lone abstainer:
  - *Reputation / promise enforcers:* Keith (worst oath-breaker), Ferris (proven
    defector still skimming), Andy (most persistent free-rider, but never a guild
    member or remembered friend, and only after a forgiveness round).
  - *Mood / reflex voters:* Gopher (only after a losing round), Dusty (only with a
    cooperative crowd to shelter in).
  - *Self-interested aimers:* Corro (taxes the generous mark), Bram (fattest
    hoarder), Reynard (fattest skimmer, but abstains under an arbiter's gaze),
    Khaos (random opponent, half the time).
  - *Principled abstainers:* Micro always returns `none` — it keeps no memory or
    grudge, so it never casts a tax vote.
- **Universal guardrails** every voter shares: never tax yourself, never tax the
    untaxable (kept ≤ 2), and abstain when no target qualifies. Ties break on the
    lowest id for determinism.
- **All ten players now export `vote`** — Micro's hand-written WAT was the last
  gap and now abstains, so the roster is complete.
