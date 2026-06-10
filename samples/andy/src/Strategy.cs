// Andy's brain — pure, binding-independent strategy logic.
//
// This file deliberately depends on NOTHING that wit-bindgen generates. The
// generated export glue (AndyImpl.cs) translates the Component Model records
// into the small plain types below and calls into `Brain`. Keeping the strategy
// here makes it trivial to unit-test and immune to binding churn.

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Andy;

/// The three cheap-talk broadcasts, mirrored from the WIT `signal` enum.
internal enum Sig
{
    Bloom,
    Hold,
    Watch,
}

/// What one player did in a resolved round (a flattened `player-action`).
internal readonly record struct Deed(string Id, int Plant, Sig Signal);

/// A resolved round (a flattened `round-result`) — only the bits Andy reads.
internal readonly record struct Round(IReadOnlyList<Deed> Actions);

/// Andy's tunable knobs. Public consts so the README and tests can reference
/// the exact numbers.
internal static class Knobs
{
    /// Engine contributor threshold: a plant of this many seeds or more counts.
    internal const int Stake = 3;
    /// Round 1 (and every forgiveness round): open soft, belly exposed.
    internal const int OpenPlant = 8;
    /// Extra seeds when a trusted friend is at the table and no foe is.
    internal const int FriendBonus = 2;
    /// Seeds pulled back when a within-match foe is seated (curl into spines).
    internal const int FoePenalty = 3;
    /// Every Nth round, un-roll and plant generously to test for cooperation.
    internal const int ForgiveEvery = 3;
    /// Honest signalling: BLOOM when the planned plant is at least this many.
    internal const int BloomThreshold = 5;

    /// A player is "collaborative" in a round if they plant at least this many.
    internal const int CollabPlant = 6;

    /// A target who kept this many seeds or fewer is immune from the tax.
    internal const int UntaxableMin = 2;
    /// Rounds of defection (plant < Stake) before a within-match foe is
    /// "persistent" enough to name in the vote.
    internal const int PersistentFoe = 2;

    // ── Cross-match friend memory (trust in [0,1], neutral = 0.5) ──
    /// Trust at/above which a remembered player is treated as a friend.
    internal const double FriendTrust = 0.65;
    /// Weight given to THIS match's observed collaboration when folding trust.
    internal const double Alpha = 0.40;
    /// Per-match pull of every stored trust back toward neutral — slow decay,
    /// so friendships cool if they aren't refreshed but never snap.
    internal const double Decay = 0.97;
    /// Drop stored entries this close to neutral (keeps the file tidy).
    internal const double NeutralEps = 0.02;
}

/// The on-disk friend-book. Foes are intentionally NOT persisted — Andy
/// uncurls between matches.
internal sealed class FriendBook
{
    [JsonPropertyName("version")]
    public int Version { get; set; } = 1;

    /// id -> trust in [0,1], neutral 0.5.
    [JsonPropertyName("friends")]
    public Dictionary<string, double> Friends { get; set; } = new();

    /// Load the friend-book; any failure (no filesystem, missing/garbled file)
    /// yields an empty book — never fatal.
    internal static FriendBook Load(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new FriendBook();
            }
            var text = File.ReadAllText(path);
            return JsonSerializer.Deserialize(text, AndyJson.Default.FriendBook) ?? new FriendBook();
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"[andy] starting with an empty friend-book ({e.GetType().Name}).");
            return new FriendBook();
        }
    }

    /// Persist the friend-book. Best-effort: a write failure is logged, never
    /// thrown.
    internal void Save(string path)
    {
        try
        {
            File.WriteAllText(path, JsonSerializer.Serialize(this, AndyJson.Default.FriendBook));
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"[andy] could not persist friend-book ({e.GetType().Name}).");
        }
    }

    internal bool IsFriend(string id) =>
        Friends.TryGetValue(id, out var t) && t >= Knobs.FriendTrust;

    /// Env var (wasi:cli/environment) overriding where the friend-book lives.
    private const string MemPathEnv = "ANDY_MEMORY_PATH";
    /// Default friend-book file, relative to the first preopened directory.
    private const string DefaultMemPath = "andy-memory.json";

    /// Resolve the friend-book path: env override, else the default name.
    internal static string ResolvePath() =>
        Environment.GetEnvironmentVariable(MemPathEnv) is { Length: > 0 } p
            ? p
            : DefaultMemPath;
}

/// Source-generated JSON context — trim/NativeAOT-safe (no reflection).
[JsonSourceGenerationOptions(WriteIndented = true, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(FriendBook))]
internal partial class AndyJson : JsonSerializerContext
{
}

/// One seated player's strategy state for a single match.
internal sealed class Brain
{
    private readonly string _memoryPath;
    private string _selfId = "andy";
    private readonly HashSet<string> _matchFoes = new();   // within-match only
    private FriendBook _book = new();

    // The action decided in `talk`, replayed honestly in `plant`.
    private int _round;
    private int _plannedPlant;
    private bool _hasPlan;
    // The most complete history seen this match (match-end carries none).
    private IReadOnlyList<Round> _lastHistory = System.Array.Empty<Round>();

    internal Brain(string memoryPath)
    {
        _memoryPath = memoryPath;
        _book = FriendBook.Load(memoryPath);
    }

    /// Begin a new match: clear within-match foes (the hedgehog uncurls).
    internal void MatchStart(string selfId)
    {
        _selfId = string.IsNullOrEmpty(selfId) ? "andy" : selfId;
        _matchFoes.Clear();
        _hasPlan = false;
    }

    /// Talk phase: pick this round's plant plan and announce it honestly.
    internal Sig Talk(int round, IReadOnlyList<Round> history)
    {
        _lastHistory = history;
        _round = round;
        _plannedPlant = Decide(round, history);
        _hasPlan = true;
        var sig = _plannedPlant >= Knobs.BloomThreshold ? Sig.Bloom : Sig.Hold;
        Banter.Talk(round, _plannedPlant, sig, _matchFoes.Count > 0);
        return sig;
    }

    /// Plant phase: commit the seeds promised in `talk`. Andy reads `history`,
    /// never the current round's signals — deeds over words.
    internal int Plant(int round, IReadOnlyList<Round> history)
    {
        _lastHistory = history;
        int plant = _hasPlan && round == _round ? _plannedPlant : Decide(round, history);
        Banter.Plant(round, plant);
        return Clamp(plant);
    }

    /// Vote phase: forgiveness stays primary. Andy holds his fire until he has
    /// extended at least one olive branch (a forgiveness round has come and
    /// gone), then names the table's most persistent free-rider — someone who
    /// has defected (planted below the stake) in at least `PersistentFoe` rounds
    /// this match and is still skimming now. He NEVER crosses a guild member
    /// (Bram's honest coalition) or a remembered friend, and never the untaxable
    /// (kept <= 2).
    internal string? Vote(int round, IReadOnlyList<Round> history, IReadOnlyList<Deed> plants)
    {
        // Give the table time to warm: no vote until a forgiveness round has passed.
        if (round <= Knobs.ForgiveEvery)
        {
            Banter.Abstain(round);
            return null;
        }

        // Count each opponent's defections (plant < Stake) across the match.
        var defections = new Dictionary<string, int>();
        foreach (var r in history)
        {
            foreach (var deed in r.Actions)
            {
                if (deed.Id != _selfId && deed.Plant < Knobs.Stake)
                {
                    defections[deed.Id] = defections.GetValueOrDefault(deed.Id) + 1;
                }
            }
        }

        // Aim at the most persistent free-rider revealed in THIS round's plants.
        Deed? best = null;
        int bestDefections = 0;
        foreach (var deed in plants)
        {
            if (deed.Id == _selfId || IsGuild(deed.Id) || _book.IsFriend(deed.Id))
            {
                continue; // never a guild member or a remembered friend
            }
            int kept = 10 - deed.Plant;
            if (kept <= Knobs.UntaxableMin)
            {
                continue; // immune
            }
            int d = defections.GetValueOrDefault(deed.Id);
            if (d < Knobs.PersistentFoe)
            {
                continue; // refused the olive branch too few times — still forgiven
            }
            if (best is null
                || d > bestDefections
                || (d == bestDefections && kept > 10 - best.Value.Plant)
                || (d == bestDefections && kept == 10 - best.Value.Plant
                    && string.CompareOrdinal(deed.Id, best.Value.Id) < 0))
            {
                best = deed;
                bestDefections = d;
            }
        }

        if (best is null)
        {
            Banter.Abstain(round);
            return null;
        }
        Banter.Vote(round, best.Value.Id, bestDefections);
        return best.Value.Id;
    }

    /// Fold this match into the friend-book and persist it.
    internal void MatchEnd()
    {
        FoldFriends(_lastHistory);
        _book.Save(_memoryPath);
        Banter.MatchEnd(_book.Friends.Count);
    }

    // ──────────────────────── core decision ────────────────────────

    private int Decide(int round, IReadOnlyList<Round> history)
    {
        // Refresh the within-match foe set from everything seen so far.
        UpdateFoes(history);

        // Round 1 (or no resolved history yet): open soft, belly out.
        if (history.Count == 0)
        {
            return Knobs.OpenPlant;
        }

        // Mirror the table's DEEDS: the average plant of everyone but me, last
        // round. This is the heart of Tit-for-Tat.
        int plant = (int)Math.Round(AverageOthersLastRound(history));

        // Periodic forgiveness: un-roll and plant generously to test whether a
        // cold table can be coaxed back to cooperation.
        if (round % Knobs.ForgiveEvery == 0)
        {
            plant = Math.Max(plant, Knobs.OpenPlant);
        }

        bool foeSeated = _matchFoes.Count > 0;
        bool friendSeated = SeatedFriendPresent(history);

        // A remembered friend (and no foe) warms him up; a within-match foe
        // makes him curl his seeds back behind his spines.
        if (friendSeated && !foeSeated)
        {
            plant += Knobs.FriendBonus;
        }
        if (foeSeated)
        {
            plant -= Knobs.FoePenalty;
        }

        return Clamp(plant);
    }

    /// Mark anyone who has defected (planted below the contributor stake) at any
    /// point this match as a within-match foe. Cumulative within the match,
    /// forgotten at the next match-start.
    private void UpdateFoes(IReadOnlyList<Round> history)
    {
        if (history.Count == 0)
        {
            return;
        }
        foreach (var deed in history[^1].Actions)
        {
            if (deed.Id != _selfId && deed.Plant < Knobs.Stake)
            {
                _matchFoes.Add(deed.Id);
            }
        }
    }

    private double AverageOthersLastRound(IReadOnlyList<Round> history)
    {
        var last = history[^1];
        long sum = 0;
        int n = 0;
        foreach (var deed in last.Actions)
        {
            if (deed.Id == _selfId)
            {
                continue;
            }
            sum += deed.Plant;
            n++;
        }
        return n == 0 ? Knobs.OpenPlant : (double)sum / n;
    }

    /// Is any player seated this match a remembered friend? We read the seated
    /// ids off the most recent round's actions (everyone is listed there).
    private bool SeatedFriendPresent(IReadOnlyList<Round> history)
    {
        foreach (var deed in history[^1].Actions)
        {
            if (deed.Id != _selfId && _book.IsFriend(deed.Id))
            {
                return true;
            }
        }
        return false;
    }

    /// Fold each opponent's collaboration this match into their trust, then pull
    /// every stored trust gently toward neutral (slow decay) and prune.
    private void FoldFriends(IReadOnlyList<Round> history)
    {
        if (history.Count > 0)
        {
            var collab = new Dictionary<string, int>();
            var seen = new Dictionary<string, int>();
            foreach (var r in history)
            {
                foreach (var deed in r.Actions)
                {
                    if (deed.Id == _selfId)
                    {
                        continue;
                    }
                    seen[deed.Id] = seen.GetValueOrDefault(deed.Id) + 1;
                    if (deed.Plant >= Knobs.CollabPlant)
                    {
                        collab[deed.Id] = collab.GetValueOrDefault(deed.Id) + 1;
                    }
                }
            }

            foreach (var (id, rounds) in seen)
            {
                double rate = rounds == 0 ? 0.5 : (double)collab.GetValueOrDefault(id) / rounds;
                double old = _book.Friends.TryGetValue(id, out var t) ? t : 0.5;
                _book.Friends[id] = (old * (1 - Knobs.Alpha)) + (rate * Knobs.Alpha);
            }
        }

        // Slow decay toward neutral for ALL friends (even those absent this
        // match), then drop anything that has settled back to neutral.
        foreach (var id in _book.Friends.Keys.ToList())
        {
            double decayed = 0.5 + ((_book.Friends[id] - 0.5) * Knobs.Decay);
            if (Math.Abs(decayed - 0.5) < Knobs.NeutralEps)
            {
                _book.Friends.Remove(id);
            }
            else
            {
                _book.Friends[id] = decayed;
            }
        }
    }

    /// The honest coalition Andy stands with — Bram's guild (the beaver, his
    /// rallied members Micro and Gopher) and the other arbiter, Keith. He never
    /// aims the tax at any of them.
    private static bool IsGuild(string id)
    {
        var lower = id.ToLowerInvariant();
        return lower.Contains("bram") || lower.Contains("micro")
            || lower.Contains("gopher") || lower.Contains("keith");
    }

    private static int Clamp(int plant) => Math.Clamp(plant, 0, 10);
}
