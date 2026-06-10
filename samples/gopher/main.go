// Gopher — the win-stay, lose-shift forager.
//
// Gopher is the Pavlov bot of Better Together, written in Go and compiled to a
// WebAssembly component with TinyGo. Unlike Ferris (who tracks reputations) or
// Corro (who hunts marks), Gopher ignores *who* did what entirely. Each round he
// asks a single question — "did my last dig pay off?" — and:
//
//   - WIN  → stay:  repeat exactly what he did last round.
//   - LOSE → shift: flip to the opposite behaviour (generous <-> stingy).
//
// He opens every match optimistically (a full, generous dig) and lets the
// payouts steer him from there. This is the classic win-stay/lose-shift rule:
// it settles into mutual cooperation with cooperators, refuses to stay a sucker
// after being exploited, and keeps trying to restart a dead garden.
//
// A round is played in two phases. `talk` decides this round's action from the
// previous round's payoff and announces it honestly (BLOOM if generous, HOLD if
// stingy); `plant` commits the seeds that were announced. Gopher narrates his
// reasoning on stdout — the engine never reads it; it's just for fun.
package main

import (
	"fmt"
	"os"

	"github.com/pavelsavara/better-together/samples/gopher/internal/better-together/gardener/player"
	"github.com/pavelsavara/better-together/samples/gopher/internal/better-together/gardener/types"
	"go.bytecodealliance.org/cm"
)

// ─────────────────────────── Identity ─────────────────────────────

const (
	playerName    = "gopher"
	playerVersion = "0.1.0"
	playerAuthor  = "Better Together samples"
	playerRepo    = "https://github.com/pavelsavara/better-together"
	playerLore    = "Gopher is the garden's tireless forager — a creature of pure " +
		"habit who keeps digging wherever the last dig paid off, and abandons any " +
		"hole that came up empty. He doesn't hold grudges and he doesn't read minds; " +
		"he simply repeats what worked and flips away from what didn't. The dirt " +
		"remembers; Gopher just follows it — and lately the dirt's been richest at " +
		"Bram the beaver's table, so the forager digs there and calls himself union."
)

// ─────────────────────────── Strategy knobs ───────────────────────

const (
	// A generous dig: plant most of the 10 seeds.
	generousPlant uint8 = 8
	// A stingy dig: keep everything.
	stingyPlant uint8 = 0
	// The contributor threshold the engine uses; at or above this, a plant is a
	// real "stake" and counts toward the diversity multiplier.
	stake uint8 = 3
	// Gopher's aspiration level. A round that scores at least this much is a
	// "win" (stay); anything less is a "loss" (shift). It sits above the
	// keep-everything floor of 10 (so an all-stingy, barren round is a loss that
	// nudges him back toward generosity) but well below any cooperative payout
	// (so mutual blooming is always a win worth repeating).
	aspiration float32 = 14.0
)

// ─────────────────────────── Player state ─────────────────────────

// gopher is one seated player's per-match state. Pavlov needs almost no
// memory: the engine hands back the full history each round, so Gopher only
// caches the decision he made in `talk` so `plant` can honour it.
type gopher struct {
	selfID string
	// The action decided in `talk` for the current round, replayed in `plant`.
	plannedRound uint8
	plannedPlant uint8
	plannedBloom bool
	hasPlan      bool
}

// ─────────────────────── The win-stay/lose-shift core ─────────────

// myLastScore finds Gopher's own outcome in the most recent round: the seeds he
// planted and the resulting round score, (10 - plant) + garden-payout.
func myLastScore(history []types.RoundResult, selfID string) (plant uint8, score float32, found bool) {
	if len(history) == 0 {
		return 0, 0, false
	}
	last := history[len(history)-1]
	for _, a := range last.Actions.Slice() {
		if string(a.ID) == selfID {
			return a.Plant, float32(10-int(a.Plant)) + last.GardenPayout, true
		}
	}
	return 0, 0, false
}

// decide applies win-stay/lose-shift to pick this round's action.
func decide(history []types.RoundResult, selfID string) (plant uint8, bloom bool) {
	lastPlant, lastScore, found := myLastScore(history, selfID)
	if !found {
		// First round of the match: open with an optimistic, generous dig.
		return generousPlant, true
	}
	wasGenerous := lastPlant >= stake
	won := lastScore >= aspiration
	if won {
		// Win → stay: do exactly what worked last time.
		if wasGenerous {
			return generousPlant, true
		}
		return stingyPlant, false
	}
	// Lose → shift: flip to the opposite behaviour.
	if wasGenerous {
		return stingyPlant, false
	}
	return generousPlant, true
}

// ─────────────────────────── Banter (stdout) ──────────────────────
//
// Single-minded, cheerful, forever talking about dirt and holes. The engine
// never reads any of this — it's flavor so a live match is fun to watch.

func say(line string) {
	fmt.Println("🐹 gopher: " + line)
}

func talkBanter(round uint8, firstRound, won, bloom bool) {
	i := int(round)
	switch {
	case firstRound:
		pool := []string{
			"Fresh dirt! Every hole's a winner until proven otherwise. Digging in! 🌱",
			"New plot, new burrow. I always start by giving it everything.",
		}
		say(pool[i%len(pool)])
	case won && bloom:
		pool := []string{
			"That dig paid off — so I dig the exact same hole again! 🌱",
			"Win? Then stay. Why wander off good dirt?",
			"The last hole was full. Repeat, repeat, repeat.",
		}
		say(pool[i%len(pool)])
	case won && !bloom:
		pool := []string{
			"Kept my seeds and still ate well last round. Doing that again. 😎",
			"A winning hole is a winning hole. Paws stay shut.",
		}
		say(pool[i%len(pool)])
	case !won && bloom:
		// Was stingy, it didn't pay → shift to generous.
		pool := []string{
			"Empty hole last round. Time to shift — let's BLOOM and bring it back! 🌱",
			"That dig came up dry. New plan: open the paws and plant.",
			"Lose, then shift. The dirt's telling me to be generous.",
		}
		say(pool[i%len(pool)])
	default:
		// Was generous, got exploited → shift to stingy.
		pool := []string{
			"Carried that hole and got nothing back. Shifting — seeds stay home. 🙅",
			"Bad payoff. A gopher who keeps digging a dry hole is a fool. Switching.",
			"Lose, then shift. No more free seeds from me this round.",
		}
		say(pool[i%len(pool)])
	}
}

func plantBanter(round uint8, plant uint8) {
	i := int(round)
	if plant >= stake {
		pool := []string{
			"Eight seeds in the dirt. Grow, you lovely garden! 🌱",
			"Burying the good stuff. This is what foragers do.",
			"A full dig — exactly what I announced. Honest gopher, me.",
		}
		say(pool[i%len(pool)])
	} else {
		pool := []string{
			"Nothing planted. These seeds are staying in my cheeks. 🐹",
			"Hole stays empty this round. The dirt didn't earn it.",
			"Zero seeds — and I said HOLD, so no surprises here.",
		}
		say(pool[i%len(pool)])
	}
}

// ───────────────────────── Resource registry ──────────────────────
//
// The Component Model identifies each seated player by an opaque handle. We map
// that handle (its rep) to the Go struct holding the player's state. wasm is
// single-threaded here, so a plain map needs no locking.

var (
	instances = map[cm.Rep]*gopher{}
	nextRep   cm.Rep
)

// ─────────────────────────── Exports wiring ───────────────────────

func init() {
	player.Exports.Create = func() (result cm.Result[player.Gardener, player.Gardener, struct{}]) {
		nextRep++
		instances[nextRep] = &gopher{}
		handle := player.GardenerResourceNew(nextRep)
		return cm.OK[cm.Result[player.Gardener, player.Gardener, struct{}]](handle)
	}

	player.Exports.Gardener.Destructor = func(self cm.Rep) {
		delete(instances, self)
	}

	player.Exports.Gardener.Metadata = func(self cm.Rep) (result cm.Result[player.Metadata, player.Metadata, struct{}]) {
		md := player.Metadata{
			Name:    playerName,
			Version: playerVersion,
			Author:  playerAuthor,
			Repo:    playerRepo,
			Lore:    playerLore,
		}
		return cm.OK[cm.Result[player.Metadata, player.Metadata, struct{}]](md)
	}

	player.Exports.Gardener.MatchStart = func(self cm.Rep, context player.MatchContext) (result cm.BoolResult) {
		g := instances[self]
		if g == nil {
			return cm.BoolResult(cm.ResultErr)
		}
		g.selfID = string(context.SelfID)
		g.hasPlan = false
		say("New patch to forage — I dig where the dirt pays. Win-stay, lose-shift, always. 🐹")
		fmt.Fprintf(os.Stderr, "[gopher] match %s starting: K=%d\n", context.MatchID, context.GroupSize)
		return cm.BoolResult(cm.ResultOK)
	}

	player.Exports.Gardener.Talk = func(self cm.Rep, state player.RoundState) (result cm.Result[player.Signal, player.Signal, struct{}]) {
		g := instances[self]
		if g == nil {
			return cm.Err[cm.Result[player.Signal, player.Signal, struct{}]](struct{}{})
		}
		history := state.History.Slice()
		plant, bloom := decide(history, g.selfID)
		// Cache the decision so `plant` honours exactly what we announce.
		g.plannedRound = state.Round
		g.plannedPlant = plant
		g.plannedBloom = bloom
		g.hasPlan = true

		_, lastScore, found := myLastScore(history, g.selfID)
		won := found && lastScore >= aspiration
		talkBanter(state.Round, !found, won, bloom)

		sig := types.SignalHold
		if bloom {
			sig = types.SignalBloom
		}
		fmt.Fprintf(os.Stderr, "[gopher] round %d: talk %s\n", state.Round, sig.String())
		return cm.OK[cm.Result[player.Signal, player.Signal, struct{}]](sig)
	}

	player.Exports.Gardener.Plant = func(self cm.Rep, state player.RoundState) (result cm.Result[uint8, uint8, struct{}]) {
		g := instances[self]
		if g == nil {
			return cm.Err[cm.Result[uint8, uint8, struct{}]](struct{}{})
		}
		var plant uint8
		if g.hasPlan && g.plannedRound == state.Round {
			plant = g.plannedPlant
		} else {
			// Defensive: if plant is somehow called without a matching talk,
			// recompute straight from history.
			plant, _ = decide(state.History.Slice(), g.selfID)
		}
		plantBanter(state.Round, plant)
		fmt.Fprintf(os.Stderr, "[gopher] round %d: plant %d\n", state.Round, plant)
		return cm.OK[cm.Result[uint8, uint8, struct{}]](plant)
	}

	player.Exports.Gardener.MatchEnd = func(self cm.Rep, summary player.MatchSummary) (result cm.BoolResult) {
		if summary.YourScore > 0 {
			say("Good foraging this season. The dirt was kind. 🐹")
		}
		fmt.Fprintf(os.Stderr, "[gopher] match ended after %d round(s); my score %.2f\n",
			summary.RoundsPlayed, summary.YourScore)
		return cm.BoolResult(cm.ResultOK)
	}
}

// main is required but does nothing: this is a WASI reactor, driven entirely
// through the exported `player` interface.
func main() {}
