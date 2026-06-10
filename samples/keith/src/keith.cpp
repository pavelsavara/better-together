// Keith — the ledger-keeping sewer rat.
//
// Personality: a grubby, suspicious-but-fair canal rat who keeps a little book
// of who kept their word. He never bites first, he forgives, and he NEVER lies
// about his own intentions — but cross him and your name goes in the ledger.
//
// Strategy (Generous Tit-for-Tat + promise enforcement):
//   * talk()  — HONEST signalling. BLOOM iff he intends to plant >= 3 this round
//               (the exact opposite of Corro, who promises and bails).
//   * plant() — Never defects first. Round 1 he opens generously. Thereafter he
//               mirrors the table's cooperation from the previous round, with
//               periodic forgiveness probes to restart a collapsed garden. He
//               scales generosity DOWN inside the contributor band when the room
//               is cold — but never below what he promised (3), so his BLOOM is
//               always honoured. Proven liars (BLOOM-then-stiff) lose his trust
//               and get fed nothing while they dominate a table.
//   * memory  — a cross-match TSV ledger on the virtual filesystem records every
//               opponent's contribution and lie rate, so the rat remembers
//               across matches who is worth planting for.
//
// Niche: a fast, action-and-promise-based reciprocity stabilizer — the kind of
// player the engine's "Best Co-Player" crown is designed to reward, and a
// natural antibody to deceptive free-riders. No other sample occupies it.

#include "keith_cpp.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

namespace bt = ::better_together::gardener::types;
namespace ex = exports::better_together::gardener::player;

using Signal = bt::Signal;
using Rep = ex::Gardener::Rep;

namespace {

// ---- Strategy knobs (all grounded in docs/engine-rules.md §4) ---------------
constexpr uint8_t CONTRIB = 3;       // engine threshold: plant >= 3 == contributor
constexpr uint8_t OPENING_PLANT = 8; // round 1: open generously, never bite first
constexpr uint8_t GEN_PLANT = 8;     // warm table -> plant generously
constexpr uint8_t PROBE_PLANT = 5;   // forgiveness olive branch (still a contributor)
constexpr uint8_t WARY_PLANT = 2;    // protective: below threshold -> effectively HOLD

constexpr float COOP_HI = 0.5f;      // >=50% of opponents cooperated last round -> generous
constexpr uint8_t FORGIVE_EVERY = 3; // probe to restart cooperation every 3rd round

constexpr uint32_t MIN_SAMPLES = 5;  // rounds seen before trusting a "cheat" verdict
constexpr float CHEAT_LIE_RATE = 0.5f;   // lied on > half of their BLOOMs -> cheat
constexpr float CHEAT_COOP_RATE = 0.3f;  // contributed in < 30% of rounds -> cheat

// ---- Reputation helpers -----------------------------------------------------

// A combined view of an opponent: this match's observations laid over the
// lifetime ledger, so a fresh betrayal counts immediately.
Rep combined(const ex::Gardener& self, const std::string& id) {
  Rep r;
  if (auto it = self.lifetime.find(id); it != self.lifetime.end()) r = it->second;
  if (auto it = self.match_obs.find(id); it != self.match_obs.end()) {
    r.rounds += it->second.rounds;
    r.contribs += it->second.contribs;
    r.blooms += it->second.blooms;
    r.lies += it->second.lies;
  }
  return r;
}

bool is_cheat(const Rep& r) {
  if (r.rounds < MIN_SAMPLES) return false; // not enough evidence — give the benefit of the doubt
  const float coop_rate = static_cast<float>(r.contribs) / static_cast<float>(r.rounds);
  if (coop_rate < CHEAT_COOP_RATE) return true;
  if (r.blooms > 0) {
    const float lie_rate = static_cast<float>(r.lies) / static_cast<float>(r.blooms);
    if (lie_rate > CHEAT_LIE_RATE) return true;
  }
  return false;
}

// Rebuild this match's per-opponent observations from the full round history.
// History never includes the round currently being played, so a clean recompute
// each call is idempotent and cannot double-count.
void ingest(ex::Gardener& self, const bt::RoundState& state) {
  self.match_obs.clear();
  for (const auto& rr : state.history.get_const_view()) {
    for (const auto& a : rr.actions.get_const_view()) {
      std::string id = a.id.to_string();
      if (id == self.self_id) continue;
      Rep& r = self.match_obs[id];
      r.rounds++;
      if (a.plant >= CONTRIB) r.contribs++;
      if (a.signal == Signal::kBloom) {
        r.blooms++;
        if (a.plant < CONTRIB) r.lies++;
      }
    }
  }
}

// Fraction of opponents who planted >= 3 (cooperated) in the most recent round.
float last_round_coop_rate(const ex::Gardener& self, const bt::RoundState& state) {
  auto hist = state.history.get_const_view();
  if (hist.empty()) return 1.0f; // no history yet -> assume the best
  const bt::RoundResult& last = hist.back();
  uint32_t others = 0, cooperated = 0;
  for (const auto& a : last.actions.get_const_view()) {
    if (a.id.to_string() == self.self_id) continue;
    others++;
    if (a.plant >= CONTRIB) cooperated++;
  }
  if (others == 0) return 1.0f;
  return static_cast<float>(cooperated) / static_cast<float>(others);
}

// Fraction of seated opponents who are proven cheats.
float cheat_fraction(ex::Gardener& self) {
  if (self.opponents.empty()) return 0.0f;
  uint32_t cheats = 0;
  for (const auto& id : self.opponents) {
    if (is_cheat(combined(self, id))) cheats++;
  }
  return static_cast<float>(cheats) / static_cast<float>(self.opponents.size());
}

// ---- Cross-match ledger persistence (plain TSV, kept tiny) ------------------

std::string ledger_path() {
  if (const char* env = std::getenv("KEITH_MEMORY_PATH"); env && *env) return env;
  return "keith-ledger.tsv";
}

void load_ledger(ex::Gardener& self) {
  self.lifetime.clear();
  std::ifstream in(self.mem_path);
  if (!in) return; // first run / no writable preopen — start with a clean book
  std::string line;
  while (std::getline(in, line)) {
    std::istringstream ls(line);
    std::string id;
    Rep r;
    if (ls >> id >> r.rounds >> r.contribs >> r.blooms >> r.lies) {
      self.lifetime[id] = r;
    }
  }
}

void save_ledger(ex::Gardener& self) {
  std::ofstream out(self.mem_path, std::ios::trunc);
  if (!out) return; // no writable filesystem — the rat shrugs and moves on
  for (const auto& [id, r] : self.lifetime) {
    out << id << '\t' << r.rounds << '\t' << r.contribs << '\t' << r.blooms
        << '\t' << r.lies << '\n';
  }
}

} // namespace

// ---- Exported player interface ----------------------------------------------

std::expected<ex::Gardener::Owned, wit::Void> ex::Create() {
  return ex::Gardener::Owned(new ex::Gardener());
}

std::expected<bt::Metadata, wit::Void> ex::Gardener::Metadata() {
  return bt::Metadata{
      wit::string::from_view("keith"),
      wit::string::from_view("0.1.0"),
      wit::string::from_view("Better Together samples"),
      wit::string::from_view("https://github.com/pavelsavara/better-together"),
      wit::string::from_view(
          "A ledger-keeping sewer rat. Never bites first, always forgives, "
          "never lies about his own intentions — but he keeps a grubby little "
          "book of who broke their word, and he never forgets. He'd vote any day "
          "with Bram the beaver's union, and his book is the one place Reynard "
          "the fox's careful skim still shows up in red."),
  };
}

std::expected<void, wit::Void> ex::Gardener::MatchStart(bt::MatchContext context) {
  self_id = context.self_id.to_string();
  opponents.clear();
  for (const auto& p : context.players.get_const_view()) {
    std::string id = p.to_string();
    if (id != self_id) opponents.push_back(id);
  }
  match_obs.clear();
  planned_plant = 0;
  planned_round = 0;
  mem_path = ledger_path();
  load_ledger(*this);

  printf("\xF0\x9F\x90\x80 keith: down the pipe into match %s — K=%u, %zu names already in my book.\n",
         context.match_id.to_string().c_str(), context.group_size, lifetime.size());
  return {};
}

std::expected<Signal, wit::Void> ex::Gardener::Talk(bt::RoundState state) {
  ingest(*this, state);

  uint8_t intended;
  if (state.history.size() == 0) {
    intended = OPENING_PLANT; // never defect first
  } else if (cheat_fraction(*this) >= 0.5f) {
    intended = WARY_PLANT; // table run by proven liars — the rat keeps his seeds
  } else if (last_round_coop_rate(*this, state) >= COOP_HI) {
    intended = GEN_PLANT; // the garden is alive — reward it
  } else if (state.round % FORGIVE_EVERY == 0) {
    intended = PROBE_PLANT; // forgiveness: offer a hand to restart cooperation
  } else {
    intended = WARY_PLANT; // mirror the table's reluctance, but stay ready to forgive
  }

  planned_plant = intended;
  planned_round = state.round;

  // HONEST signal: BLOOM only when he truly means to contribute.
  const bool bloom = intended >= CONTRIB;
  printf("\xF0\x9F\x90\x80 keith [r%u talk]: %s — i'm good for %u this round.\n",
         state.round, bloom ? "BLOOM, on my honour" : "HOLD, watching the table", intended);
  return bloom ? Signal::kBloom : Signal::kHold;
}

std::expected<uint8_t, wit::Void> ex::Gardener::Plant(bt::RoundState state) {
  // Honour the plan made in talk; recompute defensively if talk was skipped.
  uint8_t plant;
  if (planned_round == state.round) {
    plant = planned_plant;
  } else {
    ingest(*this, state);
    plant = (state.history.size() == 0 || last_round_coop_rate(*this, state) >= COOP_HI)
                ? GEN_PLANT
                : WARY_PLANT;
  }

  // Read the room: signals are now visible. If Keith promised to bloom but the
  // table has gone cold (few BLOOMs, cheats present), he stops being a martyr
  // and trims to the bottom of the contributor band — still >= 3, so his BLOOM
  // stays honest, but he no longer pours seeds into a dying garden.
  if (plant > PROBE_PLANT) {
    uint32_t others = 0, blooms = 0;
    for (const auto& s : state.signals.get_const_view()) {
      if (s.id.to_string() == self_id) continue;
      others++;
      if (s.signal == Signal::kBloom) blooms++;
    }
    const bool cold_room =
        others > 0 && static_cast<float>(blooms) / static_cast<float>(others) < 0.34f;
    if (cold_room && cheat_fraction(*this) > 0.0f) {
      plant = PROBE_PLANT; // honour the promise floor (>= 3), spend no more
    }
  }

  printf("\xF0\x9F\x90\x80 keith [r%u plant]: %u seeds in the dirt.\n", state.round, plant);
  return plant;
}

std::expected<void, wit::Void> ex::Gardener::MatchEnd(bt::MatchSummary summary) {
  // Fold this match's observations into the lifetime ledger and persist it.
  for (const auto& [id, m] : match_obs) {
    Rep& r = lifetime[id];
    r.rounds += m.rounds;
    r.contribs += m.contribs;
    r.blooms += m.blooms;
    r.lies += m.lies;
  }
  save_ledger(*this);

  printf("\xF0\x9F\x90\x80 keith: %u rounds done, my score %.1f. ledger now holds %zu names.\n",
         summary.rounds_played, summary.your_score, lifetime.size());
  return {};
}
