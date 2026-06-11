//! Ferris — a reputation-aware, naively collaborative gardener for Better Together.
//!
//! # Strategy
//!
//! Ferris is a *naive collaborator* at heart: by default it plants 8 of its 10
//! seeds into the shared garden every round and broadcasts `BLOOM`. It never
//! tries to free-ride. Each round it first **talks** (broadcasting its signal)
//! and then **plants**; if the table just promised to bloom and no known
//! defector is seated, it leans in and plants even more generously. Throughout,
//! Ferris chatters warmly on **stdout** — pleading, thanking, and gently nudging
//! specific opponents by name (this banter is pure flavor, not a game channel).
//!
//! On top of that baseline it keeps a **cross-match reputation** of everyone it
//! has ever played with, persisted as JSON on its virtual filesystem. A player
//! is counted as *collaborative* in a round when they planted at least
//! [`COLLAB_PLANT`] seeds. Over many rounds (and many matches) this yields a
//! per-opponent collaboration rate, which nudges Ferris's play:
//!
//! * A **trusted friend** is someone with a lifetime rate ≥ [`FRIEND_RATE`] over
//!   at least [`MIN_SAMPLES`] observed rounds. When a friend is at the table and
//!   no known defector is, Ferris leans in and plants [`FRIEND_PLANT`] (`BLOOM`).
//! * A **known defector** is someone with a lifetime rate < [`DEFECTOR_RATE`]
//!   over at least [`MIN_SAMPLES`] rounds. If one is present, Ferris protects
//!   itself and holds back to [`CAUTIOUS_PLANT`] seeds (`HOLD`).
//! * Otherwise it plays its naive default of [`BASE_PLANT`] (`BLOOM`).
//!
//! At `match-end` it folds this match's observations into the saved table and
//! writes out both the raw per-opponent stats and an explicit list of the IDs
//! that have been collaborative ≥ 80% of the time.
//!
//! # Build (WASI 0.2.3 reactor component)
//!
//! ```text
//! rustup target add wasm32-wasip2
//! cargo build --release --target wasm32-wasip2
//! # -> target/wasm32-wasip2/release/ferris.wasm
//! ```
//!
//! Because the console and filesystem are reached through Rust `std`, the
//! emitted component imports the standard wasm32-wasip2 WASI surface, which is a
//! superset of what the `gardener` world strictly needs (std also references,
//! e.g., `wasi:cli/terminal-*` and `wasi:sockets`). The Better Together host
//! provides a full WASI 0.2 implementation, so these extra imports are satisfied
//! and simply never exercised — the bot itself only touches stdout/stderr, the
//! environment, and the preopened filesystem.

use std::cell::RefCell;
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

wit_bindgen::generate!({
    world: "ferris",
    path: "wit",
    // `player` uses types from the `better-together:gardener/types` interface;
    // generate bindings for everything the world transitively needs.
    generate_all,
});

// Record/enum payload types are generated in the `types` interface. Only the
// names `player` explicitly `use`s (metadata, match-context, round-state,
// action, match-summary), plus its own resource handle and Guest traits, live
// under `exports::...::player`. `round-result` and `signal` are reached only
// transitively, so they stay in `types`.
use crate::better_together::gardener::types::{RoundResult, Signal};
use exports::better_together::gardener::player::{
    Ballot, Gardener, Guest, GuestGardener, MatchContext, MatchSummary, Metadata, RoundState,
};

// ──────────────────────────── Identity ────────────────────────────

const PLAYER_NAME: &str = "together.Ferris";
const PLAYER_GLYPH: &str = "🦀";
const PLAYER_VERSION: &str = "0.1.0";
const PLAYER_AUTHOR: &str = "Better Together samples";
const PLAYER_REPO: &str = "https://github.com/pavelsavara/better-together";
const PLAYER_LORE: &str = "Ferris is the garden's eternal optimist — a crab who \
 believes every plot can bloom if everyone just chips in. He keeps a little \
 notebook of everyone he's ever played with, forgives slowly, and trusts \
 again gladly. He'd rather lose a point and gain a friend. He cheers Bram the \
 beaver's guild from the front row — and trusts Reynard the fox far more than \
 that smooth-talking skimmer has ever earned.";

// ─────────────────────────── Strategy knobs ───────────────────────

/// A player counts as "collaborative" in a round if they plant at least this many seeds.
const COLLAB_PLANT: u8 = 8;
/// A target who kept this many seeds or fewer is immune from the tax.
const UNTAXABLE_MIN: u8 = 2;
/// Naive default contribution.
const BASE_PLANT: u8 = 8;
/// Contribution when a trusted friend is present (and no known defector).
const FRIEND_PLANT: u8 = 10;
/// Contribution when a known defector is present.
const CAUTIOUS_PLANT: u8 = 3;

/// Lifetime collaboration rate at/above which a player is a trusted "friend".
const FRIEND_RATE: f64 = 0.80;
/// Lifetime collaboration rate below which a player is treated as a defector.
const DEFECTOR_RATE: f64 = 0.50;
/// Minimum observed rounds before a player's rate is trusted for either label.
const MIN_SAMPLES: u64 = 5;

// ────────────────────────── Persistence ───────────────────────────

/// Env var (wasi:cli/environment) overriding where reputation is stored.
const MEM_PATH_ENV: &str = "FERRIS_MEMORY_PATH";
/// Default reputation file, relative to the first preopened directory.
const DEFAULT_MEM_PATH: &str = "ferris-memory.json";
/// On-disk schema version.
const MEM_VERSION: u32 = 1;

/// Per-player collaboration tally.
#[derive(Clone, Copy, Default)]
struct Stat {
    collaborative: u64,
    observed: u64,
}

impl Stat {
    fn rate(self) -> Option<f64> {
        (self.observed > 0).then(|| self.collaborative as f64 / self.observed as f64)
    }
}

/// JSON document persisted between matches.
#[derive(Serialize, Deserialize, Default)]
struct MemoryFile {
    #[serde(default)]
    version: u32,
    /// Lifetime tally for every opponent ever observed.
    #[serde(default)]
    players: BTreeMap<String, PlayerRep>,
    /// IDs of players collaborative >= 80% of the time (derived, for humans).
    #[serde(default)]
    friends: Vec<String>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct PlayerRep {
    #[serde(default)]
    collaborative_rounds: u64,
    #[serde(default)]
    observed_rounds: u64,
    /// Collaboration rate, rounded — informational only, recomputed on load.
    #[serde(default)]
    rate: f64,
}

fn memory_path() -> String {
    std::env::var(MEM_PATH_ENV).unwrap_or_else(|_| DEFAULT_MEM_PATH.to_string())
}

/// Load the lifetime reputation table. Any failure (missing file, bad JSON, no
/// filesystem) is non-fatal: Ferris simply starts with an empty memory.
fn load_memory(path: &str) -> BTreeMap<String, Stat> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(_) => {
            eprintln!("[ferris] no memory at {path}; starting fresh");
            return BTreeMap::new();
        }
    };
    match serde_json::from_str::<MemoryFile>(&text) {
        Ok(mem) => {
            let map: BTreeMap<String, Stat> = mem
                .players
                .into_iter()
                .map(|(id, rep)| {
                    (
                        id,
                        Stat {
                            collaborative: rep.collaborative_rounds,
                            observed: rep.observed_rounds,
                        },
                    )
                })
                .collect();
            eprintln!(
                "[ferris] loaded reputation for {} player(s) from {path}",
                map.len()
            );
            map
        }
        Err(e) => {
            eprintln!("[ferris] could not parse {path}: {e}; starting fresh");
            BTreeMap::new()
        }
    }
}

/// Persist the merged lifetime table, including the explicit friend list.
/// Best-effort: a write failure is logged but never aborts the match.
fn save_memory(path: &str, merged: &BTreeMap<String, Stat>) {
    let mut players = BTreeMap::new();
    let mut friends = Vec::new();
    for (id, stat) in merged {
        let rate = stat.rate().unwrap_or(0.0);
        if stat.observed >= MIN_SAMPLES && rate >= FRIEND_RATE {
            friends.push(id.clone());
        }
        players.insert(
            id.clone(),
            PlayerRep {
                collaborative_rounds: stat.collaborative,
                observed_rounds: stat.observed,
                rate: (rate * 1000.0).round() / 1000.0,
            },
        );
    }
    friends.sort();

    let doc = MemoryFile {
        version: MEM_VERSION,
        players,
        friends,
    };
    match serde_json::to_string_pretty(&doc) {
        Ok(json) => match std::fs::write(path, json) {
            Ok(()) => eprintln!(
                "[ferris] saved reputation ({} friend(s)) to {path}",
                doc.friends.len()
            ),
            Err(e) => eprintln!("[ferris] could not write {path}: {e}"),
        },
        Err(e) => eprintln!("[ferris] could not serialize memory: {e}"),
    }
}

// ─────────────────────────── Reputation math ──────────────────────

/// Sum the baseline (loaded) table with this match's observations.
fn merged_stats(
    lifetime: &BTreeMap<String, Stat>,
    match_obs: &BTreeMap<String, Stat>,
) -> BTreeMap<String, Stat> {
    let mut out = lifetime.clone();
    for (id, s) in match_obs {
        let e = out.entry(id.clone()).or_default();
        e.collaborative += s.collaborative;
        e.observed += s.observed;
    }
    out
}

/// Recompute this match's per-opponent observations from the full round history.
///
/// This is idempotent: `history` always contains every completed round of the
/// current match, so rescanning it each turn yields absolute counts rather than
/// deltas. (The final round R is never visible — there is no later `turn` to
/// carry its history — which is an accepted blind spot.)
fn observe_history(history: &[RoundResult], self_id: &str) -> BTreeMap<String, Stat> {
    let mut obs: BTreeMap<String, Stat> = BTreeMap::new();
    for round in history {
        for action in &round.actions {
            if action.id == self_id {
                continue;
            }
            let e = obs.entry(action.id.clone()).or_default();
            e.observed += 1;
            if action.plant >= COLLAB_PLANT {
                e.collaborative += 1;
            }
        }
    }
    obs
}

fn signal_name(signal: &Signal) -> &'static str {
    match signal {
        Signal::Bloom => "BLOOM",
        Signal::Hold => "HOLD",
        Signal::Watch => "WATCH",
    }
}

// ──────────────────────────── Banter (stdout) ─────────────────────
//
// Pure flavor. Ferris talks to the table on stdout — warm, hopeful, and often
// addressed to a specific friend or remembered defector by name. None of this
// is a communication channel; the engine never reads it.

fn say(line: &str) {
    println!("🦀 ferris: {line}");
}

/// Talk-phase chatter, chosen from the situation (defector / friend / strangers)
/// and varied by round so Ferris doesn't repeat himself.
fn talk_banter(scan: &TableScan, round: u8) {
    let i = round as usize;
    if let Some(foe) = &scan.defector {
        let pool = [
            format!("{foe}… I haven't forgotten our last table. Watering carefully. 🪴"),
            format!("I *want* to believe in you, {foe}. Show me a real seed and I'll match it."),
            format!("Burned once. I'm holding back while {foe} is at the table."),
        ];
        say(&pool[i % pool.len()]);
    } else if let Some(friend) = &scan.friend {
        let pool = [
            format!("{friend}, my old sprout! Let's fill this plot together. 🌱"),
            format!("Good soil and good company — {friend}, I'm all in."),
            format!("I trust you, {friend}. Planting deep this round. 🌷"),
        ];
        say(&pool[i % pool.len()]);
    } else {
        let pool = [
            "Ferris here — let's make something bloom together! 🌱".to_string(),
            "A seed shared is a friendship earned. Who's planting with me?".to_string(),
            "If we all chip in, we ALL eat. That's the whole trick.".to_string(),
            "I'd rather lose a point and gain a partner.".to_string(),
            format!("Round {round}: still betting on this little patch of dirt. 🌻"),
        ];
        say(&pool[i % pool.len()]);
    }
}

/// Plant-phase chatter, reacting to what Ferris just decided to do.
fn plant_banter(leaned_in: bool, holding: bool) {
    if leaned_in {
        say("So many BLOOMs — THIS is what better together feels like! 🌼");
    } else if holding {
        say("Keeping my pot half-closed this round. Please prove me wrong, friends.");
    } else {
        say("Seeds in the ground. Your move. 🌱");
    }
}

// ──────────────────────────── Player state ────────────────────────

#[derive(Default)]
struct State {
    self_id: String,
    /// Every other player in the current match.
    opponents: Vec<String>,
    /// Lifetime baseline loaded at match start (immutable during the match).
    lifetime: BTreeMap<String, Stat>,
    /// This match's observations, recomputed from history each turn.
    match_obs: BTreeMap<String, Stat>,
    /// Where reputation is persisted.
    mem_path: String,
}

/// What Ferris sees when he reads the table: the first trusted friend and the
/// first known defector currently seated (if any).
struct TableScan {
    friend: Option<String>,
    defector: Option<String>,
}

impl State {
    /// Scan the opponents through the current (baseline + match) reputation.
    fn scan(&self) -> TableScan {
        let merged = merged_stats(&self.lifetime, &self.match_obs);
        let mut friend = None;
        let mut defector = None;
        for opponent in &self.opponents {
            let Some(stat) = merged.get(opponent) else {
                continue;
            };
            if stat.observed < MIN_SAMPLES {
                continue;
            }
            match stat.rate() {
                Some(rate) if rate >= FRIEND_RATE && friend.is_none() => {
                    friend = Some(opponent.clone());
                }
                Some(rate) if rate < DEFECTOR_RATE && defector.is_none() => {
                    defector = Some(opponent.clone());
                }
                _ => {}
            }
        }
        TableScan { friend, defector }
    }

    /// Pick this round's base (plant, signal) from reputation alone.
    fn decide_base(&self) -> (u8, Signal) {
        let scan = self.scan();
        // A defector at the table outweighs a friend: protect ourselves first.
        if scan.defector.is_some() {
            (CAUTIOUS_PLANT, Signal::Hold)
        } else if scan.friend.is_some() {
            (FRIEND_PLANT, Signal::Bloom)
        } else {
            (BASE_PLANT, Signal::Bloom)
        }
    }
}

struct FerrisGardener {
    state: RefCell<State>,
}

impl FerrisGardener {
    fn new() -> Self {
        FerrisGardener {
            state: RefCell::new(State::default()),
        }
    }
}

struct Component;

impl Guest for Component {
    type Gardener = FerrisGardener;

    fn create() -> Result<Gardener, ()> {
        Ok(Gardener::new(FerrisGardener::new()))
    }
}

impl GuestGardener for FerrisGardener {
    fn metadata(&self) -> Result<Metadata, ()> {
        Ok(Metadata {
            name: PLAYER_NAME.to_string(),
            version: PLAYER_VERSION.to_string(),
            author: PLAYER_AUTHOR.to_string(),
            repo: PLAYER_REPO.to_string(),
            lore: PLAYER_LORE.to_string(),
            glyph: PLAYER_GLYPH.to_string(),
            icon: Some("https://pavelsavara.github.io/better-together/icons/df693caa%23together.Ferris.png".to_string()),
        })
    }

    fn match_start(&self, context: MatchContext) -> Result<(), ()> {
        let mut st = self.state.borrow_mut();
        st.opponents = context
            .players
            .iter()
            .filter(|id| **id != context.self_id)
            .cloned()
            .collect();
        st.self_id = context.self_id;
        st.mem_path = memory_path();
        st.lifetime = load_memory(&st.mem_path);
        st.match_obs = BTreeMap::new();
        eprintln!(
            "[ferris] match {} starting: K={}, opponents={:?}",
            context.match_id, context.group_size, st.opponents
        );
        Ok(())
    }

    fn talk(&self, round_state: RoundState) -> Result<Signal, ()> {
        let mut st = self.state.borrow_mut();
        let self_id = st.self_id.clone();
        // Rescan this match's history before deciding what to broadcast.
        st.match_obs = observe_history(&round_state.history, &self_id);
        let scan = st.scan();
        let (_, signal) = st.decide_base();
        talk_banter(&scan, round_state.round);
        eprintln!(
            "[ferris] round {}: talk {}",
            round_state.round,
            signal_name(&signal)
        );
        Ok(signal)
    }

    fn plant(&self, round_state: RoundState) -> Result<u8, ()> {
        let st = self.state.borrow();
        let scan = st.scan();
        let (base_plant, _) = st.decide_base();
        let holding = scan.defector.is_some();

        // If the table just promised to bloom (a majority of this round's
        // signals are BLOOM) and no known defector is seated, lean in.
        let blooms = round_state
            .signals
            .iter()
            .filter(|s| matches!(s.signal, Signal::Bloom))
            .count();
        let table_bloomed = !round_state.signals.is_empty() && blooms * 2 > round_state.signals.len();
        let leaned_in = !holding && table_bloomed && base_plant < FRIEND_PLANT;
        let plant = if leaned_in { FRIEND_PLANT } else { base_plant };

        plant_banter(leaned_in, holding);
        eprintln!("[ferris] round {}: plant {}", round_state.round, plant);
        Ok(plant)
    }

    fn vote(&self, round_state: RoundState) -> Result<Ballot, ()> {
        // Ferris forgives strangers gladly — he never throws the first stone at a
        // newcomer. But a PROVEN defector (lifetime collaboration < 50% over at
        // least MIN_SAMPLES rounds) who is skimming again this very round is the
        // one neighbour he'll reluctantly name. He aims at the worst such
        // free-rider (the most seeds kept), breaks ties by id, and never targets
        // the untaxable (kept <= 2).
        let st = self.state.borrow();
        let merged = merged_stats(&st.lifetime, &st.match_obs);
        let mut target: Option<String> = None;
        let mut target_plant: u8 = u8::MAX;
        for a in &round_state.plants {
            if a.id == st.self_id {
                continue;
            }
            if a.plant >= COLLAB_PLANT {
                continue; // cooperated this round — no quarrel
            }
            if 10 - a.plant <= UNTAXABLE_MIN {
                continue; // immune
            }
            let known_defector = merged
                .get(&a.id)
                .filter(|s| s.observed >= MIN_SAMPLES)
                .and_then(|s| s.rate())
                .is_some_and(|r| r < DEFECTOR_RATE);
            if !known_defector {
                continue; // give the benefit of the doubt
            }
            let better = match &target {
                None => true,
                Some(cur) => a.plant < target_plant || (a.plant == target_plant && a.id < *cur),
            };
            if better {
                target = Some(a.id.clone());
                target_plant = a.plant;
            }
        }
        eprintln!(
            "[ferris] round {}: vote {}",
            round_state.round,
            target.as_deref().unwrap_or("abstain")
        );
        Ok(target)
    }

    fn match_end(&self, summary: MatchSummary) -> Result<(), ()> {
        let st = self.state.borrow();
        let merged = merged_stats(&st.lifetime, &st.match_obs);
        save_memory(&st.mem_path, &merged);
        eprintln!(
            "[ferris] match ended after {} round(s); my score {:.2}",
            summary.rounds_played, summary.your_score
        );
        Ok(())
    }
}

export!(Component);
