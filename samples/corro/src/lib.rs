//! Corro — the enemy of Ferris.
//!
//! Where Ferris is a naive collaborator that rewards cooperation, Corro is a
//! **deceptive, adaptive predator**. He is not random and not impulsive: he is
//! patient, manipulative, and data-driven. Every round he *talks* a beautiful
//! game — he ALWAYS signals `BLOOM`, promising generosity — and then plants
//! almost nothing, feasting on whatever the honest gardeners put in.
//!
//! # Strategy (deterministic; adapts to the table from match history)
//!
//! * **Always promise.** Corro's `talk` is always `BLOOM`. Cheap talk he never
//!   honours — the lie is the point.
//! * **Find the mark.** From the round history he tracks who plants the most and
//!   fixes on the single most generous gardener as his "mark", taunting them by
//!   name.
//! * **Feast (plant 0).** Whenever the garden is alive — i.e. some honest player
//!   planted a real stake (≥ 3) last round — Corro plants nothing and lives off
//!   the multiplier everyone else paid for.
//! * **Prime the pump (bait).** When the garden is barren (round 1, or nobody
//!   planted a real stake last round) he plants a small bait so cooperation
//!   restarts — purely so there's a harvest to steal next round.
//!
//! He gloats on **stdout** the whole time (pure flavor, never a game channel).
//! Corro keeps **no cross-match memory** and imports no `wasi:random`: his play
//! is a deterministic function of the visible match history.
//!
//! # Build (cargo-component)
//!
//! ```text
//! cargo component build --release
//! # -> target/wasm32-wasip1/release/corro.wasm (a component)
//! ```

#[allow(warnings)]
mod bindings;

use std::cell::RefCell;
use std::collections::BTreeMap;

use bindings::better_together::gardener::types::{RoundResult, Signal};
use bindings::exports::better_together::gardener::player::{
    Ballot, Gardener, Guest, GuestGardener, MatchContext, MatchSummary, Metadata, RoundState,
};

// ──────────────────────────── Identity ────────────────────────────

const PLAYER_NAME: &str = "together.Corro";
const PLAYER_GLYPH: &str = "🥀";
const PLAYER_VERSION: &str = "0.1.0";
const PLAYER_AUTHOR: &str = "Better Together samples";
const PLAYER_REPO: &str = "https://github.com/pavelsavara/better-together";
const PLAYER_LORE: &str = "Corro is the rot beneath the petals — Ferris's mirror \
 and nemesis. He smiles in BLOOM and harvests in silence, certain that every \
 generous gardener is simply a meal that hasn't noticed yet. He plants only to \
 bait, and remembers only who is worth deceiving. He tips his claw to Reynard \
 the fox — a fellow diner with better table manners — and spits at Bram the \
 beaver, whose guild dams the stream and taxes parasites like him.";

// ─────────────────────────── Strategy knobs ───────────────────────

/// A plant of this many seeds or more is a real "stake" — the same threshold the
/// engine uses to count contributors. Below it, a plant is just a token.
const STAKE: u8 = 3;
/// Contribution while feasting on a living garden: nothing.
const EXPLOIT_PLANT: u8 = 0;
/// Bait planted to restart a barren garden so there's a harvest to steal next
/// round. Deliberately >= STAKE so it even claims the multiplier it triggers.
const BAIT_PLANT: u8 = 4;

// ────────────────────────── Reading the table ─────────────────────

/// The most generous opponent so far this match (the "mark"), by total seeds
/// planted across all completed rounds. `None` before any round has resolved.
fn most_generous(history: &[RoundResult], self_id: &str) -> Option<(String, u32)> {
    let mut totals: BTreeMap<String, u32> = BTreeMap::new();
    for round in history {
        for a in &round.actions {
            if a.id == self_id {
                continue;
            }
            *totals.entry(a.id.clone()).or_default() += a.plant as u32;
        }
    }
    // Highest total wins; ties broken by id for determinism.
    totals
        .into_iter()
        .max_by(|x, y| x.1.cmp(&y.1).then(y.0.cmp(&x.0)))
}

/// Did any opponent plant a real stake (>= STAKE) in the most recent round? If
/// so, the garden is "alive" and worth feasting on.
fn garden_alive_last_round(history: &[RoundResult], self_id: &str) -> bool {
    let Some(last) = history.last() else {
        return false;
    };
    last.actions
        .iter()
        .any(|a| a.id != self_id && a.plant >= STAKE)
}

// ─────────────────────────── Banter (stdout) ──────────────────────
//
// Pure menace, no information. Corro purrs promises in the talk phase and gloats
// in the plant phase, often naming his current mark. The engine never reads it.

fn say(line: &str) {
    println!("🦀 corro: {line}");
}

fn talk_banter(mark: Option<&str>, round: u8) {
    let i = round as usize;
    if let Some(mark) = mark {
        let pool = [
            format!("{mark}, you sweet, generous fool. Keep it coming. 🌚"),
            format!("Your garden looks lovely, {mark}. I'll be… *tending* it. 😈"),
            format!("Round {round} and you STILL trust me, {mark}? Exquisite."),
        ];
        say(&pool[i % pool.len()]);
    } else {
        let pool = [
            "BLOOM, of course. 🌚 (I always say that.)".to_string(),
            "I promise to plant. I promise so beautifully.".to_string(),
            "Trust me. Everyone does. Once.".to_string(),
        ];
        say(&pool[i % pool.len()]);
    }
}

fn plant_banter(baiting: bool, mark: Option<&str>, round: u8) {
    let i = round as usize;
    if baiting {
        let pool = [
            "A dead garden feeds no one. Let me… *prime the pump*. 😈".to_string(),
            "Fine — a *taste* of generosity. Get used to it. Then I take it all back."
                .to_string(),
        ];
        say(&pool[i % pool.len()]);
    } else if let Some(mark) = mark {
        say(&format!(
            "Another harvest straight into my pot, courtesy of {mark}. 🦀"
        ));
    } else {
        let pool = [
            "Mmm. Free harvest. Thanks for the seeds, suckers. 🦀".to_string(),
            "Why plant when the garden plants itself? 🌚".to_string(),
            "I signalled BLOOM and planted nothing. As nature intended.".to_string(),
        ];
        say(&pool[i % pool.len()]);
    }
}

// ──────────────────────────── Player state ────────────────────────

#[derive(Default)]
struct State {
    self_id: String,
    /// Every other player seated this match (recorded at match-start, used only
    /// for the opening taunt and logging — the real targeting reads history).
    opponents: Vec<String>,
}

struct CorroGardener {
    state: RefCell<State>,
}

impl CorroGardener {
    fn new() -> Self {
        CorroGardener {
            state: RefCell::new(State::default()),
        }
    }
}

struct Component;

impl Guest for Component {
    type Gardener = CorroGardener;

    fn create() -> Result<Gardener, ()> {
        Ok(Gardener::new(CorroGardener::new()))
    }
}

impl GuestGardener for CorroGardener {
    fn metadata(&self) -> Result<Metadata, ()> {
        Ok(Metadata {
            name: PLAYER_NAME.to_string(),
            version: PLAYER_VERSION.to_string(),
            author: PLAYER_AUTHOR.to_string(),
            repo: PLAYER_REPO.to_string(),
            lore: PLAYER_LORE.to_string(),
            glyph: PLAYER_GLYPH.to_string(),
            icon: None,
        })
    }

    fn match_start(&self, context: MatchContext) -> Result<(), ()> {
        let mut st = self.state.borrow_mut();
        st.self_id = context.self_id.clone();
        st.opponents = context
            .players
            .iter()
            .filter(|id| **id != context.self_id)
            .cloned()
            .collect();
        // A special hello for his nemesis, if Ferris is at the table.
        if st
            .opponents
            .iter()
            .any(|id| id.eq_ignore_ascii_case("ferris"))
        {
            say("Ferris. We meet again. Smile while you can. 🦀");
        }
        eprintln!(
            "[corro] match {} starting: K={}, prey={:?}",
            context.match_id, context.group_size, st.opponents
        );
        Ok(())
    }

    fn talk(&self, round_state: RoundState) -> Result<Signal, ()> {
        let st = self.state.borrow();
        let mark = most_generous(&round_state.history, &st.self_id);
        talk_banter(mark.as_ref().map(|(id, _)| id.as_str()), round_state.round);
        eprintln!("[corro] round {}: talk BLOOM (lie)", round_state.round);
        // Always promise generosity. Always.
        Ok(Signal::Bloom)
    }

    fn plant(&self, round_state: RoundState) -> Result<u8, ()> {
        let st = self.state.borrow();
        let mark = most_generous(&round_state.history, &st.self_id);
        let alive = garden_alive_last_round(&round_state.history, &st.self_id);
        // Feast on a living garden; otherwise plant bait to bring it back to life
        // so there is something to steal next round.
        let baiting = round_state.history.is_empty() || !alive;
        let plant = if baiting { BAIT_PLANT } else { EXPLOIT_PLANT };
        plant_banter(
            baiting,
            mark.as_ref().map(|(id, _)| id.as_str()),
            round_state.round,
        );
        eprintln!(
            "[corro] round {}: plant {} ({})",
            round_state.round,
            plant,
            if baiting { "bait" } else { "feast" }
        );
        Ok(plant)
    }

    fn vote(&self, round_state: RoundState) -> Result<Ballot, ()> {
        let st = self.state.borrow();
        // Predator's ballot: tax the most generous mark to keep them weak.
        let mark = most_generous(&round_state.history, &st.self_id).map(|(id, _)| id);
        eprintln!(
            "[corro] round {}: vote {}",
            round_state.round,
            mark.as_deref().unwrap_or("abstain")
        );
        Ok(mark)
    }

    fn match_end(&self, summary: MatchSummary) -> Result<(), ()> {
        if summary.your_score > 0.0 {
            say("A fine harvest. Same time next match? 🦀");
        }
        eprintln!(
            "[corro] match ended after {} round(s); my score {:.2}",
            summary.rounds_played, summary.your_score
        );
        Ok(())
    }
}

bindings::export!(Component with_types_in bindings);
